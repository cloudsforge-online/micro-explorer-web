/**
 * The app shell: the company bar, the section navigation, and the page.
 *
 * The bar is `CloudsForgeBar` from @cloudsforge/ui and is never reimplemented. It is passed
 * `PRODUCT` — 'explorer' — so the switcher resolves this surface's entry.
 *
 * ── There is no mark and no wordmark here, and that is a decision ──────────────────────────────
 *
 * `explorer` carries `markId: null` in the registry (`ui/packages/ui/src/surfaces.ts:526`), and
 * `brand/plan.ts:50-62` gives the reason: an explorer is part of Forge Network and "neither should
 * claim a mark of its own". `brand/assets/explorer/` therefore holds favicons and an og card and
 * nothing else — the two artefacts a separate hostname needs, because "a browser tab and a shared
 * link inherit nothing". So no chrome in this file is designed around a mark, nothing here renders
 * one, and `test/brand-chrome.test.ts` asserts the absence in both directions so that generating
 * one later is a decision rather than a reflex.
 *
 * `inSwitcher` is false for this surface (`ui/packages/ui/src/surfaces.ts:528`), so the bar shows
 * the six products and the operator tools, and this app is not among them. That is correct: the
 * explorer is reached from Forge Network, not chosen from a product list.
 */
import { CloudsForgeBar } from '@cloudsforge/ui'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { PRODUCT } from '../lib/hosts.ts'
import { isNetwork, type Network } from '../lib/indexer.ts'
import { deploymentNetwork, siblingExplorer } from '../lib/network.ts'
import { NAV } from '../lib/routes.ts'
import { useSession } from '../lib/auth.tsx'

/**
 * The network a URL on this app names, or null when it does not name one.
 *
 * Every record address on this surface is `/<kind>/<chain>/<network>/<id>` (`src/app.tsx`), so the
 * network is the fourth segment. Read off the path rather than through `useParams`, because the
 * shell is the LAYOUT route: it renders above every match and has no params of its own, and a
 * banner that only appears on some of the pages it is meant to guard is not a guard.
 */
function networkInPath(pathname: string): Network | null {
  const segment = pathname.split('/')[3] ?? ''
  return isNetwork(segment.toLowerCase()) ? (segment.toLowerCase() as Network) : null
}

export function AppShell({ unregistered = false }: { unregistered?: boolean }) {
  const { account, signIn, signOut } = useSession()
  const { pathname } = useLocation()
  const network = deploymentNetwork()
  const asked = networkInPath(pathname)
  // A deep link into the network this deployment is NOT. The page below will render an honest
  // "not found" off a scope this index has never walked, which is exactly the sentence that reads
  // as "my transaction is gone" — so it is said here, above the answer, with the address that can
  // actually answer it.
  const crossNetwork = asked !== null && asked !== network
  const elsewhere = crossNetwork && asked ? siblingExplorer(asked) : null

  return (
    <>
      {/* Skip link first in the DOM: a transaction page is a long list of facts and a keyboard
          user should not have to tab the navigation to reach it. */}
      <a className="ex-skip" href="#main">
        Skip to the page
      </a>
      <CloudsForgeBar
        current={PRODUCT}
        account={account}
        onSignIn={() => signIn()}
        onSignOut={signOut}
      />
      {/*
        The sub-nav is sticky at exactly `var(--cf-bar-h)` — the bar's own height token, not a
        number copied out of it. When the bar's height changes, this moves with it.
      */}
      <nav className="ex-subnav" aria-label="Sections">
        <div className="ex-subnav__inner">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `ex-subnav__link${isActive ? ' is-active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
          {/*
            WHICH NETWORK THIS IS, ON EVERY PAGE.

            The right default fixes the common case; this fixes the confused one. Two deployments
            of one bundle sit on two hostnames under one apex, and until now nothing on the page
            said which of them you had reached — so a reader who followed a link from a receipt, or
            who had both open, had no way to tell a mainnet answer from a testnet one. It is a
            `<strong>` with a label rather than a coloured dot, because the fact has to survive
            being read aloud.
          */}
          <p className="ex-subnav__net">
            <span className="ex-dim">Network</span>{' '}
            <strong className="cf-num" data-cf-network={network}>
              {network}
            </strong>
          </p>
        </div>
      </nav>
      <main className="ex-main" id="main">
        {/*
          Not fatal, so not a refusal — this is a public reference surface and nothing here is a
          security boundary. But not silent either. `cloudsforgeHosts()` derives the apex by
          stripping a KNOWN subdomain, so an address the registry does not know makes every estate
          URL resolve one level too deep: the chain index, and the account portal with it.
        */}
        {unregistered && (
          <p className="ex-note ex-note--warn" role="status">
            <span className="ex-note__icon" aria-hidden="true">
              ▲
            </span>
            <span>
              This page is being served from an address the CloudsForge surface registry does not
              know, so every host it resolves — including the chain index this explorer reads — is
              derived from the wrong apex. Its home is the{' '}
              <code className="cf-num">explorer</code> surface.
            </span>
          </p>
        )}
        {/*
          A CROSS-NETWORK ADDRESS, NAMED BEFORE THE PAGE BELOW DENIES IT EXISTS.

          This is tracker #136 from the receiving side. That defect was a testnet transaction
          linking to the mainnet explorer, which said the transaction did not exist; micro-contracts
          fixed the BUILDER in 4283686 so each network links to its own hostname. Links already in
          the world were built by the old one, and a reader who follows one lands here — on a
          deployment whose index has never walked the scope in the URL. The page renders a truthful
          404 that reads as "my money is gone". So the address that CAN answer is offered first.
        */}
        {crossNetwork && asked && (
          <p className="ex-note ex-note--warn" role="alert">
            <span className="ex-note__icon" aria-hidden="true">
              ▲
            </span>
            <span>
              This address names the <code className="cf-num">{asked}</code> network, and this
              explorer serves <code className="cf-num">{network}</code>. The two are separate
              deployments with separate indexes, so anything below is being looked up on a chain
              this one has never walked and will read as missing whether or not it exists.
              {elsewhere ? (
                <>
                  {' '}
                  {/* A real anchor: a different origin, which the router cannot reach. */}
                  <a href={`${elsewhere}${pathname}`}>Open it on the {asked} explorer</a>.
                </>
              ) : (
                <> There is no {asked} explorer to send you to from this address.</>
              )}
            </span>
          </p>
        )}
        {/*
          A STANDING NOTICE USED TO SIT HERE, ON EVERY PAGE, AND IT HAS BEEN DELETED.

          It told every reader who was not an operator that the chain index would refuse them,
          because every `micro-indexer` read required `indexer:read` or an admin. That is no longer
          true: the seven reads are anonymous (`indexer/src/server.ts:792-801`), this bundle sends
          no bearer for one, and the panels below render. A banner apologising for a restriction
          nobody is under would be read as a live fact, which is exactly how a stale claim survives.

          Nothing replaces it. A surface that works needs no notice saying so.
        */}
        <Outlet />
      </main>
    </>
  )
}
