// Points summary for the key's account.
// GET /points   Scope: read:account (API key required)
//
// Usage: npm run points
import { PrivyClient, handleError } from '../src/client.mjs'
import { requireApiKey } from '../src/config.mjs'

requireApiKey('read:account')
const privy = new PrivyClient()

try {
    const { data: p } = await privy.get('/points', { auth: 'required' })
    console.log(`Total points:    ${p.totalPoints.toLocaleString()}`)
    console.log(`Volume (USD):    $${p.volumeUsd}`)
    console.log(`Completed swaps: ${p.completedSwaps}`)
    console.log(`Rank:            ${p.rank === null ? 'unranked' : `#${p.rank} of ${p.participants}`}`)
    console.log(`Earn rate:       ${p.pointsPerUsd} points per $1`)
} catch (error) {
    handleError(error)
}
