// Trending tokens.
// GET /tokens/trending?limit=…   Scope: read:public (API key optional)
//
// Usage: npm run trending -- 10
import { PrivyClient, handleError } from '../src/client.mjs'

const limit = Number(process.argv[2] ?? 10)
const privy = new PrivyClient()

try {
    const { data: tokens } = await privy.get('/tokens/trending', { query: { limit } })
    console.table(
        tokens.map((token, index) => ({
            '#': index + 1,
            symbol: token.symbol,
            name: token.name,
            usdPrice: token.usdPrice,
            mint: token.mint,
        })),
    )
} catch (error) {
    handleError(error)
}
