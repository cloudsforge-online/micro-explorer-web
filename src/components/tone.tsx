/**
 * A state, rendered as a word, a glyph and a tone — in that order of importance.
 *
 * The word is never optional and the glyph is never the only non-colour channel. The estate's
 * reserved status hues sit ΔE 4.6 apart under protanopia, measured in micro-ui, which is why
 * status-web encodes every day three times. A badge that said what it meant only by being amber
 * would say nothing at all to a reader who cannot separate it from the green one.
 */
import type { ReactNode } from 'react'
import type { Tone } from '../lib/format.ts'
import type { HeadKind } from '../lib/indexer.ts'
import { NOT_FINAL, count, depthLabel, depthWording } from '../lib/format.ts'

export function StateBadge({ tone, title }: { tone: Tone; title?: string | undefined }) {
  return (
    <span className={`ex-badge ex-badge--${tone.tone}`} title={title ?? tone.meaning}>
      <span className="ex-badge__glyph" aria-hidden="true">
        {tone.glyph}
      </span>
      <span className="ex-badge__word">{tone.word}</span>
    </span>
  )
}

/** A label and its value, as a definition pair. The value may be a node — a badge, a link. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ex-fact">
      <dt className="ex-fact__label">{label}</dt>
      <dd className="ex-fact__value">{children}</dd>
    </div>
  )
}

/**
 * A value that may be absent, where absence is a real answer rather than a rendering problem.
 *
 * `missing` is the SENTENCE, not a dash. `confirmations` is null "whenever there is nothing honest
 * to count: pending, dropped, or reorged away" (`indexer/src/reads.ts:209`), and rendering that as
 * `0` would be a claim about depth that the service explicitly declined to make.
 */
export function Maybe({ value, missing }: { value: string | null; missing: string }) {
  if (value === null || value.length === 0) {
    return <span className="ex-absent">{missing}</span>
  }
  return <span className="cf-num">{value}</span>
}

/** A hash or an address: monospace, selectable whole, and never truncated in the DOM. */
export function Hex({ value, short = false }: { value: string; short?: boolean }) {
  return (
    <code className="cf-num ex-hex" title={value}>
      {short ? `${value.slice(0, 10)}…${value.slice(-8)}` : value}
    </code>
  )
}

/**
 * A confirmation count, WITH the head it was counted against.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE COMPONENT THIS WHOLE SURFACE TURNS ON.
 *
 * `micro-indexer` counts confirmations two different ways and `indexer/src/reads.ts:18-30` scopes
 * which is which. `confirmation` counts against the stored canonical HEAD — "what this service has
 * actually walked and would have detected a reorg in". `block`, `transaction` and `activity` count
 * against `checkpoint.tipHeight` — "what a provider last claimed" — at
 * `indexer/src/reads.ts:579`, `:415-418` and `:353-356`. The same block therefore has two honest
 * depths, and the second can exceed the first by the current lag.
 *
 * So a number on its own is not a fact on this surface. Every count rendered by this app goes
 * through here and carries `head`, and the word "final" appears nowhere in this bundle: a
 * confirmation depth is a probability, and `indexer/src/reads.ts:12-13` says the reason a depth is
 * computed at read time rather than stored is that "a crediting decision taken against a stale one
 * is the failure the depth exists to prevent".
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
export function Depth({
  confirmations,
  required,
  head,
}: {
  confirmations: number | null
  /** The depth this chain credits at, from the answer itself — never a constant held here. */
  required?: number | undefined
  head: HeadKind
}) {
  if (confirmations === null) {
    return (
      <span className="ex-depth ex-depth--none" title={depthWording(head)}>
        <span className="ex-absent">
          no depth to count — this is not on the canonical chain, or not in a block yet
        </span>
      </span>
    )
  }
  return (
    <span className="ex-depth" title={depthWording(head)}>
      <span className="cf-num ex-depth__n">{count(confirmations)}</span>
      {required !== undefined && (
        <span className="ex-depth__of">
          {' of '}
          <span className="cf-num">{count(required)}</span>
        </span>
      )}
      <span className="ex-depth__head">{depthLabel(head)}</span>
    </span>
  )
}

/**
 * The sentence every page that prints a depth has to carry.
 *
 * One string, exported from `src/lib/format.ts`, so it cannot drift into six softer paraphrases
 * across six screens. `test/render.test.ts` requires it on every page that renders a `<Depth`.
 */
export function DepthNote({ children }: { children?: ReactNode }) {
  return (
    <p className="ex-note ex-note--depth" role="note">
      <span className="ex-note__icon" aria-hidden="true">
        ◐
      </span>
      <span>
        <strong>{NOT_FINAL}</strong> {children}
      </span>
    </p>
  )
}

/** A plain advisory panel. Warn tone for something the reader must weigh, not an error. */
export function Note({ tone = 'plain', children }: { tone?: 'plain' | 'warn'; children: ReactNode }) {
  return (
    <p className={`ex-note ex-note--${tone}`} role="note">
      <span className="ex-note__icon" aria-hidden="true">
        {tone === 'warn' ? '▲' : '·'}
      </span>
      <span>{children}</span>
    </p>
  )
}
