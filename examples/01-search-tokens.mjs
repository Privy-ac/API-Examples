// Search tokens by name, symbol or exact mint address.
// GET /tokens/search?query=…&limit=…   Scope: read:public (API key optional)
//
// Usage: npm run search -- POPCAT
import { PrivyClient, handleError } from '../src/client.mjs'

const query = process.argv[2] ?? 'POPCAT'
const privy = new PrivyClient()

try {
  // Public endpoints work without a key. When PRIVY_API_KEY is set, the client sends it
  // in the X-API-Key header and the request counts against that key's rate limit.
  const { data: tokens, requestId } = await privy.get('/tokens/search', { query: { query, limit: 5 } })

  if (tokens.length === 0) {
    console.log(`No tokens found for "${query}".`)
  } else {
    console.log(`Results for "${query}" (request ${requestId}):\n`)
    for (const token of tokens) {
      // usdPrice is a JSON number for display only. It can be null for illiquid tokens.
      const price = typeof token.usdPrice === 'number' ? `$${token.usdPrice.toPrecision(6)}` : 'n/a'
      console.log(`${token.name ?? 'Unknown'} (${token.symbol ?? '?'})${token.verified ? ' ✓ verified' : ''}`)
      console.log(`  mint:     ${token.mint}`)
      console.log(`  decimals: ${token.decimals ?? 'unknown'}`)
      console.log(`  price:    ${price}\n`)
    }
  }
} catch (error) {
  handleError(error)
}
