/**
 * WHAT THIS APP IS AND IS NOT ALLOWED TO SAY.
 *
 * These are read out of the SOURCE of each page rather than out of a rendered DOM, for the reason
 * `test/browser-stubs.ts` gives: jsdom is a second browser implementation to keep current, and a
 * test that renders a component in it proves the component renders in jsdom. What is being
 * asserted here is not layout — it is which sentences a page is capable of putting on screen.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE SURFACE'S THREE CLAIMS, EACH ENFORCED
 *
 * **1. Nothing here is final.** A confirmation depth is a probability. `micro-indexer` computes it
 * at read time rather than storing it precisely because "a crediting decision taken against a
 * stale one is the failure the depth exists to prevent" (`indexer/src/reads.ts`). So no page
 * may say final, irreversible or guaranteed, and every page that prints a depth carries
 * `NOT_FINAL`.
 *
 * **2. Every depth says which head it was counted against.** The service counts two ways and
 * `indexer/src/reads.ts` scopes which is which — the same block honestly has two depths,
 * differing by the current lag. A number with no head named is the ambiguity this whole surface
 * exists to remove.
 *
 * **3. A withheld answer is shown as withheld, never as zero and never as a dash.** `balances` is
 * ABSENT rather than zero when the coverage cannot support it (`indexer/src/reads.ts`), and
 * "a missing balance is missing, never zero, because zero is what evicts a token-gated member"
 * (`indexer/src/server.ts`). The reason field is the value of the answer.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { NOT_FINAL } from '../src/lib/format.ts'
import { headerFields } from '../src/lib/indexer.ts'

const at = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url))
const read = (p: string): string => readFileSync(at(p), 'utf8')

/**
 * A page with its comments removed.
 *
 * The vocabulary checks below have to run over what a page can PUT ON SCREEN, not over the notes
 * explaining why it may not. This file, index.html, nginx.conf, src/styles.css and
 * src/lib/format.ts all quote the thing they forbid in order to explain the rule, and a scan of the
 * raw text matches the explanation and fails a correct file — a rule that can only be satisfied by
 * deleting the sentence explaining it is a rule somebody deletes.
 */
const rendered = (p: string): string =>
  read(p)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

const PAGES = readdirSync(at('src/pages')).filter((f) => f.endsWith('.tsx'))

describe('the page set is the one this test thinks it is', () => {
  it('found every page', () => {
    assert.deepEqual(
      PAGES.sort(),
      [
        'address.tsx',
        'block.tsx',
        'chain.tsx',
        'chains.tsx',
        'not-found.tsx',
        'search.tsx',
        'token.tsx',
        'transaction.tsx',
        'unknown-scope.tsx',
      ],
      'a page was added or removed; the rules below have to be applied to it deliberately',
    )
  })
})

describe('nothing on this surface claims finality', () => {
  it('no page says final, irreversible, guaranteed or settled for ever', () => {
    const FORBIDDEN = [
      /\bfinali[sz]ed?\b/i,
      /\birreversible\b/i,
      /\bguarantee[sd]?\b/i,
      /\bcannot be reversed\b/i,
      /\bsettled for ?ever\b/i,
      /\bpermanently confirmed\b/i,
    ]
    for (const page of PAGES) {
      const source = rendered(`src/pages/${page}`)
      for (const pattern of FORBIDDEN) {
        assert.doesNotMatch(source, pattern, `${page} matches ${pattern}`)
      }
    }
  })

  it('the same rule applies to the components, where the words would actually be printed', () => {
    for (const file of readdirSync(at('src/components'))) {
      const source = rendered(`src/components/${file}`)
      assert.doesNotMatch(source, /\bfinali[sz]ed?\b/i, `${file} claims finality`)
      assert.doesNotMatch(source, /\birreversible\b/i, `${file} claims finality`)
    }
  })

  it('and to index.html, which is where a crawler reads the product', () => {
    const html = rendered('index.html')
    for (const pattern of [/\bfinali[sz]ed?\b/i, /\birreversible\b/i, /\bguarantee[sd]?\b/i]) {
      assert.doesNotMatch(html, pattern, `index.html matches ${pattern}`)
    }
  })

  it('the sentence used instead is one string, not six paraphrases', () => {
    // The same discipline micro-trade-web applies to MODELLED. Six softer wordings across six
    // screens is how a careful claim becomes a marketing one, one edit at a time.
    assert.match(NOT_FINAL, /names the block it was measured from/)
    assert.equal(
      [...read('src/lib/format.ts').matchAll(/export const NOT_FINAL/g)].length,
      1,
      'NOT_FINAL is declared more than once',
    )
  })
})

describe('every depth carries the head it was counted against', () => {
  /** Pages that render a `<Depth`. */
  const DEPTH_PAGES = PAGES.filter((p) => read(`src/pages/${p}`).includes('<Depth'))

  it('there are some, so this whole block cannot pass on an empty list', () => {
    assert.deepEqual(DEPTH_PAGES.sort(), ['address.tsx', 'block.tsx', 'transaction.tsx'])
  })

  for (const page of DEPTH_PAGES) {
    it(`${page} carries the depth note`, () => {
      assert.match(
        read(`src/pages/${page}`),
        /<DepthNote>/,
        `${page} prints a depth and never says which head it was counted against`,
      )
    })

    it(`${page} names the head on every Depth it renders`, () => {
      // `head` has no default in the component's props on purpose: a depth with no head named is
      // the exact ambiguity this surface exists to remove, and a default would let one through.
      const source = read(`src/pages/${page}`)
      const depths = [...source.matchAll(/<Depth\b/g)]
      assert.ok(depths.length > 0)
      for (const m of depths) {
        const element = source.slice(m.index, source.indexOf('/>', m.index) + 2)
        assert.match(element, /head=\{CONFIRMATIONS_AGAINST\./, `a <Depth in ${page} names no head`)
      }
    })
  }

  it('the note is rendered ABOVE the numbers it qualifies, not after them', () => {
    // A disclaimer under a table is a disclaimer people scroll past.
    for (const page of DEPTH_PAGES) {
      const source = read(`src/pages/${page}`)
      const note = source.indexOf('<DepthNote>')
      const first = source.indexOf('<Depth\n') >= 0 ? source.indexOf('<Depth\n') : source.indexOf('<Depth ')
      assert.ok(note > 0, `${page} renders no depth note`)
      assert.ok(note < first, `${page} renders the depth note after the depths it qualifies`)
    }
  })

  it('the Depth component takes no default head', () => {
    const source = read('src/components/tone.tsx')
    assert.doesNotMatch(source, /head\s*=\s*['"]/, 'Depth has a default head, so one can be omitted')
    assert.match(source, /head: HeadKind/)
  })
})

describe('a withheld answer is shown as withheld', () => {
  it('the address page renders the reason and prints no number', () => {
    const source = read('src/pages/address.tsx')
    assert.match(source, /h\.unavailable/, 'the withheld branch has gone')
    assert.match(source, /unavailableReason\(h\.unavailable\)/, 'the reason is no longer rendered')
    // The two shapes that would undo it: a zero default, or a nullish coalesce onto '0'.
    assert.doesNotMatch(source, /balance \?\? '0'/, 'a withheld balance is being defaulted to zero')
    assert.doesNotMatch(source, /Number\(/, 'an amount is being parsed as a number')
  })

  it('the token page never renders a fault as "no token here"', () => {
    // `micro-mint` conflated the two and rendered "not yet indexed" on every project page for ever.
    const source = read('src/pages/token.tsx')
    assert.match(source, /FAULTS\.has\(code\)/, 'the fault branch has gone')
    assert.match(source, /token_not_found/, 'the genuine 404 branch has gone')
    // The fault branch must come FIRST, or a 503 falls through to the "no token" screen.
    assert.ok(
      source.indexOf('FAULTS.has(code)') < source.indexOf("code === 'token_not_found'"),
      'a fault would fall through to the "no token at that address" screen',
    )
  })

  it('nothing in this bundle turns an amount into a JavaScript number', () => {
    // A uint256 does not survive one, and `Number(amount)` "silently loses the low digits of any
    // 18-decimal value above about 9 ETH" (`indexer/src/reads.ts`).
    for (const dir of ['src/pages', 'src/components', 'src/lib']) {
      for (const file of readdirSync(at(dir))) {
        if (!file.endsWith('.ts') && !file.endsWith('.tsx')) continue
        const source = rendered(`${dir}/${file}`)
        assert.doesNotMatch(
          source,
          /Number\((?:amount|balance|value|totalSupply|cap|fee)\b/,
          `${dir}/${file} parses an amount with Number`,
        )
        assert.doesNotMatch(source, /parseFloat\(/, `${dir}/${file} uses parseFloat`)
      }
    }
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE REFUSAL MACHINERY IS GONE, AND THIS IS THE CHECK THAT KEEPS IT GONE.
 *
 * This block used to assert the opposite: that every page reading the chain index rendered a
 * `<Refused>` panel, that it offered no sign-in, and that it printed the line where the refusal was
 * decided. All of that was correct while `micro-indexer` served only a scoped service or an admin.
 * It opened the seven reads (`authoriseRead`, `indexer/src/server.ts`), and a surface that
 * goes on explaining a restriction nobody is under is worse than one that never had it — a reader
 * believes it, and nothing on the page tells them it is stale.
 *
 * So the assertions are inverted rather than deleted. A refusal panel, a standing notice, or a
 * sentence telling somebody to acquire `indexer:read` reappearing in this bundle is now a failure.
 * ══════════════════════════════════════════════════════════════════════════════════════════════ */

describe('nothing on this surface apologises for an authority it does not need', () => {
  const ALL = [
    ...PAGES.map((p) => `src/pages/${p}`),
    ...readdirSync(at('src/components')).map((f) => `src/components/${f}`),
    ...readdirSync(at('src/lib')).map((f) => `src/lib/${f}`),
  ].filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))

  it('found the files it thinks it did, so this cannot pass on an empty sweep', () => {
    assert.ok(ALL.length >= 18, `swept only ${ALL.length} files`)
  })

  it('no file renders a refusal state', () => {
    for (const file of ALL) {
      const source = rendered(file)
      assert.doesNotMatch(source, /<Refused\b/, `${file} renders a refusal panel`)
      assert.doesNotMatch(source, /state === 'refused'/, `${file} branches on a refusal state`)
      assert.doesNotMatch(source, /\brefused\b\s*:/, `${file} carries a refused flag`)
    }
  })

  it('no page tells a reader to hold a scope, or that signing in would not help', () => {
    // The exact sentences this surface used to print, plus the shape of the argument they made.
    // A page that says either has re-acquired a claim nobody is measuring.
    for (const file of ALL.concat(['index.html'])) {
      const source = rendered(file)
      assert.doesNotMatch(source, /indexer:read/, `${file} tells a reader to acquire indexer:read`)
      assert.doesNotMatch(source, /would not change that/i, `${file} argues about signing in`)
      assert.doesNotMatch(source, /operator account/i, `${file} explains who the index serves`)
    }
  })

  it('the states module exports the four that remain, and no fifth', () => {
    const exported = [...read('src/components/states.tsx').matchAll(/^export function (\w+)/gm)].map(
      (m) => m[1],
    )
    assert.deepEqual(exported.sort(), ['Empty', 'Failed', 'Loading', 'Missing'])
  })

  it('every page that reads the index renders its answer, and a plain failure when it cannot', () => {
    // The positive half, so this block cannot be satisfied by a page that renders nothing at all.
    for (const page of ['chain', 'block', 'transaction', 'address', 'token', 'chains']) {
      const source = read(`src/pages/${page}.tsx`)
      assert.match(source, /<Failed\b/, `${page}.tsx has no failure state`)
      assert.match(source, /useResource</, `${page}.tsx reads nothing`)
    }
  })

  it('the shell renders no standing notice about the index', () => {
    const source = rendered('src/components/shell.tsx')
    assert.doesNotMatch(source, /ex-notice/, 'the standing notice is back')
    assert.doesNotMatch(source, /chain index behind it/i, 'the standing notice is back, reworded')
    // The one notice that remains is about a wrong hostname, which is a real and current fault.
    assert.match(source, /surface registry does not/)
  })
})

describe('a 404 that is an answer does not look like a 404 that is our fault', () => {
  it('the Missing component branches on the CODE, not on the status', () => {
    const source = read('src/components/states.tsx')
    assert.match(source, /notice\?\.code === 'not_found'/, 'the router 404 is no longer separated')
    assert.match(source, /That is a defect in this|defect in this/, 'our own fault is no longer worded as ours')
  })

  it('the transaction page separates transaction_not_found from a router 404', () => {
    // The exact split `indexer/src/server.ts` exists to make possible, and the one
    // `micro-market` collapsed.
    const source = read('src/pages/transaction.tsx')
    assert.match(source, /code === 'transaction_not_found'/)
    assert.match(source, /a different thing from not yet deep enough/i)
  })
})

describe('the verbatim header table is a sort and never a filter', () => {
  // micro-org#395. The note above that table says nothing is renamed, reinterpreted or left out,
  // and for the whole life of the page it sat above four rows, because `indexer/src/evm.ts`
  // narrowed the header before it reached a database. The narrowing was fixed there; what can go
  // wrong HERE is the same mistake in this repository's own hand — an ordering helper that
  // quietly becomes a known-fields list, because listing the fields somebody recognises is the
  // obvious way to order them and it reads as tidier than the alternative.
  //
  // EMBER mainnet genesis, as `eth_getBlockByNumber("0x0", true)` answered
  // `https://rpc.cloudsforge.online` on 2026-08-12, minus the body the indexer drops. Keyed in the
  // order jsonb hands it back — by key length, then bytewise — which is the order this table was
  // rendering in and the reason it could not be laid beside `curl` output by eye.
  const GENESIS: Record<string, unknown> = {
    hash: '0x0bd75ff12fe407213d4b5e43fc10777e5c24ee0484d3ea07ed1fa3516289900b',
    size: '0x236',
    miner: `0x${'0'.repeat(40)}`,
    nonce: '0x0000000000000000',
    number: '0x0',
    uncles: [],
    gasUsed: '0x0',
    mixHash: `0x${'0'.repeat(64)}`,
    gasLimit: '0x1c9c380',
    extraData: '0x6865617274682f37343131',
    logsBloom: `0x${'0'.repeat(512)}`,
    stateRoot: '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421',
    timestamp: '0x684ee180',
    difficulty: '0x0',
    parentHash: `0x${'0'.repeat(64)}`,
    sha3Uncles: '0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347',
    receiptsRoot: '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421',
    totalDifficulty: '0x0',
    transactionsRoot: '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421',
  }

  it('everything handed in comes back out, including a field this bundle has never heard of', () => {
    // `hearthFlux` is not an Ethereum header field and never will be. It stands in for the next
    // one that IS: `baseFeePerGas`, `withdrawalsRoot` and `blobGasUsed` each arrived after the
    // last person to write down what a header contains, and each would have been dropped by a
    // helper that only emits what it recognises.
    const detail: Record<string, unknown> = { ...GENESIS, hearthFlux: '0x2a' }
    const shown = headerFields(detail)

    assert.deepEqual(
      shown.map(([key]) => key).sort(),
      Object.keys(detail).sort(),
      'the header table is selecting: a field went in and did not come out',
    )
    assert.equal(shown.length, Object.keys(detail).length, 'a field was emitted twice')
    for (const [key, value] of shown) {
      assert.equal(value, detail[key], `${key} came back holding something else`)
    }
    assert.equal(
      shown.at(-1)?.[0],
      'hearthFlux',
      'an unrecognised field must be appended and visible, not sorted away or dropped',
    )
  })

  it('the state root is on screen, above the fields a reader is likelier to skim past', () => {
    // The specific row micro-org#395 was filed about. On an account-model chain the premine lives
    // in the genesis allocation and the header commits to it, so block 0's state root — here the
    // canonical empty-trie root — is the only cryptographic evidence that nobody held a balance
    // before the first block was mined. It is asserted by POSITION as well as presence because a
    // proof that renders somewhere below a 514-character bloom filter is a proof nobody reads.
    const keys = headerFields(GENESIS).map(([key]) => key)
    assert.ok(keys.includes('stateRoot'), 'the one field the issue is about is not rendered')
    assert.equal(
      GENESIS['stateRoot'],
      '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421',
      'the empty-trie root is no longer what an unallocated genesis reports',
    )
    assert.ok(
      keys.indexOf('stateRoot') < keys.indexOf('miner'),
      'the rows are no longer in the order a node lists a header in',
    )
    assert.equal(keys[0], 'number', 'a header is listed from its number down; this one is not')
  })

  it('the block page routes the table through that helper rather than iterating storage order', () => {
    const source = rendered('src/pages/block.tsx')
    assert.match(source, /headerFields\(block\.detail\)/, 'the table no longer sorts its rows')
    assert.doesNotMatch(
      source,
      /Object\.entries\(block\.detail\)/,
      'the table is back to jsonb order, which cannot be compared against a node by eye',
    )
  })

  it('the note above the table promises only what this app can vouch for', () => {
    // It may not promise the NODE's whole header. A block walked before micro-indexer's migration
    // 10 re-walks it still holds four fields, and the reader who checks that promise against their
    // own node is exactly the reader this page is for.
    const source = rendered('src/pages/block.tsx')
    assert.match(source, /Every field the chain index holds for this block/)
    assert.doesNotMatch(source, /every field the node (sent|gave)/i)
  })
})
