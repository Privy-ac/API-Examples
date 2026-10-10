// Account activity ledger, newest first, with points per entry.
// GET /activity?type=…&limit=…&cursor=…   Scope: read:account (API key required)
// type is one of: buy, sell, deposit, payout, refund
//
// Usage: npm run activity -- [type]
import { PrivyClient, formatUnits, handleError } from '../src/client.mjs'
import { requireApiKey } from '../src/config.mjs'

requireApiKey('read:account')
const type = process.argv[2]
const privy = new PrivyClient()

try {
    const { data: entries, pagination } = await privy.get('/activity', { auth: 'required', query: { type, limit: 25 } })
    for (const e of entries) {
        const amount = e.amount && e.decimals != null ? `${formatUnits(e.amount, e.decimals)} ${e.symbol ?? ''}` : '-'
        const sol = e.solLamports ? `${formatUnits(e.solLamports, 9)} SOL` : '-'
        console.log(
            `${e.createdAt}  ${e.type.padEnd(7)} ${e.status.padEnd(10)} ${amount.padEnd(24)} ${sol.padEnd(14)} ` +
            `$${e.usdValue ?? '-'}  +${e.points} pts`,
        )
    }
    if (pagination?.hasMore) console.log(`\nMore entries: pass cursor=${pagination.nextCursor}`)
} catch (error) {
    handleError(error)
}
