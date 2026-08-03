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
 *
 * A spinner that never resolves, an empty list that was actually a timeout, and a "no results"
 * that was actually a missing scope are the three failures this file exists to prevent. This
 * surface adds a fourth: a 404 that means "no such transaction" rendered identically to a 404 that
 * means "this client asked for a path the service does not serve". `Missing` takes the code, so
 * the two cannot look alike.
 *
 * There were five of these. The fifth is gone, and the note where it stood says why.
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
 * never by status (`indexer/src/server.ts:468-478`):
 *
 *   `transaction_not_found` / `block_not_found` / `token_not_found`
 *       this service asked and the answer is no. A real answer.
 *   `unknown_chain` / `unknown_network`
 *       the path names a chain this estate does not run (`indexer/src/server.ts:667-670`).
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

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * THERE WAS A FIFTH STATE HERE, `Refused`, AND IT HAS BEEN DELETED.
 *
 * It existed because every `micro-indexer` read demanded a service principal holding `indexer:read`
 * or an admin user, so an anonymous visitor got 401 and an ordinary customer got 403, and a public
 * block explorer could render nothing to the public. This surface said which refusal had happened
 * and where it was decided, rather than showing an empty page or offering a sign-in that would not
 * have helped.
 *
 * `micro-indexer` opened the seven reads (`authoriseRead`, `indexer/src/server.ts:792-801`), and
 * `test/indexer.test.ts` went red the same day — which is exactly what it was written to do. A
 * component that explains a restriction nobody is subject to is worse than one that never existed,
 * because a reader believes it. So it is gone, and so are the standing notice in the shell, the
 * `refused` resource state, and the `served` predicate the wording branched on.
 *
 * A 401 or a 403 from the chain index now lands in `Failed`, which is correct: this bundle presents
 * no credential (`publicRead` in src/lib/indexer.ts), so nothing it sends can lack one, and an auth
 * status arriving anyway is a fault in the service or in something in front of it.
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */
