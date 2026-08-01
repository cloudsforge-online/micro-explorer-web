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
 * stale one is the failure the depth exists to prevent" (`indexer/src/reads.ts:11-13`). So no page
 * may say final, irreversible or guaranteed, and every page that prints a depth carries
 * `NOT_FINAL`.
 *
 * **2. Every depth says which head it was counted against.** The service counts two ways and
 * `indexer/src/reads.ts:18-30` scopes which is which — the same block honestly has two depths,
 * differing by the current lag. A number with no head named is the ambiguity this whole surface
 * exists to remove.
 *
 * **3. A withheld answer is shown as withheld, never as zero and never as a dash.** `balances` is
 * ABSENT rather than zero when the coverage cannot support it (`indexer/src/reads.ts:225-259`), and
 * "a missing balance is missing, never zero, because zero is what evicts a token-gated member"
 * (`indexer/src/server.ts:460-461`). The reason field is the value of the answer.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { NOT_FINAL } from '../src/lib/format.ts'

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
    assert.match(NOT_FINAL, /never says a thing is final/)
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
    // 18-decimal value above about 9 ETH" (`indexer/src/reads.ts:8-10`).
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

describe('a refusal is worded as a refusal, and never as a reason to sign in', () => {
  it('the refusal component offers no sign-in', () => {
    // Sending an anonymous visitor to sign in would take them through an SSO round trip to arrive
    // at the 403 an ordinary account gets. The shared bar already carries a sign-in for the
    // operator who needs one, which is the honest placement: available, not suggested as the fix.
    const source = rendered('src/components/states.tsx')
    assert.doesNotMatch(source, /onSignIn|signIn\(/, 'the refusal offers a sign-in')
    assert.match(source, /Signing in here would not change that/)
  })

  it('it says WHERE the decision is made, so a reader can check it', () => {
    assert.match(read('src/components/states.tsx'), /indexer\/src\/server\.ts:679-697/)
    assert.match(read('src/components/shell.tsx'), /indexer\/src\/server\.ts:679-697/)
  })

  it('every page that reads the index renders the refusal state', () => {
    for (const page of ['chain', 'block', 'transaction', 'address', 'token']) {
      const source = read(`src/pages/${page}.tsx`)
      assert.match(source, /<Refused\b/, `${page}.tsx has no refusal state`)
      assert.match(source, /state === 'refused'/, `${page}.tsx never checks for one`)
    }
  })

  it('and the two pages that read nothing render no refusal, because there is nothing to refuse', () => {
    for (const page of ['search', 'chains']) {
      assert.doesNotMatch(read(`src/pages/${page}.tsx`), /<Refused\b/, `${page}.tsx refuses something`)
    }
  })
})

describe('a 404 that is an answer does not look like a 404 that is our fault', () => {
  it('the Missing component branches on the CODE, not on the status', () => {
    const source = read('src/components/states.tsx')
    assert.match(source, /notice\?\.code === 'not_found'/, 'the router 404 is no longer separated')
    assert.match(source, /That is a defect in this|defect in this/, 'our own fault is no longer worded as ours')
  })

  it('the transaction page separates transaction_not_found from a router 404', () => {
    // The exact split `indexer/src/server.ts:426-436` exists to make possible, and the one
    // `micro-market` collapsed.
    const source = read('src/pages/transaction.tsx')
    assert.match(source, /code === 'transaction_not_found'/)
    assert.match(source, /which is not the same as unconfirmed/i)
  })
})
