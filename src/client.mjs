import { config } from './config.mjs'

const SAFE_METHODS = new Set(['GET', 'HEAD'])
const RETRYABLE_STATUS = new Set([429, 502, 503])

/** Error thrown for any non-2xx response. Never contains the API key. */
export class PrivyApiError extends Error {
    constructor({ status, code, message, requestId, retryAfter, method, path }) {
        super(`${method} ${path} failed: ${status} ${code} - ${message}${requestId ? ` (request ${requestId})` : ''}`)
        this.name = 'PrivyApiError'
        this.status = status
        this.code = code
        this.requestId = requestId ?? null
        this.retryAfter = retryAfter ?? null
    }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Parses Retry-After (seconds or HTTP date) into milliseconds. */
export function parseRetryAfter(value, now = Date.now()) {
    if (!value) return null
    const seconds = Number(value)
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
    const date = Date.parse(value)
    return Number.isNaN(date) ? null : Math.max(0, date - now)
}

/** Replaces {name} segments with URL-encoded values. */
export function buildPath(template, params = {}) {
    return template.replace(/\{(\w+)\}/g, (_, name) => {
        const value = params[name]
        if (value === undefined || value === null || value === '') throw new TypeError(`Missing path parameter "${name}"`)
        return encodeURIComponent(String(value))
    })
}

export class PrivyClient {
    /**
     * @param {object} [options]
     * @param {string} [options.baseUrl]   Defaults to PRIVY_API_BASE_URL or https://privy.ac/api/v1
     * @param {string} [options.apiKey]    Defaults to PRIVY_API_KEY
     * @param {number} [options.timeoutMs] Per-attempt timeout
     * @param {number} [options.maxRetries] Retries for GET requests only
     * @param {typeof fetch} [options.fetch]
     */
    constructor(options = {}) {
        this.baseUrl = (options.baseUrl ?? config.baseUrl).replace(/\/+$/, '')
        this.apiKey = options.apiKey ?? config.apiKey
        this.timeoutMs = options.timeoutMs ?? 15_000
        this.maxRetries = options.maxRetries ?? 2
        this.maxRetryDelayMs = options.maxRetryDelayMs ?? 30_000
        this.fetch = options.fetch ?? globalThis.fetch
    }

    get(path, options = {}) {
        return this.request({ ...options, method: 'GET', path })
    }

    post(path, body, options = {}) {
        return this.request({ ...options, method: 'POST', path, body })
    }

    /**
     * Sends a request and returns { data, pagination, requestId, rateLimit }.
     * Only GET requests are retried. POSTs that can move money are never retried
     * automatically; retry them yourself with the same idempotencyKey.
     */
    async request({ method = 'GET', path, params, query, body, auth = 'optional', signal }) {
        const url = new URL(this.baseUrl + buildPath(path, params))
        for (const [key, value] of Object.entries(query ?? {})) {
            if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
        }

        const headers = { Accept: 'application/json' }
        if (body !== undefined) headers['Content-Type'] = 'application/json'
        if (this.apiKey) headers['X-API-Key'] = this.apiKey
        else if (auth === 'required') {
            throw new PrivyApiError({
                status: 0, code: 'MISSING_API_KEY', message: 'Set PRIVY_API_KEY to call this endpoint.', method, path,
            })
        }

        const retries = SAFE_METHODS.has(method) ? this.maxRetries : 0
        for (let attempt = 0; ; attempt++) {
            const timeout = AbortSignal.timeout(this.timeoutMs)
            let response
            try {
                response = await this.fetch(url, {
                    method,
                    headers,
                    body: body === undefined ? undefined : JSON.stringify(body),
                    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
                })
            } catch (error) {
                if (error?.name === 'TimeoutError') {
                    if (attempt < retries) continue
                    throw new PrivyApiError({ status: 0, code: 'TIMEOUT', message: `No response within ${this.timeoutMs}ms`, method, path })
                }
                throw error
            }

            const requestId = response.headers.get('x-request-id')
            const payload = await response.json().catch(() => null)

            if (response.ok) {
                return {
                    data: payload?.data,
                    pagination: payload?.pagination ?? null,
                    requestId,
                    rateLimit: readRateLimit(response.headers),
                }
            }

            const retryAfter = parseRetryAfter(response.headers.get('retry-after'))
            if (attempt < retries && RETRYABLE_STATUS.has(response.status)) {
                const delay = retryAfter ?? 500 * 2 ** attempt
                if (delay <= this.maxRetryDelayMs) {
                    await sleep(delay)
                    continue
                }
            }

            throw new PrivyApiError({
                status: response.status,
                code: payload?.error?.code ?? 'HTTP_ERROR',
                message: payload?.error?.message ?? response.statusText,
                requestId: payload?.error?.requestId ?? requestId,
                retryAfter,
                method,
                path,
            })
        }
    }

    /** Iterates every item across cursor-paginated pages. */
    async *paginate(path, { query = {}, ...options } = {}) {
        let cursor
        do {
            const page = await this.get(path, { ...options, query: { ...query, cursor } })
            yield* page.data
            cursor = page.pagination?.hasMore ? page.pagination.nextCursor : null
        } while (cursor)
    }
}

function readRateLimit(headers) {
    const limit = headers.get('x-ratelimit-limit')
    if (limit === null) return null
    return {
        limit: Number(limit),
        remaining: Number(headers.get('x-ratelimit-remaining')),
        resetAt: new Date(Number(headers.get('x-ratelimit-reset')) * 1000),
    }
}

/** Converts a raw integer amount (string | bigint) to a decimal string without floats. */
export function formatUnits(raw, decimals) {
    const value = BigInt(raw)
    const negative = value < 0n
    const digits = (negative ? -value : value).toString().padStart(decimals + 1, '0')
    const whole = digits.slice(0, digits.length - decimals)
    const fraction = decimals > 0 ? digits.slice(-decimals).replace(/0+$/, '') : ''
    return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`
}

/** Converts a decimal string ("0.25") to a raw integer string. Rejects excess precision. */
export function parseUnits(amount, decimals) {
    const match = /^(\d+)(?:\.(\d+))?$/.exec(String(amount).trim())
    if (!match) throw new TypeError(`Invalid decimal amount: ${amount}`)
    const [, whole, fraction = ''] = match
    if (fraction.length > decimals) throw new RangeError(`${amount} has more than ${decimals} decimal places`)
    return (BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0')).toString()
}

export const LAMPORTS_PER_SOL = 1_000_000_000n

export const shortAddress = (address) => (address ? `${address.slice(0, 4)}…${address.slice(-4)}` : '-')

/** Prints a friendly error and exits. Used by the example scripts. */
export function handleError(error) {
    if (error instanceof PrivyApiError) {
        console.error(error.message)
        if (error.status === 401) console.error('Check PRIVY_API_KEY.')
        if (error.status === 403) console.error('Your key is missing a required scope. Create a key with that scope.')
        if (error.status === 429 && error.retryAfter !== null) console.error(`Rate limited. Retry in ${Math.ceil(error.retryAfter / 1000)}s.`)
    } else {
        console.error(error)
    }
    process.exitCode = 1
}