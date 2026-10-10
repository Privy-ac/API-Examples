// Tokens Privy currently holds for your account, aggregated per token.
// These are Privy-managed holdings, not the contents of your own wallet.
// GET /holdings   Scope: read:account (API key required)
//
// Usage: npm run holdings
import { PrivyClient, handleError } from '../src/client.mjs'
import { requireApiKey } from '../src/config.mjs'

requireApiKey('read:account')
const privy = new PrivyClient()

try {
    const { data: holdings } = await privy.get('/holdings', { auth: 'required' })
    if (holdings.length === 0) {
        console.log('No open holdings.')
    } else {
        console.table(
            holdings.map((h) => ({
                symbol: h.symbol,
                balance: h.balance ?? `${h.amount} raw`,
                usdValue: h.usdValue,
                positions: h.positionIds.length,
                selling: h.sellInProgress,
                mint: h.mint,
            })),
        )
    }
} catch (error) {
    handleError(error)
}
