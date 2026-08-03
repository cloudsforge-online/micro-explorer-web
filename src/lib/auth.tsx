/**
 * Session state for the tree. There is deliberately no gate in front of any route.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE HAS NO `ProtectedRoute`, WHEN EVERY OTHER FRONTEND IN THE ESTATE HAS ONE
 *
 * A gate exists to spare a customer a screen made entirely of 401s by sending them somewhere that
 * fixes it. **Nothing on this surface can produce one.** Every `micro-indexer` route this app
 * calls is anonymous — `authoriseRead` returns `null` for a caller with no token and lets the
 * handler run (`indexer/src/server.ts:792-801`, the branch at `:794`) — and every call is issued
 * with `auth: false` (`publicRead` in `src/lib/indexer.ts`). A gate here would demand a session
 * for public chain facts and would be the defect this repository was built around, arriving from
 * the client's side: `docs/ecosystem/15-monetisation-model.md:50` — "A public chain whose explorer
 * is paywalled is not a public chain."
 *
 * There was a second argument for the absence, and it is now history worth keeping: the reads used
 * to require `indexer:read` or an admin, so a gate would have sent a customer through an SSO round
 * trip to arrive at a 403. That is fixed upstream, the machinery that explained it has been
 * deleted, and the gate stays absent for the stronger reason. `test/auth.test.ts` and
 * `test/routes.test.ts` both assert it, so restoring the estate's usual shape is a decision
 * somebody has to argue for rather than a reflex.
 *
 * The session is still read, and it is used for exactly one thing: the shared company bar — the
 * reader's handle, and the `adminOnly` entries the switcher shows an operator. **It is never
 * consulted before a request and never changes what a page renders.** A client that predicts an
 * authorisation decision is a client that will eventually disagree with the service making it.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ── The `/auth/me` shape, re-read for this repository ─────────────────────────────────────────
 *
 * Identity answers `{ user: {...}, session: {...}, organisations: [...] }` — the profile is
 * **NESTED under `user`**. The route is `GET /auth/me` in `identity/src/server.ts` and the body is built by
 * `toPublicUser` at `identity/src/users.ts:52-63`. Both citations were opened and read against the
 * source for this repository rather than carried over from a sibling.
 *
 * That shape is worth stating because the estate got it wrong at the root: the web template
 * declared `interface Me { handle?, roles? }` and read both fields off the TOP level, where they
 * are not. Four frontends inherited it, `roles` was then always null, `isAdmin` in the shared
 * company bar was always false, and the switcher hid every `adminOnly` entry from every signed-in
 * operator — which is still the consequence here, and the only one.
 *
 * **It is fixed upstream**, and this file follows the template. `micro-web-template/src/lib/auth.tsx:26`
 * declares the nested shape and `:98-99` read `me?.user?.handle` / `me?.user?.roles`. The template
 * accepts ONLY the nested shape and its own comment gives the reason: "Tolerating the flat one as a
 * fallback would encode a response identity does not send, and the next reader would not be able to
 * tell which is real." There is no flat fallback here, and `test/auth.test.ts` pins its absence, so
 * the choice is a decision rather than an omission.
 *
 * On this surface the roles are now cosmetic, and that is a change worth writing down. They used to
 * be the difference between a page that shows blocks and a page that explains why it cannot, back
 * when the index served only an admin. It serves everybody, so `roles` reaches the shared bar and
 * stops there — no panel, no route and no request consults it.
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

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * `servedByIndexer(reader)` USED TO LIVE HERE, AND IT HAS BEEN DELETED.
 *
 * It answered "would the chain index serve this reader" by asking whether they held the `admin`
 * role, because `authorise` accepted a user principal only when `isAdmin`. Its one caller was the
 * standing notice in the shell, which used it to choose between two wordings of the same apology.
 *
 * The reads are anonymous now (`indexer/src/server.ts:792-801`), so the predicate has no true
 * answer other than "yes", the notice is gone, and a helper that can only return one value is a
 * helper somebody eventually reads as meaningful. Nothing in this bundle asks who a reader is
 * before making a request.
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

export type SessionStatus = 'loading' | 'anonymous' | 'signedIn'

export interface Session {
  status: SessionStatus
  account: AccountState
  reader: Reader
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
      signIn,
      signOut: doSignOut,
    }),
    [status, reader, doSignOut],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
