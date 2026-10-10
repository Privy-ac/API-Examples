// Create a sell authorization for tokens Privy holds for you. Dry run by default.
// GET  /holdings              Scope: read:account
// POST /trade/sells           Scope: trade:intents
//
// Usage:
//   npm run sell -- <mint> [rawAmount]             dry run
//   npm run sell -- <mint> [rawAmount] --confirm   creates the authorization and prints the message to sign
//
// Creating the authorization does not sell anything. The sell only starts after the key owner's
// wallet signs the returned message (ed25519) and you send that signature to
// POST /trade/sells/{id}/authorize within 2 minutes. This script never signs.
import { randomUUID } from 'node:crypto'
import { PrivyClient, formatUnits, handleError } from '../src/client.mjs'
import { requireApiKey } from '../src/config.mjs'

requireApiKey('read:account')
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const confirm = process.argv.includes('--confirm')
const privy = new PrivyClient()

try {
    // 1. Find what you can sell.
    const { data: holdings } = await privy.get('/holdings', { auth: 'required' })
    const holding = args[0] ? holdings.find((h) => h.mint === args[0]) : holdings[0]
    if (!holding) {
        console.log(args[0] ? `No Privy holding for ${args[0]}.` : 'No open holdings to sell.')
        process.exit(0)
    }
    if (holding.sellInProgress) {
        console.log(`A sell of ${holding.symbol ?? holding.mint} is already in progress.`)
        process.exit(0)
    }

    // 2. Amount in raw units. Default: half the holding, computed with BigInt.
    const amount = args[1] ?? (BigInt(holding.amount) / 2n).toString()
    if (BigInt(amount) <= 0n || BigInt(amount) > BigInt(holding.amount)) throw new RangeError('Invalid sell amount')

    const body = { mint: holding.mint, amount, slippageBps: 100, idempotencyKey: `sell-${randomUUID()}` }
    const label = holding.decimals == null ? `${amount} raw` : `${formatUnits(amount, holding.decimals)} ${holding.symbol ?? ''}`

    if (!confirm) {
        console.log(`Dry run. Would sell ${label} via POST /trade/sells with:\n`, body)
        console.log('\nRe-run with --confirm to create the authorization (requires the trade:intents scope).')
    } else {
        requireApiKey('trade:intents')
        const { data } = await privy.post('/trade/sells', body, { auth: 'required' })
        const a = data.authorization
        console.log('Sell authorization created:')
        console.log(`  id:              ${a.id}`)
        console.log(`  status:          ${a.status}`)
        console.log(`  expected output: ${formatUnits(a.expectedOutputLamports, 9)} SOL`)
        console.log(`  signed minimum:  ${formatUnits(a.minimumOutputLamports, 9)} SOL`)
        console.log(`  expires:         ${a.expiresAt}`)
        console.log('\nMessage the wallet owner must sign (UTF-8):\n')
        console.log(a.message)
        console.log(`\nNext: sign the message bytes with the owner wallet (e.g. wallet.signMessage), base58-encode the`)
        console.log(`signature and send POST /trade/sells/${a.id}/authorize { signature } before it expires.`)
        console.log(`Track with: npm run status -- ${a.id} --watch`)
    }
} catch (error) {
    handleError(error)
}
