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
        <h1 className="ex-page__title">No page lives at this address</h1>
      </header>
      <p className="ex-page__lede">
Nothing in the explorer answers there. The server sent a 404 alongside this screen, on
        purpose: an address that reports success while showing an apology is honest with the person
        reading it and misleading to every crawler, monitor and script that also looked.
      </p>
      <h2 className="ex-section__title">What you can reach from here</h2>
      <ul className="ex-plainlist">
        <li>
          <Link to="/">/</Link> — look something up by height, hash or address
        </li>
        <li>
          <Link to="/chains">/chains</Link> — how far each chain has been read, and{' '}
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
