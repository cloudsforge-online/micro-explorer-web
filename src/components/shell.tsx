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
import { useEffect } from 'react'
import { CloudsForgeBar, CookieBanner, MainRegion, SkipLink } from '@cloudsforge/ui'
import { applyHead, surfaceMeta } from '@cloudsforge/ui/seo'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { PRODUCT, SURFACE_DESCRIPTION } from '../lib/hosts.ts'
import { isNetwork, type Network } from '../lib/indexer.ts'
import { deploymentNetwork, siblingExplorer } from '../lib/network.ts'
import { NAV, ROUTES } from '../lib/routes.ts'
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
      {/*
        Skip link first in the DOM, and it is the SHARED one now.

        The reason is the same as before — a transaction page is a long list of facts and a
        keyboard reader should not tab the company bar and the section navigation to reach it —
        but the local `.ex-skip` anchor was only half the pattern. It pointed at `#main`, and the
        `<main id="main">` below carried no `tabIndex={-1}`; a `<main>` is not focusable by
        default, so in Chrome and Safari following the link SCROLLED the page, left focus on the
        link itself, and sent the next Tab back into the bar. `MainRegion` below is the half that
        was missing, and it sets the id and the tabindex together so they cannot disagree.
      */}
      <SkipLink>Skip to the page</SkipLink>
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
      <DocumentMeta />
      {/*
        `MainRegion` rather than a hand-written `<main>`: it sets `id={MAIN_ID}` — `cf-main` — and
        `tabIndex={-1}` together, which is the pair the skip link needs and the pair this file used
        to get half right. Nothing else in this app referenced the old `main` id, and the shared
        `SkipLink` composes its href from the same constant.
      */}
      <MainRegion className="ex-main">
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
      </MainRegion>

      {/*
        Last in the document, and therefore last in the tab order. That is deliberate: the banner
        is a dialog and is explicitly NOT modal, so a reader who came here to check whether a
        transaction they are waiting on has been walked yet can read the answer and decide about
        analytics afterwards. A consent banner that traps focus is the coercion the regulation is
        about.

        It renders nothing at all until it knows the reader has not already answered, and nothing
        on an origin where analytics would not report anyway — which is every local stack.

        IT PERSISTS ONE KEY AND ONLY ONE: `cf.consent.analytics`, the record of the reader's own
        decision, which is the textbook Art. 5(3) "strictly necessary" exemption because without it
        the banner cannot stop asking. That is worth naming here rather than leaving implicit,
        because this surface deliberately has NOWHERE to persist a network or a chain — see the
        header of `src/lib/network.ts` — and a reader of this file should be able to see that the
        banner did not quietly open one.
      */}
      <CookieBanner />
    </>
  )
}

/**
 * Keep `document.title`, the description, the Open Graph tags and the canonical link in step with
 * the address.
 *
 * A component in the shell rather than a hook each page calls, because the failure mode of the
 * second shape is the page that forgets — and on this surface that would be worse than a wrong
 * title. A block explorer's addresses are pasted into chat and support tickets constantly, so a
 * stale `og:url` left over from the previous navigation is a shared link that opens something
 * other than what the sharer was looking at.
 *
 * ── What this does NOT replace ────────────────────────────────────────────────────────────────
 *
 * The static tags in `index.html`. They are what a link-preview fetcher gets — the ones used by
 * chat clients generally do not execute JavaScript — so the shell keeps its own title, description
 * and og card, and this is the layer a browser and the crawlers that do execute JavaScript see.
 * That trade is inherited rather than introduced; it is written down at the top of
 * `@cloudsforge/ui/seo`.
 *
 * ── Where the words come from ─────────────────────────────────────────────────────────────────
 *
 * `surfaceMeta('explorer', …)` — the REGISTRY key, not the accent key. `index.html` names
 * `data-cf-product="network"` because tokens.css has no `explorer` accent block to name
 * (`src/lib/hosts.ts:60`); the registry, by contrast, has a real `explorer` row with this
 * surface's own name and blurb, and that is the row a title and a description come from. The two
 * keys are different questions and it would be a mistake to answer both with one constant.
 *
 * The page name is read off `ROUTES` — the same declaration the navigation, the router and
 * nginx's enumerated locations all derive from — rather than typed a fifth time. Two kinds of
 * route get the surface name alone instead:
 *
 *   * the INDEX, whose `ROUTES` label is `Search`. That label's job is a tab in the section
 *     navigation, where it sits beside `Chains` and has to say what the tab does. As a `<title>`
 *     it would make the front door read `Search — Network Explorer`, which disagrees with the
 *     `<title>` in `index.html` that a link-preview fetcher gets, and `test/seo.test.ts` asserts
 *     the two agree rather than leaving it to be noticed in a shared link;
 *   * the four record routes, whose label is `null` on purpose. `/tx/<chain>/<network>/<hash>` is
 *     one transaction, and the shell cannot know anything about it worth putting in a title.
 *     "Transaction" would be a heading pretending to be an identity, identical for every
 *     transaction there has ever been.
 */
function DocumentMeta() {
  const { pathname } = useLocation()

  useEffect(() => {
    const segment = pathname.split('/')[1] ?? ''
    // `segment !== ''` excludes the index; `label` is null on the four record routes. Both fall
    // through to the surface name, which is what `surfaceMeta` returns when no title is given.
    const label =
      segment === '' ? null : (ROUTES.find((route) => route.path === segment)?.label ?? null)
    applyHead(
      surfaceMeta(PRODUCT, {
        ...(label === null ? {} : { title: label }),
        // NOT the registry-composed one. See `SURFACE_DESCRIPTION` in src/lib/hosts.ts: the blurb
        // describes a block explorer, and what distinguishes this one is what it declines to say.
        description: SURFACE_DESCRIPTION,
        path: pathname,
      }),
      window.location.origin,
    )
  }, [pathname])

  return null
}
