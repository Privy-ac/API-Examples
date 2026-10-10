// Create a buy intent. Dry run by default.
// POST /trade/buys   Scope: trade:intents (API key required)
//
// Usage:
//   npm run buy -- 0.01 <mint>             dry run: prints the quote and the request body
//   npm run buy -- 0.01 <mint> --confirm   creates the intent and prints the UNSIGNED deposit transaction
//
// Even with --confirm, no SOL moves. The response contains an unsigned deposit transaction
// that only the key owner's wallet can sign. This script never signs it and never calls
// POST /trade/buys/{id}/deposit. See README "Trading" for the full flow.
import { randomUUID } from 'node:crypto'
import { PrivyClient, formatUnits, handleError, parseUnits } from '../src/client.mjs'
import { MINTS, requireApiKey } from '../src/config.mjs'

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const confirm = process.argv.includes('--confirm')
const solAmount = args[0] ?? '0.01'
const mint = args[1] ?? MINTS.POPCAT

const privy = new PrivyClient()

try {
    const amountLamports = parseUnits(solAmount, 9)

    // 1. Preview with a quote (public, read-only).
    const { data: quote } = await privy.get('/quote', {
        query: { inputMint: MINTS.SOL, outputMint: mint, amount: amountLamports, slippageBps: 100 },
    })
    console.log(`Quote: ${formatUnits(amountLamports, 9)} SOL -> ${quote.outAmount} raw units (min ${quote.minimumOutAmount})`)

    // 2. Build the request. Store idempotencyKey with your order so a retry returns the same intent.
    const body = { mint, amountLamports, slippageBps: 100, idempotencyKey: `buy-${randomUUID()}` }

    if (!confirm) {
        console.log('\nDry run. Would send POST /trade/buys with:\n', body)
        console.log('\nRe-run with --confirm to create the intent (requires the trade:intents scope).')
    } else {
        requireApiKey('trade:intents')
        const { data } = await privy.post('/trade/buys', body, { auth: 'required' })
        const { intent, deposit } = data
        console.log('\nBuy intent created:')
        console.log(`  id:                   ${intent.id}`)
        console.log(`  status:               ${intent.status}`)
        console.log(`  deposit (incl. fees): ${formatUnits(intent.amountLamports, 9)} SOL`)
        console.log(`  minimum output:       ${intent.minimumOutputAmount} raw units`)
        console.log(`  deposit expires:      ${intent.depositExpiresAt}`)
        console.log(`  lastValidBlockHeight: ${deposit.lastValidBlockHeight}`)
        console.log(`  unsigned tx (base64): ${deposit.transaction.slice(0, 48)}…`)
        console.log('\nNext: the wallet owner signs deposit.transaction in their own wallet, then you send it to')
        console.log(`POST /trade/buys/${intent.id}/deposit as { signedTransaction }. Cancel unused intents with`)
        console.log(`POST /trade/buys/${intent.id}/cancel. Track with: npm run status -- ${intent.id}`)
    }
} catch (error) {
    handleError(error)
}
