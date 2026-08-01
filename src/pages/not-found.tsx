/**
 * The page for an address this app does not own.
 *
 * It is rendered inside the shell, under a REAL 404 — nginx enumerates the routes and answers 404
 * for everything else, then serves this bundle through `error_page 404 /index.html`, which keeps
 * the status. An SPA that answered 200 for every address would make this screen a success: crawlers
 * index it, uptime checks call it healthy, and a deploy that dropped `/tx` would look exactly like
 * a deploy that did not.
 *
 * That matters more here than on most surfaces. A block explorer's addresses are pasted into chat,
 * cited in support tickets and linked from receipts, so a mistyped one must be distinguishable from
 * a real one by a machine as well as by a reader.
 */
import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="ex-page">
      <header className="ex-page__head">
        <h1 className="ex-page__title">No such page</h1>
      </header>
      <p className="ex-page__lede">
        This explorer does not serve that address. The server answered 404 as well as this page
        saying so, which is deliberate: a page that says &ldquo;not found&rdquo; under a 200 is a
        page that lies to everything except a human being.
      </p>
      <h2 className="ex-section__title">The addresses it does serve</h2>
      <ul className="ex-plainlist">
        <li>
          <Link to="/">/</Link> — search by height, hash or address
        </li>
        <li>
          <Link to="/chains">/chains</Link> — every chain and network, and{' '}
          <code className="cf-num">/chains/&lt;chain&gt;/&lt;network&gt;</code> for one
        </li>
        <li>
          <code className="cf-num">/blocks/&lt;chain&gt;/&lt;network&gt;/&lt;height&gt;</code>
        </li>
        <li>
          <code className="cf-num">/tx/&lt;chain&gt;/&lt;network&gt;/&lt;hash&gt;</code>
        </li>
        <li>
          <code className="cf-num">/address/&lt;chain&gt;/&lt;network&gt;/&lt;address&gt;</code>
        </li>
        <li>
          <code className="cf-num">/tokens/&lt;chain&gt;/&lt;network&gt;/&lt;address&gt;</code>
        </li>
      </ul>
    </div>
  )
}
