/**
 * The four rules in `src/lib/format.ts`, made mechanical.
 *
 * The one that matters most is the third: a confirmation count on this API is measured against one
 * of two different heads, and `depthWording` is where that becomes a sentence a reader can act on.
 * `micro-indexer` scopes the split at `indexer/src/reads.ts:18-30`, and `test/indexer.test.ts`
 * checks the split against the real source. This file checks the words.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  NOT_FINAL,
  abbreviate,
  activityTone,
  chainTone,
  count,
  depthLabel,
  depthWording,
  providerTone,
  since,
  timestamp,
  tokenFaultReason,
  transactionTone,
  unavailableReason,
  units,
} from '../src/lib/format.ts'

describe('amounts are never divided, and never parsed', () => {
  it('groups without scaling', () => {
    assert.equal(units('1000000000000000000'), '1 000 000 000 000 000 000')
    assert.equal(units('0'), '0')
    assert.equal(units('-42'), '-42')
  })

  it('survives a value no JavaScript number could hold', () => {
    // A uint256 maximum. `Number()` on this loses everything below the 16th digit, which is why
    // the service puts it on the wire as a string (`indexer/src/reads.ts:8-10`).
    const max = '115792089237316195423570985008687907853269984665640564039457584007913129639935'
    assert.equal(units(max).replace(/ /g, ''), max)
  })

  it('returns an unexpected value VERBATIM rather than mangling it', () => {
    // If a service ever puts something unexpected on the wire, a reader seeing the actual string
    // can report it; one seeing "NaN" can only report that the site is broken.
    assert.equal(units('1.5e21'), '1.5e21')
    assert.equal(units('0x10'), '0x10')
  })

  it('renders an absent amount as a dash, not a zero', () => {
    assert.equal(units(null), '—')
    assert.equal(units(''), '—')
  })
})

describe('a null is never a zero', () => {
  it('counts', () => {
    assert.equal(count(null), '—')
    assert.equal(count(0), '0')
  })

  it('timestamps', () => {
    assert.equal(timestamp(null), '—')
    assert.equal(timestamp(''), '—')
  })

  it('and an unparseable timestamp comes back verbatim rather than as "Invalid Date"', () => {
    assert.equal(timestamp('not a date'), 'not a date')
  })

  it('`since` returns null rather than a confident "0s ago" it cannot justify', () => {
    assert.equal(since(null), null)
    assert.equal(since('not a date'), null)
    const now = Date.parse('2026-01-01T00:00:00Z')
    assert.equal(since('2026-01-01T00:00:00Z', now), '0s ago')
    assert.equal(since('2025-12-31T23:59:00Z', now), '1m ago')
    assert.equal(since('2025-12-30T00:00:00Z', now), '2d ago')
    // A clock skew must not read as an enormous age.
    assert.equal(since('2026-01-02T00:00:00Z', now), 'in the future')
  })
})

describe('which head a depth was counted against', () => {
  it('says so, in words, for both kinds', () => {
    assert.match(depthWording('walked-head'), /this indexer has walked/)
    assert.match(depthWording('claimed-tip'), /a provider last claimed/)
    // The claimed-tip wording must carry the WARNING, not merely the fact. A reader who is told
    // only "against the tip" has not been told that the number may be larger than anything this
    // service has looked at.
    assert.match(depthWording('claimed-tip'), /may be ahead of what this indexer has walked/)
  })

  it('has a short form for a badge, and the two are distinguishable', () => {
    assert.equal(depthLabel('walked-head'), 'vs walked head')
    assert.equal(depthLabel('claimed-tip'), 'vs claimed tip')
    assert.notEqual(depthLabel('walked-head'), depthLabel('claimed-tip'))
  })

  it('neither wording uses the word this surface refuses', () => {
    for (const wording of [depthWording('walked-head'), depthWording('claimed-tip'), NOT_FINAL]) {
      assert.doesNotMatch(wording, /\birreversible\b/i)
      assert.doesNotMatch(wording, /\bguarantee/i)
    }
    // And NOT_FINAL says the positive thing rather than only refusing.
    assert.match(NOT_FINAL, /probability, not a proof/)
  })
})

describe('a chain state is a word, a glyph and only then a tone', () => {
  const base = { halted: false, lagBlocks: 0, indexedHeight: 100, reorgAlarmDepth: 12 }

  it('halted outranks everything, because it is this service refusing to vouch', () => {
    const tone = chainTone({ ...base, halted: true, lagBlocks: 0 })
    assert.equal(tone.word, 'Halted')
    assert.equal(tone.tone, 'bad')
  })

  it('nothing indexed is its own state, not a lag of zero', () => {
    const tone = chainTone({ ...base, indexedHeight: null, lagBlocks: null })
    assert.equal(tone.word, 'Nothing indexed')
  })

  it('lag is judged against the chain’s OWN alarm depth, not a number invented here', () => {
    // The alarm depth is the estate's measure of "how far back a rewrite is still plausible", so
    // it is the honest threshold for "this lag matters".
    assert.equal(chainTone({ ...base, lagBlocks: 12 }).word, 'Following')
    assert.equal(chainTone({ ...base, lagBlocks: 13 }).word, 'Lagging')
    assert.equal(chainTone({ ...base, lagBlocks: 13, reorgAlarmDepth: 60 }).word, 'Following')
  })

  it('every tone carries a word and a glyph, so colour is never the only channel', () => {
    const tones = [
      chainTone(base),
      chainTone({ ...base, halted: true }),
      chainTone({ ...base, indexedHeight: null }),
      chainTone({ ...base, lagBlocks: 999 }),
      providerTone('healthy'),
      providerTone('degraded'),
      providerTone('down'),
      activityTone('included'),
      activityTone('orphaned'),
      transactionTone('success'),
      transactionTone('failed'),
      transactionTone('pending'),
      transactionTone('dropped'),
      transactionTone('orphaned'),
    ]
    for (const tone of tones) {
      assert.ok(tone.word.length > 0, JSON.stringify(tone))
      assert.ok(tone.glyph.length > 0, JSON.stringify(tone))
      assert.ok(tone.meaning.length > 0, JSON.stringify(tone))
    }
    // And the glyphs are not all the same, or the second channel carries nothing.
    assert.ok(new Set(tones.map((t) => t.glyph)).size >= 4)
  })
})

describe('a reverted transaction is not a pending one', () => {
  it('reads as bad rather than as something to wait for', () => {
    // "An EVM transaction that reverted is mined, sits in a block, and accumulates depth exactly
    // like one that worked" (`indexer/src/reads.ts:458-462`). A reader who takes depth alone as
    // success reads the wrong answer, so the word has to carry it.
    const tone = transactionTone('failed')
    assert.equal(tone.word, 'Reverted')
    assert.equal(tone.tone, 'bad')
    assert.match(tone.meaning, /it did not succeed/)
  })

  it('and an orphaned one is not a failure of the transaction', () => {
    const tone = transactionTone('orphaned')
    assert.equal(tone.tone, 'warn')
    assert.match(tone.meaning, /no longer on the canonical chain/)
  })

  it('an unrecognised status is rendered VERBATIM rather than guessed at', () => {
    // A label this app invented for a status it does not know would be a confident wrong
    // diagnosis, which is this estate's recurring defect.
    const tone = transactionTone('quarantined')
    assert.equal(tone.word, 'quarantined')
    assert.equal(tone.tone, 'idle')
  })
})

describe('a withheld balance explains itself in a sentence', () => {
  it('covers all four reasons the service can give', () => {
    // `indexer/src/reads.ts:258`. Each is a different action for the reader, which is why none of
    // them is rendered as a code alone.
    for (const reason of ['nothing_indexed', 'coverage_incomplete', 'chain_halted', 'negative']) {
      const sentence = unavailableReason(reason)
      assert.ok(sentence.length > 40, `${reason} has no real sentence`)
      assert.doesNotMatch(sentence, /^\w+_\w+/, `${reason} is rendered as a code`)
    }
  })

  it('never says zero', () => {
    for (const reason of ['nothing_indexed', 'coverage_incomplete', 'chain_halted', 'negative']) {
      assert.doesNotMatch(unavailableReason(reason), /\bis zero\b/)
    }
    assert.match(unavailableReason('negative'), /rather than clamped/)
  })

  it('an unknown reason says it is unknown rather than picking the nearest', () => {
    assert.match(unavailableReason('something_new'), /does not recognise: something_new/)
  })
})

describe('a token fault is never "there is no token here"', () => {
  it('covers all five faults', () => {
    // `indexer/src/tokenstate.ts:136-141`. The split between these and `token_not_found` is the
    // defect micro-market and micro-mint each spent an outage on.
    for (const code of [
      'family_not_supported',
      'chain_not_followed',
      'nothing_indexed',
      'head_diverged',
      'rpc_unavailable',
    ]) {
      const sentence = tokenFaultReason(code)
      assert.ok(sentence.length > 30, `${code} has no real sentence`)
      assert.doesNotMatch(sentence, /no token/i, `${code} reads as "there is no token here"`)
    }
  })

  it('says which fault is permanent, because the reader’s next action differs', () => {
    assert.match(tokenFaultReason('family_not_supported'), /Waiting will not change it/)
    assert.match(tokenFaultReason('rpc_unavailable'), /says nothing about whether a token is there/)
  })
})

describe('abbreviating a hash', () => {
  it('leaves a short value alone', () => {
    assert.equal(abbreviate('0x1234'), '0x1234')
  })

  it('keeps both ends, because the ends are what a reader compares', () => {
    const hash = `0x${'a'.repeat(60)}bcdef012`
    const short = abbreviate(hash)
    assert.ok(short.startsWith('0xaaaaaa'))
    assert.ok(short.endsWith('bcdef012'))
    assert.ok(short.includes('…'))
  })
})
