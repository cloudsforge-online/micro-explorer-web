/**
 * The route table.
 *
 * Two facts about it are enforced elsewhere and must stay in agreement with it: `ROUTES` in
 * lib/routes.ts is the declaration the navigation is derived from, and nginx.conf enumerates the
 * same paths so that an address which is NOT here answers 404 rather than 200.
 *
 * ── Nothing here is gated, and that is read off the SERVICE rather than chosen ─────────────────
 *
 * There is no `ProtectedRoute` in this repository, and there must not be one. Every
 * `micro-indexer` route this app calls is anonymous: `authoriseRead` returns `null` for a caller
 * with no token and lets the handler run (`indexer/src/server.ts:727-736`). A gate here would
 * demand a session for facts anyone can read off a public chain —
 * `docs/ecosystem/15-monetisation-model.md:50`: "A public chain whose explorer is paywalled is not
 * a public chain."
 *
 * So every route renders for everybody, every panel calls the real route with no bearer attached,
 * and every panel gets an answer. `test/routes.test.ts` asserts the absence of a gate, so restoring
 * the estate's usual shape is a decision somebody has to argue for.
 *
 * ── The scope is two path segments, everywhere ────────────────────────────────────────────────
 *
 * `:chain/:network`, never a combined segment. `market/src/indexerclient.test.ts:328-341` measures
 * why: a helper standing for both collapses a path by one segment, and a path one segment short of
 * the route it means can silently match a DIFFERENT route. The same discipline applies to this
 * app's own addresses so that `/tx/ember/testnet/0x…` cannot be confused with anything else.
 */
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/shell.tsx'
import { AuthProvider } from './lib/auth.tsx'
import { placementIsKnown } from './lib/hosts.ts'
import { SearchPage } from './pages/search.tsx'
import { ChainsPage } from './pages/chains.tsx'
import { ChainPage } from './pages/chain.tsx'
import { BlockPage } from './pages/block.tsx'
import { TransactionPage } from './pages/transaction.tsx'
import { AddressPage } from './pages/address.tsx'
import { TokenPage } from './pages/token.tsx'
import { NotFoundPage } from './pages/not-found.tsx'

export function App() {
  const unregistered = !placementIsKnown()

  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<AppShell unregistered={unregistered} />}>
            {/* The search, which calls nothing because there is nothing to ask until somebody
                types — not because it would be refused. */}
            <Route index element={<SearchPage />} />
            <Route path="chains" element={<ChainsPage />} />
            <Route path="chains/:chain/:network" element={<ChainPage />} />
            <Route path="blocks/:chain/:network/:height" element={<BlockPage />} />
            <Route path="tx/:chain/:network/:hash" element={<TransactionPage />} />
            <Route path="address/:chain/:network/:address" element={<AddressPage />} />
            <Route path="tokens/:chain/:network/:address" element={<TokenPage />} />
            {/* Unknown paths render inside the shell, so the reader keeps the navigation they need
                to get back out — under a real 404, which nginx.conf preserves. */}
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
