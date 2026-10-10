// Metadata for a single token.
// GET /tokens/{mint}   Scope: read:public (API key optional)
//
// Usage: npm run token -- <mint>
import { PrivyClient, handleError } from '../src/client.mjs'
import { MINTS } from '../src/config.mjs'

const mint = process.argv[2] ?? MINTS.POPCAT
const privy = new PrivyClient()

try {
    const { data: token } = await privy.get('/tokens/{mint}', { params: { mint } })
    console.log(JSON.stringify(token, null, 2))
} catch (error) {
    handleError(error)
}
