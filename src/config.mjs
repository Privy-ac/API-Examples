import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Load ../.env when present. process.loadEnvFile ships with Node 20.12+; values already
// set in the shell take precedence.
const envPath = fileURLToPath(new URL('../.env', import.meta.url))
if (existsSync(envPath) && typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(envPath)
}

export const DEFAULT_BASE_URL = 'https://privy.ac/api/v1'

export const config = {
    baseUrl: (process.env.PRIVY_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ''),
    apiKey: process.env.PRIVY_API_KEY,
}

/** Exits with a helpful message when an example needs a key that is not configured. */
export function requireApiKey(scope) {
    if (config.apiKey) return config.apiKey
    console.error(
        `This example needs a Privy API key with the "${scope}" scope.\n` +
        'Create one at https://privy.ac/docs/api-keys, then set PRIVY_API_KEY in .env.',
    )
    process.exit(1)
}

/** Well-known mints used by the examples. */
export const MINTS = {
    SOL: 'So11111111111111111111111111111111111111112',
    POPCAT: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr',
}
