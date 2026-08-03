/**
 * Turning the indexer's facts into words, without inventing any.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * FOUR RULES. THE FIRST TWO ARE THIS ESTATE'S; THE LAST TWO ARE THIS SURFACE'S.
 *
 * **1. Never render a null as a zero.** `confirmations` is null "whenever there is nothing honest
 * to count: pending, dropped, or reorged away" (`indexer/src/reads.ts:209`), and `balances` is
 * ABSENT rather than zero whenever the coverage cannot support one
 * (`indexer/src/reads.ts:259-264`). A nought in either place is a claim the service refused to
 * make.
 *
 * **2. Never colour alone.** The estate's reserved status hues sit ΔE 4.6 apart under protanopia
 * (measured in micro-ui). Every state below carries a word and a glyph, and the tone is third.
 *
 * **3. NEVER SAY "FINAL", AND SAY WHICH HEAD A DEPTH WAS COUNTED AGAINST.** `micro-indexer`
 * measures confirmations two different ways and `indexer/src/reads.ts:18-30` scopes which is
 * which: `confirmation` and `tokenBalances` count against the stored canonical HEAD, and `block`,
 * `transaction` and `activity` count against `checkpoint.tipHeight` — what a provider last
 * claimed. The second can exceed the first by the current lag. See `CONFIRMATIONS_AGAINST` in
 * `src/lib/indexer.ts`; `depthWording` below is where that becomes a sentence.
 *
 * **4. Never divide an amount.** Amounts arrive as decimal strings because a `bigint` does not
 * survive `JSON.stringify` and a `Number` loses the low digits (`indexer/src/reads.ts:8-10`).
 * Nothing in this file calls `Number` on one. A token amount arrives with `amountFormatted: null`
 * on purpose (`indexer/src/reads.ts:374-381`) and is rendered as raw units, labelled as raw.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import type { HeadKind } from './indexer.ts'

/** A state, as a word, a glyph and a tone — in that order of importance. */
export interface Tone {
  readonly word: string
  readonly glyph: string
  readonly tone: 'good' | 'warn' | 'bad' | 'idle'
  readonly meaning: string
}

/* ══════════════════════════════ time ══════════════════════════════ */

/**
 * An ISO timestamp from the service, as a full local date and time.
 *
 * An unparseable value is returned VERBATIM rather than replaced with "Invalid Date": if a service
 * ever puts something unexpected on the wire, a reader seeing the actual string can report it, and
 * one seeing "Invalid Date" can only report that the site is broken.
 */
export function timestamp(iso: string | null): string {
  if (iso === null || iso.length === 0) return '—'
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return iso
  return at.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

/**
 * How long ago, in words, for a timestamp that is about staleness rather than about history.
 *
 * Used for `tipSeenAt`, where the interesting fact is not when the tip was observed but how long
 * this service has been quiet. Returns null rather than a string for an unparseable input, so a
 * caller renders the raw timestamp instead of a confident "0 seconds ago".
 */
export function since(iso: string | null, now: number = Date.now()): string | null {
  if (iso === null || iso.length === 0) return null
  const at = new Date(iso).getTime()
  if (Number.isNaN(at)) return null
  const seconds = Math.floor((now - at) / 1000)
  if (seconds < 0) return 'in the future'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/* ══════════════════════════════ numbers that are not amounts ══════════════════════════════ */

/** A block height or a count. Grouped, because a nine-digit height is unreadable ungrouped. */
export function count(value: number | null): string {
  if (value === null) return '—'
  return value.toLocaleString('en-GB')
}

/**
 * An amount in smallest units, grouped but NEVER scaled.
 *
 * Grouping is presentational and reversible; dividing is not. The service formats the native asset
 * for us (`amountFormatted`) and refuses to format a token's, and this function is what renders the
 * refusal honestly rather than guessing at eighteen decimals.
 */
export function units(raw: string | null): string {
  if (raw === null || raw.length === 0) return '—'
  const negative = raw.startsWith('-')
  const digits = negative ? raw.slice(1) : raw
  if (!/^\d+$/.test(digits)) return raw
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return negative ? `-${grouped}` : grouped
}

/** An address or a hash, shortened for a table cell. The full value is always the title. */
export function abbreviate(value: string, keep = 8): string {
  if (value.length <= keep * 2 + 3) return value
  return `${value.slice(0, keep)}…${value.slice(-keep)}`
}

/* ══════════════════════════════ the reorg vocabulary ══════════════════════════════ */

/**
 * The sentence that goes beside a confirmation count, naming WHICH head it was counted against.
 *
 * This is rule 3 made mechanical. `walked-head` is the only kind this app is willing to describe as
 * a depth that can be acted on, and even then it says "confirmations" rather than "final" — a
 * confirmation depth is a probability, and no number of blocks makes a proof-of-work chain
 * irreversible.
 */
export function depthWording(head: HeadKind): string {
  return head === 'walked-head'
    ? 'counted against the highest block this indexer has walked'
    : 'counted against the tip a provider last claimed, which may be ahead of what this indexer has walked'
}

/** The short label for the same fact, for a table header or a badge title. */
export function depthLabel(head: HeadKind): string {
  return head === 'walked-head' ? 'vs walked head' : 'vs claimed tip'
}

/**
 * The one sentence this app uses instead of the word "final".
 *
 * Exported as a constant so it cannot drift into six softer paraphrases across six screens — the
 * same reason `micro-trade-web` exports `MODELLED`. `test/render.test.ts` requires it on every page
 * that prints a confirmation count.
 */
export const NOT_FINAL =
  'Depth is a probability, not a proof. This page shows how deep a thing is and what that depth ' +
  'was measured against; it never says a thing is final.'

/* ══════════════════════════════ states ══════════════════════════════ */

/**
 * Whether a chain is being followed, halted, or lagging.
 *
 * `halted` is not a degraded state — it is this service saying it has stopped vouching for the
 * chain after a reorg past the alarm depth (`indexer/src/reads.ts:538-541`). It outranks lag.
 */
export function chainTone(status: {
  halted: boolean
  lagBlocks: number | null
  indexedHeight: number | null
  reorgAlarmDepth: number
}): Tone {
  if (status.halted) {
    return {
      word: 'Halted',
      glyph: '⊘',
      tone: 'bad',
      meaning: 'A reorg past the alarm depth stopped this service vouching for the chain',
    }
  }
  if (status.indexedHeight === null) {
    return {
      word: 'Nothing indexed',
      glyph: '○',
      tone: 'idle',
      meaning: 'This service has walked no block on this chain yet',
    }
  }
  // The alarm depth is the estate's own measure of "how far back a rewrite is still plausible", so
  // it is the honest threshold for "this lag matters" rather than a number invented here.
  if (status.lagBlocks !== null && status.lagBlocks > status.reorgAlarmDepth) {
    return {
      word: 'Lagging',
      glyph: '▲',
      tone: 'warn',
      meaning: `Behind the claimed tip by more than the reorg alarm depth (${status.reorgAlarmDepth})`,
    }
  }
  return { word: 'Following', glyph: '●', tone: 'good', meaning: 'Walking the chain at the tip' }
}

/** `indexer/src/reads.ts:63` — the three provider states, unchanged. */
export function providerTone(state: 'healthy' | 'degraded' | 'down'): Tone {
  if (state === 'healthy') {
    return { word: 'Healthy', glyph: '●', tone: 'good', meaning: 'Answering' }
  }
  if (state === 'degraded') {
    return { word: 'Degraded', glyph: '▲', tone: 'warn', meaning: 'Failing some calls, or slow' }
  }
  return { word: 'Down', glyph: '⊘', tone: 'bad', meaning: 'Not answering' }
}

/**
 * A transaction's chain status — `pending`, `success`, `failed`, `dropped` or `orphaned`
 * (`indexer/src/migrations.ts:191`).
 *
 * `failed` is `bad` rather than `warn`, and that distinction is load-bearing: an EVM transaction
 * that reverted "is mined, sits in a block, and accumulates depth exactly like one that worked"
 * (`indexer/src/reads.ts:467-471`), so a reader who takes depth alone as success reads the wrong
 * answer. `orphaned` is not a failure of the transaction at all — the chain changed underneath it.
 */
export function transactionTone(status: string): Tone {
  switch (status) {
    case 'success':
      return { word: 'Succeeded', glyph: '●', tone: 'good', meaning: 'Mined and executed' }
    case 'failed':
      return {
        word: 'Reverted',
        glyph: '⊘',
        tone: 'bad',
        meaning: 'Mined, and it gathers depth like any other — but it did not succeed',
      }
    case 'pending':
      return { word: 'Pending', glyph: '○', tone: 'idle', meaning: 'Seen, not yet in a block' }
    case 'dropped':
      return { word: 'Dropped', glyph: '○', tone: 'warn', meaning: 'Left the mempool unmined' }
    case 'orphaned':
      return {
        word: 'Orphaned',
        glyph: '▲',
        tone: 'warn',
        meaning: 'The block that carried it is no longer on the canonical chain',
      }
    default:
      // Never a guess. An unrecognised status is rendered verbatim so a reader can report the
      // actual string rather than a label this app invented for it.
      return { word: status, glyph: '?', tone: 'idle', meaning: 'A status this page does not know' }
  }
}

/**
 * `indexer/src/reads.ts:124` — activity is `included`, `orphaned` or `conflicted`.
 *
 * **`conflicted` is not a spelling of `orphaned`, and this used to render it as one.** The
 * citation above said "included or orphaned and nothing else"; the service widened the union and
 * the constraint behind it (`indexer/src/migrations.ts:453-455`) and this file went on believing the
 * sentence. The difference is the whole point of the field, and `indexer/src/reads.ts:118-123`
 * states it: an `orphaned` movement may still be re-mined, a `conflicted` one cannot, because the
 * coins behind it have already been spent by a different canonical transaction. Showing the
 * second as the first tells a reader to wait for a confirmation that is never coming.
 *
 * Reachable only on a UTXO family, which is why it went unnoticed: nothing on an EVM chain
 * produces it.
 */
export function activityTone(status: 'included' | 'orphaned' | 'conflicted'): Tone {
  switch (status) {
    case 'included':
      return { word: 'Included', glyph: '●', tone: 'good', meaning: 'On the canonical chain' }
    case 'conflicted':
      return {
        word: 'Conflicted',
        glyph: '⊘',
        tone: 'bad',
        meaning:
          'The coins behind it were spent by a different transaction. Unlike an orphaned movement, this one cannot be re-mined',
      }
    default:
      return {
        word: 'Orphaned',
        glyph: '▲',
        tone: 'warn',
        meaning: 'Retracted by a reorg. This movement did not happen on the chain as it now is',
      }
  }
}

/**
 * Why a balance was withheld — `indexer/src/reads.ts:264`.
 *
 * Each is a full sentence rather than a code, because the whole point of the field is that a
 * consumer must act differently for each, and a reader cannot act on `coverage_incomplete`.
 */
export function unavailableReason(reason: string): string {
  switch (reason) {
    case 'nothing_indexed':
      return 'This service has walked no block on this chain, so it knows nothing about what any address held.'
    case 'coverage_incomplete':
      return 'The canonical chain this service holds does not run unbroken from the genesis block to the height asked for, so a total of the movements it has seen would be a window total rather than a balance.'
    case 'chain_halted':
      return 'This service has stopped vouching for this chain after a reorg past the alarm depth, so it will not answer a holdings question from it.'
    case 'negative':
      return 'The derivation produced a negative balance, which is impossible on a complete record — so the derivation is wrong rather than the address being overdrawn. Withheld rather than clamped to zero.'
    default:
      return `The balance was withheld for a reason this page does not recognise: ${reason}.`
  }
}

/**
 * The five reasons a token observation could not be made — `indexer/src/tokenstate.ts:136-141`.
 *
 * Kept separate from "there is no token there", which is a 404 `token_not_found` and a real answer.
 * That split is the defect `micro-market` and `micro-mint` both spent an outage on.
 */
export function tokenFaultReason(code: string): string {
  switch (code) {
    case 'family_not_supported':
      return 'This build cannot read token state on this chain family. Waiting will not change it.'
    case 'chain_not_followed':
      return 'This replica does not follow this chain, so it has no provider to ask.'
    case 'nothing_indexed':
      return 'This service has walked no block on this chain, so it has no head to make the call at.'
    case 'head_diverged':
      return 'The block this service walked is no longer one the node serves, so the observation would be as at a block that no longer exists.'
    case 'rpc_unavailable':
      return 'The chain could not be reached to ask. This says nothing about whether a token is there.'
    default:
      return `The observation could not be made, for a reason this page does not recognise: ${code}.`
  }
}
