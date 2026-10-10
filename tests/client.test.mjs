import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PrivyApiError, PrivyClient, buildPath, formatUnits, parseRetryAfter, parseUnits } from '../src/client.mjs'

const json = (status, body, headers = {}) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

function mockFetch(...responses) {
    const calls = []
    const fn = async (url, init) => {
        calls.push({ url: String(url), init })
        const next = responses.shift()
        return typeof next === 'function' ? next() : next
    }
    return { fn, calls }
}

test('builds URLs with encoded path and query parameters, skipping empty values', async () => {
    const { fn, calls } = mockFetch(json(200, { data: [] }))
    const client = new PrivyClient({ baseUrl: 'https://x.test/api/v1/', apiKey: undefined, fetch: fn })
    await client.get('/tokens/{mint}', { params: { mint: 'a/b' }, query: { q: 'pop cat', limit: 5, cursor: undefined } })
    assert.equal(calls[0].url, 'https://x.test/api/v1/tokens/a%2Fb?q=pop+cat&limit=5')
    assert.equal(calls[0].init.headers['X-API-Key'], undefined)
})

test('sends X-API-Key and JSON body on POST', async () => {
    const { fn, calls } = mockFetch(json(201, { data: { ok: true } }, { 'x-request-id': 'rid-1' }))
    const client = new PrivyClient({ baseUrl: 'https://x.test', apiKey: 'pk_test', fetch: fn })
    const res = await client.post('/trade/buys', { amountLamports: '1000' })
    assert.equal(calls[0].init.method, 'POST')
    assert.equal(calls[0].init.headers['X-API-Key'], 'pk_test')
    assert.equal(calls[0].init.body, '{"amountLamports":"1000"}')
    assert.deepEqual(res.data, { ok: true })
    assert.equal(res.requestId, 'rid-1')
})

test('throws PrivyApiError with code and requestId, without leaking the key', async () => {
    const { fn } = mockFetch(json(403, { error: { code: 'INSUFFICIENT_SCOPE', message: 'Needs trade:intents', requestId: 'r9' } }))
    const client = new PrivyClient({ baseUrl: 'https://x.test', apiKey: 'pk_secret_value', fetch: fn })
    await assert.rejects(client.get('/me'), (error) => {
        assert.ok(error instanceof PrivyApiError)
        assert.equal(error.status, 403)
        assert.equal(error.code, 'INSUFFICIENT_SCOPE')
        assert.equal(error.requestId, 'r9')
        assert.ok(!error.message.includes('pk_secret_value'))
        return true
    })
})

test('retries GET on 429 honouring Retry-After', async () => {
    const { fn, calls } = mockFetch(
        json(429, { error: { code: 'RATE_LIMITED', message: 'slow down', requestId: 'a' } }, { 'retry-after': '0' }),
        json(200, { data: 1 }),
    )
    const client = new PrivyClient({ baseUrl: 'https://x.test', fetch: fn })
    const res = await client.get('/stats')
    assert.equal(calls.length, 2)
    assert.equal(res.data, 1)
})

test('never retries POST', async () => {
    const { fn, calls } = mockFetch(json(503, { error: { code: 'SERVICE_UNAVAILABLE', message: 'x', requestId: 'b' } }, { 'retry-after': '0' }))
    const client = new PrivyClient({ baseUrl: 'https://x.test', apiKey: 'k', fetch: fn })
    await assert.rejects(client.post('/trade/buys', {}), PrivyApiError)
    assert.equal(calls.length, 1)
})

test('auth: required fails fast without a key', async () => {
    const { fn, calls } = mockFetch()
    const client = new PrivyClient({ baseUrl: 'https://x.test', apiKey: undefined, fetch: fn })
    await assert.rejects(client.get('/holdings', { auth: 'required' }), { code: 'MISSING_API_KEY' })
    assert.equal(calls.length, 0)
})

test('times out with a TIMEOUT error', async () => {
    const fn = (_url, init) =>
        new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)))
    const client = new PrivyClient({ baseUrl: 'https://x.test', fetch: fn, timeoutMs: 20, maxRetries: 0 })
    await assert.rejects(client.get('/stats'), { code: 'TIMEOUT' })
})

test('paginate follows nextCursor', async () => {
    const { fn, calls } = mockFetch(
        json(200, { data: [1, 2], pagination: { limit: 2, hasMore: true, nextCursor: 'c2' } }),
        json(200, { data: [3], pagination: { limit: 2, hasMore: false, nextCursor: null } }),
    )
    const client = new PrivyClient({ baseUrl: 'https://x.test', apiKey: 'k', fetch: fn })
    const items = []
    for await (const item of client.paginate('/positions', { query: { limit: 2 } })) items.push(item)
    assert.deepEqual(items, [1, 2, 3])
    assert.match(calls[1].url, /cursor=c2/)
})

test('amount helpers are exact', () => {
    assert.equal(parseUnits('0.01', 9), '10000000')
    assert.equal(parseUnits('1', 9), '1000000000')
    assert.equal(formatUnits('23055587583', 9), '23.055587583')
    assert.equal(formatUnits('1000000000', 9), '1')
    assert.equal(formatUnits('5', 6), '0.000005')
    assert.equal(formatUnits(123456789012345678901234567890n, 18), '123456789012.34567890123456789')
    assert.throws(() => parseUnits('0.0000000001', 9), RangeError)
    assert.throws(() => parseUnits('1e9', 9), TypeError)
})

test('helpers: buildPath and parseRetryAfter', () => {
    assert.throws(() => buildPath('/positions/{id}', {}), TypeError)
    assert.equal(parseRetryAfter('3'), 3000)
    assert.equal(parseRetryAfter(null), null)
    assert.equal(parseRetryAfter(new Date(10_000).toUTCString(), 4_000), 6000)
})