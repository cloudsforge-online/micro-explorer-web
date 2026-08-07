/**
 * The boot sequence. The order is not arbitrary.
 *
 *   1. Observability first, so an exception thrown by anything below is reported rather than lost.
 *      A crash during the first render is the single most valuable event this app can send.
 *   2. `initAnalytics()` second — see the note beside the call.
 *   3. `bootstrapSession()` third, and AWAITED, so the SSO hand-off code in the URL fragment is
 *      redeemed before React mounts. It strips `#cf_code` from the address bar before the exchange
 *      goes over the wire — see the note in @cloudsforge/ui. Rendering first would show a
 *      signed-out shell to somebody who has just signed in, and would leave the code on screen for
 *      the length of a network round trip.
 *   4. Render last.
 *
 * Step 2 runs on this surface too, even though **no page here needs a session at all**: the chain
 * reads are anonymous (`indexer/src/server.ts`) and this bundle sends no bearer for one.
 * It runs because the code has to leave the address bar whether or not the page that follows uses
 * it — a hand-off code sitting in a shared link is a hand-off code somebody else can redeem. The
 * session it may establish reaches the shared company bar and nothing else.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@cloudsforge/ui/tokens.css'
import '@cloudsforge/ui/ui.css'
import './styles.css'
import { initAnalytics } from '@cloudsforge/ui/consent'
import { App } from './app.tsx'
import { bootstrapSession } from './lib/api.ts'
import { initObs } from './lib/obs.ts'

initObs()

/*
 * Consent Mode is primed with every category DENIED before anything else runs — two pushes onto a
 * plain array, no request, no cookie — and the analytics tag is loaded ONLY if this reader granted
 * consent on a previous visit. A first-time reader gets nothing until they press Accept.
 *
 * It goes here, second, rather than inside a component, because the denied default has to be in
 * place before any tag could conceivably arrive; a default installed after a script has begun
 * running is a race, and the losing branch of that race sets a cookie.
 *
 * BEFORE `bootstrapSession()` for the same reason it is before the render. That call is a network
 * round trip against the identity service, and a window in which a tag could arrive with storage
 * permitted by default is exactly the window this module exists to close.
 *
 * It writes nothing to storage of its own. The one key `@cloudsforge/ui/consent` ever sets is
 * `cf.consent.analytics`, and only after a reader has pressed a button — which is worth stating on
 * this surface, because `src/lib/network.ts` turns on there being NOWHERE to persist a network
 * choice. Nothing here changes that: consent is not a scope.
 */
initAnalytics()

const container = document.getElementById('root')
if (!container) throw new Error('#root is missing from index.html')

void bootstrapSession().finally(() => {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
