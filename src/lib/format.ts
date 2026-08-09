/**
 * Turning the indexer's facts into words, without inventing any.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * FOUR RULES. THE FIRST TWO ARE THIS ESTATE'S; THE LAST TWO ARE THIS SURFACE'S.
 *
 * **1. Never render a null as a zero.** `confirmations` is null "whenever there is nothing honest
 * to count: pending, dropped, or reorged away" (`indexer/src/reads.ts`), and `balances` is
 * ABSENT rather than zero whenever the coverage cannot support one
 * (`indexer/src/reads.ts`). A nought in either place is a claim the service refused to
 * make.
 *
 * **2. Never colour alone.** The estate's reserved status hues sit ΔE 4.6 apart under protanopia
 * (measured in micro-ui). Every state below carries a word and a glyph, and the tone is third.
 *
 * **3. NEVER SAY "FINAL", AND SAY WHICH HEAD A DEPTH WAS COUNTED AGAINST.** `micro-indexer`
 * measures confirmations two different ways and `indexer/src/reads.ts` scopes which is
 * which: `confirmation` and `tokenBalances` count against the stored canonical HEAD, and `block`,
 * `transaction` and `activity` count against `checkpoint.tipHeight` — what a provider last
 * claimed. The second can exceed the first by the current lag. See `CONFIRMATIONS_AGAINST` in
 * `src/lib/indexer.ts`; `depthWording` below is where that becomes a sentence.
 *
 * **4. Never divide an amount.** Amounts arrive as decimal strings because a `bigint` does not
 * survive `JSON.stringify` and a `Number` loses the low digits (`indexer/src/reads.ts`).
 * Nothing in this file calls `Number` on one. A token amount arrives with `amountFormatted: null`
 * on purpose (`indexer/src/reads.ts`) and is rendered as raw units, labelled as raw.
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
    ? 'measured from the highest block this indexer has walked for itself'
    : 'measured from the top of the chain as a provider last reported it, which may be ahead of what this indexer has walked'
}

/** The short label for the same fact, for a table header or a badge title. */
export function depthLabel(head: HeadKind): string {
  return head === 'walked-head' ? 'from the block we read' : 'from the provider tip'
}

/**
 * The one sentence this app uses instead of the word "final".
 *
 * Exported as a constant so it cannot drift into six softer paraphrases across six screens — the
 * same reason `micro-trade-web` exports `MODELLED`. `test/render.test.ts` requires it on every page
 * that prints a confirmation count.
 */
export const NOT_FINAL =
  'A depth measures how unlikely a reversal has become. It is not a proof that one cannot happen, ' +
  'so every count here names the block it was measured from.'

/* ══════════════════════════════ states ══════════════════════════════ */

/**
 * Whether a chain is being followed, halted, or lagging.
 *
 * `halted` is not a degraded state — it is this service saying it has stopped vouching for the
 * chain after a reorg past the alarm depth (`indexer/src/reads.ts`). It outranks lag.
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
      meaning: 'A rewrite past the alarm threshold stopped this service standing behind the chain',
    }
  }
  if (status.indexedHeight === null) {
    return {
      word: 'Nothing read',
      glyph: '○',
      tone: 'idle',
      meaning: 'Not a single block of this chain has been read here',
    }
  }
  // The alarm depth is the estate's own measure of "how far back a rewrite is still plausible", so
  // it is the honest threshold for "this lag matters" rather than a number invented here.
  if (status.lagBlocks !== null && status.lagBlocks > status.reorgAlarmDepth) {
    return {
      word: 'Lagging',
      glyph: '▲',
      tone: 'warn',
      meaning: `Short of the provider's tip by more than the alarm threshold of ${status.reorgAlarmDepth} blocks`,
    }
  }
  return { word: 'Following', glyph: '●', tone: 'good', meaning: 'Keeping pace with the top of the chain' }
}

/** `indexer/src/reads.ts` — the three provider states, unchanged. */
export function providerTone(state: 'healthy' | 'degraded' | 'down'): Tone {
  if (state === 'healthy') {
    return { word: 'Healthy', glyph: '●', tone: 'good', meaning: 'Answering promptly' }
  }
  if (state === 'degraded') {
    return { word: 'Degraded', glyph: '▲', tone: 'warn', meaning: 'Slow, or dropping some of what it is asked' }
  }
  return { word: 'Down', glyph: '⊘', tone: 'bad', meaning: 'Not answering at all' }
}

/**
 * A transaction's chain status — `pending`, `success`, `failed`, `dropped` or `orphaned`
 * (`indexer/src/migrations.ts`).
 *
 * `failed` is `bad` rather than `warn`, and that distinction is load-bearing: an EVM transaction
 * that reverted "is mined, sits in a block, and accumulates depth exactly like one that worked"
 * (`indexer/src/reads.ts`), so a reader who takes depth alone as success reads the wrong
 * answer. `orphaned` is not a failure of the transaction at all — the chain changed underneath it.
 */
export function transactionTone(status: string): Tone {
  switch (status) {
    case 'success':
      return { word: 'Succeeded', glyph: '●', tone: 'good', meaning: 'Mined, and it ran to completion' }
    case 'failed':
      return {
        word: 'Reverted',
        glyph: '⊘',
        tone: 'bad',
        meaning: 'Mined, and gathering depth like any other, but it did not succeed',
      }
    case 'pending':
      return { word: 'Pending', glyph: '○', tone: 'idle', meaning: 'Noticed, and not yet in a block' }
    case 'dropped':
      return { word: 'Dropped', glyph: '○', tone: 'warn', meaning: 'Fell out of the waiting queue without being mined' }
    case 'orphaned':
      return {
        word: 'Orphaned',
        glyph: '▲',
        tone: 'warn',
        meaning: 'The block that carried it is no longer part of the accepted chain',
      }
    default:
      // Never a guess. An unrecognised status is rendered verbatim so a reader can report the
      // actual string rather than a label this app invented for it.
      return { word: status, glyph: '?', tone: 'idle', meaning: 'A word this page has not been taught' }
  }
}

/**
 * `indexer/src/reads.ts` — activity is `included`, `orphaned` or `conflicted`.
 *
 * **`conflicted` is not a spelling of `orphaned`, and this used to render it as one.** The
 * citation above said "included or orphaned and nothing else"; the service widened the union and
 * the constraint behind it (`indexer/src/migrations.ts`) and this file went on believing the
 * sentence. The difference is the whole point of the field, and `indexer/src/reads.ts`
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
      return { word: 'Included', glyph: '●', tone: 'good', meaning: 'Part of the chain everyone accepts' }
    case 'conflicted':
      return {
        word: 'Conflicted',
        glyph: '⊘',
        tone: 'bad',
        meaning:
          'A different transaction has already spent the coins behind it. An orphaned movement can be mined again; this one cannot',
      }
    default:
      return {
        word: 'Orphaned',
        glyph: '▲',
        tone: 'warn',
        meaning: 'Taken back when the chain rewrote itself. On the chain as it now stands, this never happened',
      }
  }
}

/**
 * Why a balance was withheld — `indexer/src/reads.ts`.
 *
 * Each is a full sentence rather than a code, because the whole point of the field is that a
 * consumer must act differently for each, and a reader cannot act on `coverage_incomplete`.
 */
export function unavailableReason(reason: string): string {
  switch (reason) {
    case 'nothing_indexed':
      return 'Not one block of this chain has been read here, so nothing is known about what any address has ever held.'
    case 'coverage_incomplete':
      return 'The record held here has a gap in it between the first block and the height you asked about. Adding up the movements either side of that gap would give you the total for a window, which is not a balance.'
    case 'chain_halted':
      return 'A rewrite past the alarm threshold stopped this service standing behind this chain, so it declines to tell you what anything holds on it.'
    case 'negative':
      return 'Working the balance out produced a number below zero, which a complete record cannot do. The arithmetic is wrong rather than the address being overdrawn, so nothing is shown — rounding it up to nought would hide the fault, not fix it.'
    default:
      return `The balance is held back for a reason this page does not recognise: ${reason}.`
  }
}

/**
 * The five reasons a token observation could not be made — `indexer/src/tokenstate.ts`.
 *
 * Kept separate from "there is no token there", which is a 404 `token_not_found` and a real answer.
 * That split is the defect `micro-market` and `micro-mint` both spent an outage on.
 */
export function tokenFaultReason(code: string): string {
  switch (code) {
    case 'family_not_supported':
      return 'Nothing in this build knows how to read a token on this kind of chain. Waiting will not change it.'
    case 'chain_not_followed':
      return 'This deployment does not follow that chain, so it has nowhere to put the question.'
    case 'nothing_indexed':
      return 'Not one block of this chain has been read here, so there is no point in the chain at which to ask.'
    case 'head_diverged':
      return 'The block this service had reached is one the node no longer recognises, so any reading would be taken at a point in history that has since been rewritten.'
    case 'rpc_unavailable':
      return 'Nothing could be reached to ask. That says nothing about whether a token is there.'
    default:
      return `The reading could not be taken, for a reason this page does not recognise: ${code}.`
  }
}

/* ══════════════════════ not recorded, which is not the same as nothing happened ══════════════════════ */

/**
 * Why an address's page of movements is not that address's record — `indexer/src/reads.ts`.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THIS IS RULE 1 AGAIN, ON THE ONE FIELD WHERE BREAKING IT COSTS NOTHING AT RENDER TIME.
 *
 * Rule 1 at the top of this file is "never render a null as a zero", and every other place it
 * applies has something visibly missing to point at: a `confirmations` of null, an absent
 * `balances`. Here there is nothing missing to see. The service answers 200, the page is
 * well-formed, `items` is `[]`, and a surface that says "nothing has moved through this address"
 * has produced a fluent, confident, false sentence with no error anywhere for anybody to notice.
 * That is worse than a failure, because a failure is disbelieved.
 *
 * So the wording says what is and is not known, in that order, and never offers a reassurance the
 * record cannot support. It deliberately does not say "you are not a customer" or anything else
 * about WHY an address was not watched: which addresses a deployment watches is the estate's
 * business and the reader's address is their own, and an explorer that hinted at the membership of
 * that set would be publishing it one query at a time.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
export function unrecordedReason(reason: string): string {
  switch (reason) {
    case 'address_not_watched':
      return 'This deployment writes down what moved only for the addresses it was asked to watch, and this address is not one of them. So there is no record here to read — which is not the same as a record showing nothing, and this page will not show you one in place of the other.'
    default:
      return `The record for this address is not complete, for a reason this page does not recognise: ${reason}.`
  }
}

/**
 * What a block's `partial` marker says was not stored for it — `indexer/src/btcsource.ts`.
 *
 * Two reasons, two different sentences, because they leave a reader able to believe different
 * things. After `transactions-not-fetched` the block cannot answer "was my transaction mined" for
 * any hash at all; after `watched-addresses-only` it answers that perfectly well for every hash and
 * is silent only about who was paid. Wording both as "this block is incomplete" would throw away
 * the half of the answer that is still good.
 */
export function partialBlockReason(marker: string): string {
  switch (marker) {
    case 'transactions-not-fetched':
      return 'Only this block’s header was fetched. A filter said none of its transactions concerned the addresses being watched, so the body was never downloaded — nothing about what this block carried is stored here, and the transaction list below is empty for that reason rather than because the block was.'
    case 'watched-addresses-only':
      return 'Every transaction in this block is stored, and the list below is the whole of it. What is not complete is who was paid: movements were written down only for the addresses this deployment was watching at the time, so an address page for anybody else will be short of this block.'
    default:
      return `Something about this block was not stored, for a reason this page does not recognise: ${marker}.`
  }
}
