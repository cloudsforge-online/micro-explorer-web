/**
 * A `(chain, network)` this estate does not run.
 *
 * Its own screen rather than a generic 404, because the answer is specific and useful: there are
 * exactly five chains and two networks, and naming them is what turns a typo into a fix. The
 * service makes the same judgement — `scopeFrom` throws `unknown_chain` or `unknown_network`, both
 * **404**, and its comment says why it is not a 400 (`indexer/src/server.ts:664-670`).
 *
 * Rendered under the app's own 404 status, which nginx preserves (`nginx.conf`'s
 * `error_page 404 /index.html`), only when it is reached through the catch-all. Reached from a
 * valid route with an invalid scope, the address exists and the status is 200 — which is correct:
 * `/chains/doge/mainnet` IS a page this app serves, and the page says the chain is not real.
 */
import { Link } from 'react-router-dom'
import { CHAIN_IDS, NETWORKS } from '../lib/indexer.ts'
import { linkTo } from '../lib/routes.ts'

export function UnknownScope({
  chain,
  network,
}: {
  chain: string | undefined
  network: string | undefined
}) {
  return (
    <div className="ex-page">
      <header className="ex-page__head">
        <h1 className="ex-page__title">No such chain here</h1>
      </header>
      <p className="ex-page__lede">
        This estate does not run{' '}
        <code className="cf-num">
          {chain ?? '(no chain)'}/{network ?? '(no network)'}
        </code>
        . That is not a malformed address — it names a resource that does not exist, which is the
        same judgement the chain index makes
        (<code className="cf-num">indexer/src/server.ts:664-670</code>).
      </p>

      <h2 className="ex-section__title">The ones that do exist</h2>
      <ul className="ex-scopes">
        {CHAIN_IDS.map((c) => (
          <li key={c} className="ex-scope">
            <h3 className="ex-scope__name">{c}</h3>
            <div className="ex-scope__nets">
              {NETWORKS.map((n) => (
                <Link key={n} className="ex-scope__link" to={linkTo.chain(c, n)}>
                  <code className="cf-num">
                    {c}/{n}
                  </code>
                </Link>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
