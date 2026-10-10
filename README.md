# Privy API Examples

Node.js examples for the Privy API, including token data, swap quotes, holdings, trading, and account activity.

The Privy API is a REST API at `https://privy.ac/api/v1`. Public endpoints (token search, trending tokens, token metadata, swap quotes, platform stats) need no credentials. Account and trading endpoints are scoped to the wallet that owns the developer API key.

Every example uses one small client (`src/client.mjs`) built on native `fetch`, with no runtime dependencies.

## Requirements

- Node.js 20.12 or newer
- npm

## Getting started

1. Clone this repository.
2. Create an API key at [privy.ac/docs/api-keys](https://privy.ac/docs/api-keys). You'll need to connect your wallet. The key is shown once, so copy it straight away.
3. Copy `.env.example` to `.env` and paste the key in.

```bash
git clone https://github.com/privy-ac/privy-api-examples.git
cd privy-api-examples
cp .env.example .env
```

## Installation

There are no runtime dependencies. Running `npm install` is optional; it only checks your Node version against `engines`. Check your version and run the first example:

```bash
node --version   # v20.12.0 or newer
npm run search
```

The public examples (01–04) work straight away, without an API key.

## Configuration

| Variable | Required | Description |
|---|---|---|
| `PRIVY_API_KEY` | For account and trading examples | Your developer API key. Sent as the `X-API-Key` header. |
| `PRIVY_API_BASE_URL` | No | Defaults to `https://privy.ac/api/v1`. |

`src/config.mjs` loads `.env` with Node's built-in `process.loadEnvFile`, so you don't need `dotenv`. Values already set in your shell take precedence. `.env` is git-ignored. Never commit it.

## Quick example

```js
import { PrivyClient } from './src/client.mjs'

const privy = new PrivyClient()
const { data } = await privy.get('/tokens/search', { query: { query: 'POPCAT', limit: 3 } })

for (const token of data) {
  console.log(`${token.symbol}  ${token.mint}  $${token.usdPrice}`)
}
```

## Available examples

| # | Command | Endpoint | Key needed |
|---|---|---|---|
| 01 | `npm run search -- POPCAT` | `GET /tokens/search` | No |
| 02 | `npm run trending` | `GET /tokens/trending` | No |
| 03 | `npm run token -- <mint>` | `GET /tokens/{mint}` | No |
| 04 | `npm run quote -- 0.01 <mint>` | `GET /quote` | No |
| 05 | `npm run holdings` | `GET /holdings` | `read:account` |
| 06 | `npm run positions` | `GET /positions`, `GET /positions/{id}` | `read:account` |
| 07 | `npm run activity` | `GET /activity` (cursor pagination) | `read:account` |
| 08 | `npm run points` | `GET /points` | `read:account` |
| 09 | `npm run buy -- 0.01 <mint> [--confirm]` | `GET /quote`, `POST /trade/buys` | `trade:intents` with `--confirm` |
| 10 | `npm run status -- <tradeId>` | `GET /trades/{id}/status` | `read:account` |
| 11 | `npm run sell -- <mint> [rawAmount] [--confirm]` | `GET /holdings`, `POST /trade/sells` | `trade:intents` with `--confirm` |
| 12 | `npm run account` | `GET /me` | `read:account` |

Each example is a standalone script. Arguments in `<angle brackets>` are required and `[square brackets]` are optional. Pass them after `--` so npm forwards them to the script.

## Project structure

```
privy-api-examples/
├── examples/           # One runnable script per endpoint (01–12)
├── src/
│   ├── client.mjs      # PrivyClient, PrivyApiError, formatUnits, parseUnits
│   └── config.mjs      # Loads .env and reads PRIVY_API_KEY / PRIVY_API_BASE_URL
├── test/
│   └── client.test.mjs # Unit tests for the client (no network access)
├── .env.example        # Template for your local .env
└── package.json        # npm scripts for every example
```

To use the client in your own project, copy `src/client.mjs` and `src/config.mjs`. They only depend on Node's standard library.

## Testing

```bash
npm test
```

The tests use Node's built-in test runner (`node --test`) and a stubbed `fetch`. They don't call the live API and don't need an API key. They cover request building, authentication headers, retries, `Retry-After` handling, error parsing and unit conversion.

## API authentication

Send your key in the `X-API-Key` header. The client does this automatically for any request marked `auth: 'required'`.

| Scope | Allows |
|---|---|
| `read:account` | Account details, holdings, positions, activity, points, trade status |
| `trade:intents` | Creating buy intents and sell authorizations |

A key can only see and act on the wallet that created it. Missing, invalid or revoked keys get `401`. A key without the needed scope gets `403`.

## Token amounts

The API returns on-chain amounts as raw integer strings, for example `"23055587583"`. To get a human-readable value, divide by `10 ** decimals`; each token's decimals are returned by `/tokens/{mint}`. SOL has 9 decimals, so 1 SOL is `1000000000` lamports.

Raw amounts can be larger than JavaScript numbers can hold exactly, so use `BigInt`:

```js
import { formatUnits, parseUnits } from './src/client.mjs'

formatUnits('23055587583', 9) // "23.055587583"
parseUnits('0.01', 9)         // 10000000n
```

## Trading

You can't make a trade with an API key alone. Every trade needs a signature from the wallet owner, made in their own wallet. These examples never sign anything, never ask for private keys and never send SOL.

**Buy**

1. `GET /quote` gives an indicative quote.
2. `POST /trade/buys` with `{ mint, amountLamports, slippageBps, idempotencyKey }` returns an intent plus an **unsigned** deposit transaction. Fees are included in the amount.
3. The wallet owner signs that transaction in their wallet.
4. You send it to `POST /trade/buys/{id}/deposit` as `{ signedTransaction }` before `depositExpiresAt`.
5. Track the trade with `GET /trades/{id}/status`. Cancel unused intents with `POST /trade/buys/{id}/cancel`.

Without `--confirm`, `npm run buy` is a dry run that only prints the request body. With `--confirm`, it creates the intent and prints the unsigned transaction. It stops there.

**Sell**

1. `GET /holdings` shows the tokens you can sell.
2. `POST /trade/sells` with `{ mint, amount, slippageBps, idempotencyKey }` returns an authorization message tied to this one trade.
3. The wallet owner signs the message bytes (for example with `wallet.signMessage`).
4. You send the base58-encoded signature to `POST /trade/sells/{id}/authorize` within 2 minutes.
5. Track execution and payout with `GET /trades/{id}/status`.

Always send an `idempotencyKey` with each trade request. If you retry with the same key, you get the same intent back instead of a second trade.

## Error handling

Errors come back in one consistent shape:

```json
{ "error": { "code": "INVALID_REQUEST", "message": "query is required.", "requestId": "…" } }
```

| Status | Typical codes | What to do |
|---|---|---|
| 400 | `INVALID_REQUEST` | Fix the parameters or body. |
| 401 | `MISSING_API_KEY`, `INVALID_API_KEY` | Check `PRIVY_API_KEY`. |
| 403 | `INSUFFICIENT_SCOPE` | Create a key with the required scope. |
| 404 | `NOT_FOUND` | Check the path or ID. |
| 429 | Rate limited | Wait for the `Retry-After` seconds, then retry. |
| 5xx | Upstream or server error | Retry with backoff. |

The client throws a `PrivyApiError` with `status`, `code`, `requestId` and `retryAfter`. For `GET` requests only, it automatically retries `429`, `502` and `503` responses and timeouts, following `Retry-After`. It never retries `POST` requests; resend them yourself with the same `idempotencyKey`. Each attempt times out after 15 seconds. Include the `requestId` when you contact support.

## Troubleshooting

| Problem | Fix |
|---|---|
| Your `.env` values are ignored | `.env` loading needs Node.js 20.12 or newer. Upgrade, or export the variables in your shell. |
| `MISSING_API_KEY: Set PRIVY_API_KEY to call this endpoint.` | Copy `.env.example` to `.env` and add your key, or export it in your shell. |
| `401 INVALID_API_KEY` | The key is wrong or revoked. Create a new one at [privy.ac/docs/api-keys](https://privy.ac/docs/api-keys). |
| `403 INSUFFICIENT_SCOPE` | The key lacks a scope the example needs (see the table above). Create a key with that scope. |
| Arguments are ignored | Put `--` before them, for example `npm run search -- BONK`. |
| `429` keeps happening | Run examples less often. `GET` requests already retry automatically. |

## API documentation

- Docs: [privy.ac/docs](https://privy.ac/docs)
- OpenAPI: [privy.ac/api/openapi.json](https://privy.ac/api/openapi.json)

## Security

- Keep API keys on a trusted backend. Never ship them in browser or mobile code.
- Store keys in environment variables or a secrets manager, never in source control.
- Give each key only the scopes it needs, and revoke keys you no longer use at [privy.ac/docs/api-keys](https://privy.ac/docs/api-keys).
- Never ask users for private keys or seed phrases. Signing always happens in the user's own wallet.
