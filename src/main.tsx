/**
 * The boot sequence. The order is not arbitrary.
 *
 *   1. Observability first, so an exception thrown by anything below is reported rather than lost.
 *      A crash during the first render is the single most valuable event this app can send.
 *   2. `bootstrapSession()` second, and AWAITED, so the SSO hand-off code in the URL fragment is
 *      redeemed before React mounts. It strips `#cf_code` from the address bar before the exchange
 *      goes over the wire — see the note in @cloudsforge/ui. Rendering first would show a
 *      signed-out shell to somebody who has just signed in, and would leave the code on screen for
 *      the length of a network round trip.
 *   3. Render last.
 *
 * Step 2 runs on this surface too, even though **no page here needs a session at all**: the chain
 * reads are anonymous (`indexer/src/server.ts:792-801`) and this bundle sends no bearer for one.
 * It runs because the code has to leave the address bar whether or not the page that follows uses
 * it — a hand-off code sitting in a shared link is a hand-off code somebody else can redeem. The
 * session it may establish reaches the shared company bar and nothing else.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@cloudsforge/ui/tokens.css'
import '@cloudsforge/ui/ui.css'
import './styles.css'
import { App } from './app.tsx'
import { bootstrapSession } from './lib/api.ts'
import { initObs } from './lib/obs.ts'

initObs()

const container = document.getElementById('root')
if (!container) throw new Error('#root is missing from index.html')

void bootstrapSession().finally(() => {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
