// Trading positions with cursor pagination.
// GET /positions?status=…&limit=…&cursor=…   Scope: read:account (API key required)
// GET /positions/{id}
//
// Usage: npm run positions -- [status]   e.g. npm run positions -- open
import { PrivyClient, formatUnits, handleError } from '../src/client.mjs'
import { requireApiKey } from '../src/config.mjs'

requireApiKey('read:account')
const status = process.argv[2]
const privy = new PrivyClient()

try {
    // Fetch the first page explicitly to show the pagination object.
    const first = await privy.get('/positions', { auth: 'required', query: { status, limit: 10 } })
    console.log('First page pagination:', first.pagination)

    // Or let the client follow nextCursor for you.
    let count = 0
    for await (const position of privy.paginate('/positions', { auth: 'required', query: { status, limit: 50 } })) {
        count++
        const decimals = position.token?.decimals
        const remaining =
            position.remainingAmount && decimals != null ? formatUnits(position.remainingAmount, decimals) : position.remainingAmount
        console.log(
            `${position.id}  ${position.status.padEnd(15)} ${position.token?.symbol ?? position.mint ?? '-'}  ` +
            `principal ${formatUnits(position.principalLamports, 9)} SOL  remaining ${remaining ?? '-'}`,
        )
    }
    console.log(`\n${count} position(s).`)

    if (first.data[0]) {
        const { data: detail } = await privy.get('/positions/{id}', { auth: 'required', params: { id: first.data[0].id } })
        console.log('\nDetail for the newest position:\n', detail)
    }
} catch (error) {
    handleError(error)
}
