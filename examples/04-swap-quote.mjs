// Indicative SOL -> token quote. This only reads a price. It never executes a swap or moves SOL.
// GET /quote?inputMint=…&outputMint=…&amount=…&slippageBps=…   Scope: read:public (API key optional)
//
// Usage: npm run quote -- 0.01 <outputMint>
import { PrivyClient, formatUnits, handleError, parseUnits } from '../src/client.mjs'
import { MINTS } from '../src/config.mjs'

const solAmount = process.argv[2] ?? '0.01'
const outputMint = process.argv[3] ?? MINTS.POPCAT
const slippageBps = 100 // 100 bps = 1%. The API default is 1500 (15%) when omitted.

const privy = new PrivyClient()

try {
    // Amounts are raw integers in the token's smallest unit, sent as strings.
    // SOL has 9 decimals: 1 SOL = 1,000,000,000 lamports. parseUnits avoids float maths.
    const amount = parseUnits(solAmount, 9)

    // The quote returns raw output units, so fetch the output token's decimals to format it.
    const [{ data: token }, { data: quote }] = await Promise.all([
        privy.get('/tokens/{mint}', { params: { mint: outputMint } }),
        privy.get('/quote', { query: { inputMint: MINTS.SOL, outputMint, amount, slippageBps } }),
    ])

    const decimals = token.decimals
    const symbol = token.symbol ?? 'tokens'
    const fmt = (raw) => (decimals === null ? `${raw} raw units` : `${formatUnits(raw, decimals)} ${symbol}`)

    console.log(`Quote for ${formatUnits(quote.inAmount, 9)} SOL -> ${symbol}`)
    console.log(`  inputMint:        ${quote.inputMint}`)
    console.log(`  outputMint:       ${quote.outputMint}`)
    console.log(`  inAmount (raw):   ${quote.inAmount} lamports`)
    console.log(`  expected output:  ${fmt(quote.outAmount)}  (raw ${quote.outAmount})`)
    console.log(`  minimum output:   ${fmt(quote.minimumOutAmount)}  (after ${quote.slippageBps} bps slippage)`)
    console.log(`  price impact:     ${quote.priceImpact ?? 'n/a'}%`)
    console.log(`  USD in / out:     ${quote.inUsdValue ?? 'n/a'} / ${quote.outUsdValue ?? 'n/a'}`)
    console.log(`  router:           ${quote.router ?? 'n/a'}`)
    console.log(`  quotedAt:         ${quote.quotedAt}`)
    console.log('\nQuotes are indicative and never stored. A real trade takes its own fresh quote server-side.')
} catch (error) {
    handleError(error)
}
