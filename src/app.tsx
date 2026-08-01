/**
 * The route table.
 *
 * Two facts about it are enforced elsewhere and must stay in agreement with it: `ROUTES` in
 * lib/routes.ts is the declaration the navigation is derived from, and nginx.conf enumerates the
 * same paths so that an address which is NOT here answers 404 rather than 200.
 *
 * ── Nothing here is gated, and that is read off the SERVICE rather than chosen ─────────────────
 *
 * There is no `ProtectedRoute` in this repository. `micro-indexer` authorises a service principal
 * holding `indexer:read` or a user the token says is an admin, and nothing else
 * (`indexer/src/server.ts:679-697`), so an ordinary customer who signs in is refused by exactly the
 * same request that refused them signed out. A gate would send a visitor through an SSO round trip
 * to arrive at a 403 — the same class of mistake as a client sending a bearer to a route that never
 * wanted one, which this estate has already shipped.
 *
 * So every route renders for everybody, every panel calls the real route, and a refusal is
 * displayed as a refusal with its reason. `test/routes.test.ts` asserts the absence of a gate, so
 * restoring the estate's usual shape is a decision somebody has to argue for.
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
            {/* The search, which calls nothing and therefore works for everybody. */}
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
