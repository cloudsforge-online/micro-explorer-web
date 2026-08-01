/**
 * Session state for the tree. There is deliberately no gate in front of any route.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE HAS NO `ProtectedRoute`, WHEN EVERY OTHER FRONTEND IN THE ESTATE HAS ONE
 *
 * A gate exists to spare a customer a screen made entirely of 401s by sending them somewhere that
 * fixes it. On this surface there is nowhere to send them: `micro-indexer` authorises a **service**
 * principal holding `indexer:read`, or a user the token says is an **admin**, and nothing else
 * (`authorise`, `indexer/src/server.ts:679-697`; the admin branch is `:695`). An ordinary customer
 * who signs in gets 403 on the very same request that gave them 401 signed out.
 *
 * So a gate here would redirect a visitor to a sign-in that cannot unlock the page, and would
 * replace the one useful sentence this app can show — which refusal happened, and why — with a
 * spinner and a round trip. `test/auth.test.ts` and `test/routes.test.ts` both assert the absence,
 * so restoring the estate's usual shape is a decision somebody has to argue for rather than a
 * reflex.
 *
 * The session is still read, and it is still used: it puts the customer's handle in the shared
 * bar, it lets the switcher show `adminOnly` entries to an operator, and — the part that actually
 * matters — an operator holding an admin session IS a principal this indexer serves, so the bearer
 * `src/lib/api.ts` attaches makes every page on this surface work for them today.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ── The `/auth/me` shape, re-read for this repository ─────────────────────────────────────────
 *
 * Identity answers `{ user: {...}, session: {...}, organisations: [...] }` — the profile is
 * **NESTED under `user`**. The route is `identity/src/server.ts:891-903` and the body is built by
 * `toPublicUser` at `identity/src/users.ts:52-63`. Both citations were opened and read against the
 * source for this repository rather than carried over from a sibling.
 *
 * That shape is worth stating because the estate got it wrong at the root: the web template
 * declared `interface Me { handle?, roles? }` and read both fields off the TOP level, where they
 * are not. Four frontends inherited it, `roles` was then always null, `isAdmin` in the shared
 * company bar was always false, and the switcher hid every `adminOnly` entry from every signed-in
 * operator.
 *
 * **It is fixed upstream**, and this file follows the template. `micro-web-template/src/lib/auth.tsx:26`
 * declares the nested shape and `:98-99` read `me?.user?.handle` / `me?.user?.roles`. The template
 * accepts ONLY the nested shape and its own comment gives the reason: "Tolerating the flat one as a
 * fallback would encode a response identity does not send, and the next reader would not be able to
 * tell which is real." There is no flat fallback here, and `test/auth.test.ts` pins its absence, so
 * the choice is a decision rather than an omission.
 *
 * On this surface the roles are not cosmetic. `isAdmin` is the difference between a page that shows
 * blocks and a page that explains why it cannot, so a bug that made `roles` always empty would make
 * the explorer look permanently broken to the only people it currently works for.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { AccountState } from '@cloudsforge/ui'
import { AUTH_EXPIRED_EVENT, clearTokens, hasSession, nimbus, signIn, signOut } from './api.ts'

/** What identity answers at `/auth/me`, narrowed to what this app needs. */
export interface MeResponse {
  user?: {
    id?: string | null
    handle?: string | null
    roles?: readonly string[] | null
  } | null
}

export interface Reader {
  readonly handle: string | null
  readonly roles: readonly string[]
}

/**
 * Read the reader out of an `/auth/me` body.
 *
 * A pure function so `test/auth.test.ts` can prove the shape without a browser, and so the
 * nested-versus-flat mistake cannot be made silently a sixth time.
 */
export function readReader(body: unknown): Reader {
  const empty: Reader = { handle: null, roles: [] }
  if (typeof body !== 'object' || body === null) return empty
  const nested = (body as MeResponse).user
  if (typeof nested !== 'object' || nested === null) return empty
  return {
    handle: typeof nested.handle === 'string' && nested.handle.length > 0 ? nested.handle : null,
    roles: Array.isArray(nested.roles)
      ? nested.roles.filter((r): r is string => typeof r === 'string')
      : [],
  }
}

/**
 * Whether this reader is one `micro-indexer` will serve.
 *
 * The predicate is the SERVICE's: `authorise` accepts a user principal only when `isAdmin`
 * (`indexer/src/server.ts:695`), and `isAdmin` in `@cloudsforge/auth` is the `admin` role on the
 * token. This is used to word a refusal, never to decide whether to send a request — the request
 * is always sent and the service is always the one that answers, because a client that pre-empts
 * an authorisation decision is a client that will eventually disagree with it.
 */
export function servedByIndexer(reader: Reader): boolean {
  return reader.roles.includes('admin')
}

export type SessionStatus = 'loading' | 'anonymous' | 'signedIn'

export interface Session {
  status: SessionStatus
  account: AccountState
  reader: Reader
  /** True when the signed-in reader holds the role the indexer requires. False when anonymous. */
  served: boolean
  signIn: (returnTo?: string) => void
  signOut: () => void
}

const SessionContext = createContext<Session | null>(null)

export function useSession(): Session {
  const value = useContext(SessionContext)
  // Throwing beats returning a signed-out default: a component rendered outside the provider would
  // otherwise show an anonymous UI to a signed-in reader and nobody would ever see why.
  if (!value) throw new Error('useSession must be used inside <AuthProvider>')
  return value
}

const NOBODY: Reader = { handle: null, roles: [] }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>(() => (hasSession() ? 'loading' : 'anonymous'))
  const [reader, setReader] = useState<Reader>(NOBODY)

  useEffect(() => {
    if (!hasSession()) return
    let live = true
    // The identity call is the one request that is allowed to fail quietly: an unreachable account
    // service must not take a public reference surface down with it.
    nimbus<unknown>('/auth/me')
      .then((profile) => {
        if (!live) return
        setReader(readReader(profile))
        setStatus('signedIn')
      })
      .catch(() => {
        if (!live) return
        setStatus(hasSession() ? 'signedIn' : 'anonymous')
      })
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    const onExpired = () => {
      clearTokens()
      setReader(NOBODY)
      setStatus('anonymous')
    }
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired)
  }, [])

  const doSignOut = useCallback(() => {
    setReader(NOBODY)
    setStatus('anonymous')
    signOut()
  }, [])

  const value = useMemo<Session>(
    () => ({
      status,
      account: {
        signedIn: status === 'signedIn',
        handle: reader.handle,
        roles: reader.roles,
      },
      reader,
      served: status === 'signedIn' && servedByIndexer(reader),
      signIn,
      signOut: doSignOut,
    }),
    [status, reader, doSignOut],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
