/**
 * A `(chain, network)` this estate does not run.
 *
 * Its own screen rather than a generic 404, because the answer is specific and useful: the set of
 * chains and networks is small enough to print in full, and naming them is what turns a typo into a
 * fix. The service makes the same judgement — `scopeFrom` throws `unknown_chain` or
 * `unknown_network`, both **404**, and its comment says why it is not a 400
 * (`indexer/src/server.ts`).
 *
 * The count is not stated. It used to say "exactly five chains", which was a fact about the union
 * at the time of writing and wrong twice since — LTC made it six and micro-contracts `c0e7c77` made
 * it eight. The list below is rendered from `CHAIN_IDS`, which is checked against the service's own
 * (`test/indexer.test.ts`), so the screen cannot disagree with itself; a number typed into the
 * prose beside it can, and did.
 *
 * **A chain on that list is not a chain this deployment walks**, and this screen is not the place
 * that distinction is drawn — `/chains` is, from each scope's own `/status` (`isServed` in
 * `src/lib/indexer.ts`). What this screen says is narrower and stays true: these are the scopes
 * whose pages exist. Several of them will answer that nothing has been walked, which is a real
 * answer and a different one from the address being wrong.
 *
 * Rendered under the app's own 404 status, which nginx preserves (`nginx.conf`'s
 * `error_page 404 /index.html`), only when it is reached through the catch-all. Reached from a
 * valid route with an invalid scope, the address exists and the status is 200 — which is correct:
 * `/chains/bnb/mainnet` IS a page this app serves, and the page says the chain is not real.
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
        <h1 className="ex-page__title">That chain is not run here</h1>
      </header>
      <p className="ex-page__lede">
CloudsForge operates no{' '}
        <code className="cf-num">
          {chain ?? '(no chain)'}/{network ?? '(no network)'}
        </code>
. There is nothing wrong with the way the address is written; it
        simply names something that does not exist, and the chain index behind this page takes the
        same view.
      </p>

      <h2 className="ex-section__title">The combinations that do exist</h2>
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
