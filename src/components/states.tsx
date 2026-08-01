/**
 * The states a screen can be in, as visibly different things.
 *
 * They are separated because collapsing any two of them destroys information the reader needs:
 *
 *   LOADING   — we do not know yet. Waiting is the correct action.
 *   EMPTY     — the query answered, with nothing. Nothing is wrong; there is something to DO.
 *   MISSING   — the chain, or this indexer's record of it, does not contain the thing asked for.
 *               That is an ANSWER, and on this surface it is often the most useful one.
 *   FAILED    — the query did not answer. Retrying may work. The request id is what support needs.
 *   REFUSED   — the request was understood and the authority was not there. Retrying will never
 *               work, and on this surface neither will signing in.
 *
 * A spinner that never resolves, an empty list that was actually a timeout, and a "no results"
 * that was actually a missing scope are the three failures this file exists to prevent. This
 * surface adds a fourth: a 404 that means "no such transaction" rendered identically to a 404 that
 * means "this client asked for a path the service does not serve". `Missing` takes the code, so
 * the two cannot look alike.
 */
import type { ReactNode } from 'react'
import type { ErrorNotice } from '../lib/api.ts'

// Every optional prop is spelled `?: T | undefined`. Under `exactOptionalPropertyTypes` those are
// two different types, and only the second one accepts the `value ?? undefined` a caller writes
// when it may or may not have something to pass.
export function Loading({ label = 'Loading' }: { label?: string | undefined }) {
  return (
    <div className="wt-state wt-state--loading" role="status" aria-live="polite">
      <span className="wt-spinner" aria-hidden="true" />
      <p className="wt-state__title">{label}</p>
    </div>
  )
}

export function Empty({
  title,
  hint,
  action,
}: {
  /** Say what was asked and found nothing. "No data" describes the screen, not the answer. */
  title: string
  hint?: string | undefined
  action?: ReactNode | undefined
}) {
  return (
    <div className="wt-state wt-state--empty" role="status">
      <span className="wt-state__icon" aria-hidden="true">
        ◇
      </span>
      <p className="wt-state__title">{title}</p>
      {hint && <p className="wt-state__hint">{hint}</p>}
      {action && <div className="wt-state__action">{action}</div>}
    </div>
  )
}

/**
 * The thing asked for is not there, and that is a fact about the chain rather than a fault.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE CODE IS SHOWN, AND IT IS NOT DECORATION.
 *
 * `micro-indexer` answers 404 for two entirely different reasons and distinguishes them by CODE,
 * never by status (`indexer/src/server.ts:426-436`):
 *
 *   `transaction_not_found` / `block_not_found` / `token_not_found`
 *       this service asked and the answer is no. A real answer.
 *   `unknown_chain` / `unknown_network`
 *       the path names a chain this estate does not run (`indexer/src/server.ts:583-586`).
 *   `not_found`
 *       the ROUTER's. This client asked for a path the service does not serve — which is a bug in
 *       this bundle and says nothing whatever about the chain.
 *
 * `micro-market` collapsed the first and the last and reported "the on-chain escrow is not
 * confirmed yet" for every activation; `micro-mint` collapsed them the other way and rendered "not
 * yet indexed" on every project page, permanently. Both passed all their own tests. So this
 * component takes the code, prints it, and words the last case as OUR fault rather than the
 * chain's.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
export function Missing({
  title,
  hint,
  notice,
}: {
  title: string
  hint: string
  notice?: ErrorNotice | undefined
}) {
  const ourFault = notice?.code === 'not_found'
  return (
    <div className="wt-state wt-state--missing" role="status">
      <span className="wt-state__icon" aria-hidden="true">
        ○
      </span>
      <p className="wt-state__title">{ourFault ? 'This page asked for the wrong address' : title}</p>
      <p className="wt-state__hint">
        {ourFault
          ? 'The chain index does not serve the path this page requested. That is a defect in this ' +
            'explorer and says nothing about whether the thing you looked for exists.'
          : hint}
      </p>
      {notice?.code && (
        <p className="wt-state__meta">
          The index answered <code className="cf-num ex-code">{notice.code}</code>
          {notice.requestId && (
            <>
              {' '}
              · request <code className="cf-num wt-reqid">{notice.requestId}</code>
            </>
          )}
        </p>
      )}
    </div>
  )
}

/**
 * A failure, with the request id on screen.
 *
 * The id is what the reader quotes and what finds their exact request across every service at
 * once. It is rendered in the monospace token and made selectable on its own line, because it is
 * going to be read aloud down a phone line or pasted into a support form.
 */
export function Failed({
  notice,
  onRetry,
  title = 'That did not load',
}: {
  notice: ErrorNotice
  onRetry?: (() => void) | undefined
  title?: string | undefined
}) {
  return (
    <div className="wt-state wt-state--failed" role="alert">
      <span className="wt-state__icon" aria-hidden="true">
        ■
      </span>
      <p className="wt-state__title">{title}</p>
      <p className="wt-state__hint">{notice.message}</p>
      {notice.requestId && (
        <p className="wt-state__meta">
          Quote this to support: <code className="cf-num wt-reqid">{notice.requestId}</code>
        </p>
      )}
      {onRetry && (
        <div className="wt-state__action">
          <button type="button" className="cf-btn" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * THE STATE THIS SURFACE EXISTS UNDER TODAY.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * A public block explorer cannot read `micro-indexer` anonymously, and this component is where
 * that is said out loud rather than rendered as a broken page.
 *
 * `authorise` (`indexer/src/server.ts:679-697`) takes a service principal holding `indexer:read`
 * (`indexer/src/server.ts:89`, checked at `:691`) or a user principal that `isAdmin` (`:695`).
 * A missing token is a `TokenError` and therefore **401** (`:687`, mapped at `:248-253`); a user
 * without the role is a `ForbiddenError` and therefore **403** (mapped at `:254-258`).
 *
 * The two get different sentences because the remedies differ, and neither sentence is
 * "sign in":
 *
 *   401, anonymous     — the surface is public, the index is not. Nothing you do in this browser
 *                        changes that; the change belongs in `micro-indexer`.
 *   403, signed in     — you are signed in and the index still refuses, because it serves an
 *                        operator or a service, not a customer.
 *
 * **There is no "Sign in" button on this component and there must not be one.** Offering it to the
 * anonymous case would send a visitor through an SSO round trip to arrive at the 403 above, which
 * is the same class of mistake as a client sending a bearer to a route that never wanted one. The
 * shared bar already has a sign-in for the operator who needs it, which is the honest placement:
 * available, not suggested as the fix.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
export function Refused({
  notice,
  signedIn,
  what,
}: {
  notice: ErrorNotice
  /** Whether there is a session at all. It decides which of the two sentences is true. */
  signedIn: boolean
  /** What was being read — "this block", "this address's activity". Used in the first sentence. */
  what: string
}) {
  return (
    <div className="wt-state wt-state--refused" role="alert">
      <span className="wt-state__icon" aria-hidden="true">
        ⊘
      </span>
      <p className="wt-state__title">The chain index would not answer for {what}</p>
      {signedIn ? (
        <p className="wt-state__hint">
          You are signed in, and the index still refused. It serves a CloudsForge service holding
          the <code className="cf-num ex-code">indexer:read</code> scope, or an operator account —
          not an ordinary account. Nothing about your session is wrong.
        </p>
      ) : (
        <p className="wt-state__hint">
          This explorer is public. The chain index behind it is not: it answers only a CloudsForge
          service holding the <code className="cf-num ex-code">indexer:read</code> scope, or an
          operator account. Signing in here would not change that answer, so this page does not ask
          you to.
        </p>
      )}
      <p className="wt-state__meta ex-refused__where">
        Where it is decided:{' '}
        <code className="cf-num ex-code">indexer/src/server.ts:679-697</code>. Until that route is
        opened, blocks and transactions on a public chain are not publicly readable here.
      </p>
      <p className="wt-state__hint">{notice.message}</p>
      {notice.requestId && (
        <p className="wt-state__meta">
          Reference: <code className="cf-num wt-reqid">{notice.requestId}</code>
        </p>
      )}
    </div>
  )
}
