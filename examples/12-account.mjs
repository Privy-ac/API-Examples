// Verify an API key and show the account it belongs to.
// GET /me   Any valid API key
//
// Usage: npm run account
import { PrivyClient, handleError, shortAddress } from '../src/client.mjs'
import { requireApiKey } from '../src/config.mjs'

requireApiKey('read:account')
const privy = new PrivyClient()

try {
    const { data: me, rateLimit } = await privy.get('/me', { auth: 'required' })
    console.log(`Account: ${me.accountId}`)
    console.log(`Wallet:  ${shortAddress(me.walletAddress)}`)
    console.log(`Key:     ${me.apiKey.name} (${me.apiKey.prefix}…)`)
    console.log(`Scopes:  ${me.apiKey.scopes.join(', ')}`)
    if (rateLimit) console.log(`Rate limit: ${rateLimit.remaining}/${rateLimit.limit}, resets ${rateLimit.resetAt.toISOString()}`)
} catch (error) {
    handleError(error)
}
