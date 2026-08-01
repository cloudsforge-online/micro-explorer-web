/**
 * The ten scopes, as links, with no API call.
 *
 * Five chains (`indexer/src/chains.ts:41`) times two networks (`indexer/src/chains.ts:43`). It
 * fetches nothing, deliberately: ten status calls that all refuse would be ten identical panels,
 * and the standing notice in the shell has already said it once.
 *
 * A scope being listed here is not a claim that this deployment follows it. `INDEXER_CHAINS`
 * decides which scopes a replica actually walks (`indexer/src/env.ts:289-291` refuses a per-chain
 * variable for a scope the list does not name), and a scope that is configured but has no provider
 * is called out upstream as "a service that reports healthy and indexes nothing"
 * (`indexer/src/env.ts:18-21`). Only the status page can tell you which — so that is what the page
 * says, rather than pretending the list is a promise.
 */
import { Link } from 'react-router-dom'
import { CHAIN_IDS, NETWORKS } from '../lib/indexer.ts'
import { linkTo } from '../lib/routes.ts'

/**
 * What each chain is, in one line.
 *
 * The asset codes come from `indexer/src/chains.ts:45-51` and the families from
 * `@cloudsforge/contracts-chain` via `familyOf` (`indexer/src/chains.ts:65-67`). Written out here
 * rather than fetched because a list of five names should not require an authority to read, and
 * `test/indexer.test.ts` checks the chain ids against the real source.
 */
const ABOUT: Readonly<Record<string, string>> = {
  ember: 'EMBER — the Forge Network chain, proof of work',
  eth: 'ETH — Ethereum',
  btc: 'BTC — Bitcoin',
  sol: 'SOL — Solana',
  xrp: 'XRP — the XRP Ledger',
}

export function ChainsPage() {
  return (
    <div className="ex-page">
      <header className="ex-page__head">
        <h1 className="ex-page__title">Chains</h1>
      </header>
      <p className="ex-page__lede">
        Every <code className="cf-num">(chain, network)</code> pair this index can be asked about.
        Whether a given deployment actually follows one is a question only its status page can
        answer.
      </p>

      <ul className="ex-scopes">
        {CHAIN_IDS.map((chain) => (
          <li key={chain} className="ex-scope">
            <h2 className="ex-scope__name">{ABOUT[chain] ?? chain}</h2>
            <div className="ex-scope__nets">
              {NETWORKS.map((network) => (
                <Link key={network} className="ex-scope__link" to={linkTo.chain(chain, network)}>
                  <code className="cf-num">
                    {chain}/{network}
                  </code>
                </Link>
              ))}
            </div>
          </li>
        ))}
      </ul>

      <h2 className="ex-section__title">Why there is no SHARD here</h2>
      <p className="ex-page__lede">
        SHARD is a CloudsForge balance rather than a chain. `micro-indexer` leaves it out of its
        chain list on purpose (<code className="cf-num">indexer/src/chains.ts:35-37</code>): it
        exists in the estate&rsquo;s asset record only so that record is total, it never exists on a
        chain, and an indexer that accepted it &ldquo;would be advertising an endpoint that can only
        ever answer empty&rdquo;.
      </p>
    </div>
  )
}
