// Poll a trade until it reaches a terminal stage.
// GET /trades/{id}/status   Scope: read:account (API key required)
// id is a buy intent UUID or a sell ID (sell_…).
//
// Usage: npm run status -- <tradeId> [--watch]
import { PrivyClient, handleError } from '../src/client.mjs'
import { requireApiKey } from '../src/config.mjs'

requireApiKey('read:account')
const id = process.argv[2]
const watch = process.argv.includes('--watch')
if (!id || id.startsWith('--')) {
    console.error('Usage: npm run status -- <tradeId> [--watch]')
    process.exit(1)
}

const privy = new PrivyClient()
const POLL_MS = 3000 // The API asks clients to poll no faster than every 2 seconds.

try {
    for (; ;) {
        const { data: s } = await privy.get('/trades/{id}/status', { auth: 'required', params: { id } })
        console.log(`${new Date().toISOString()}  ${s.side}  stage=${s.stage}  terminal=${s.terminal}`)
        if (s.terminal || !watch) {
            console.log(JSON.stringify(s, null, 2))
            break
        }
        await new Promise((r) => setTimeout(r, POLL_MS))
    }
} catch (error) {
    handleError(error)
}
