/**
 * A RETIRED ASSET CODE NEVER REACHES A SURFACE A USER CAN READ.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS IS A CORRECTNESS RULE AND NOT A COPY RULE
 *
 * `/chains` carried a heading — "Why there is no SHARD here" — explaining that SHARD "is a
 * CloudsForge balance rather than a chain". It was written while that was true. It is not now:
 * `contracts/packages/chain/src/index.ts` declares `RETIRED_ASSETS = ['SHARD']` and
 * `IssuableAssetCode` is `Exclude<AssetCode, 'SHARD'>`. SHARD was migrated to EMBER.
 *
 * On a platform holding real money, a live product naming a retired asset as one of a user's
 * balances is the same class of defect as `mint` charging SHARD after retirement — which broke
 * Forge Create for every user, because the shipped wallet spent an asset the shipped ledger
 * refused. The copy was not the cause there either. It was the visible end of a stale assumption,
 * and the assumption is what this guards.
 *
 * ── "SPARKS" IS NOT THIS, AND MUST NEVER BE SWEPT UP BY IT ────────────────────────────────────
 *
 * A Spark is 10⁻⁶ EMBER: a DISPLAY DENOMINATION, the unit small EMBER amounts are legible in, and
 * not an asset code at all. It resembles SHARD only in being a short word starting with S. Anybody
 * reading this file with a delete key in hand should stop here — removing Sparks as though it were
 * a retired asset would break the only readable form of a small balance. The list below is read
 * from `RETIRED_ASSETS` precisely so that "which words are retired asset codes" is never a
 * judgement call made in a hurry, and the last test asserts Sparks survives the scan.
 *
 * ── The list is checked against `contracts`, and hard-coded so the check always runs ──────────
 *
 * `contracts` is a sibling checkout that may not be present (`test/indexer.test.ts` documents the
 * same arrangement), and a guard that silently skips is not a guard. So the baseline is written
 * out here and the sibling, when it exists, must AGREE with it — retiring a second asset makes
 * this file red and arms the same scan for the new code in one edit.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const at = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url))
const read = (p: string): string => readFileSync(at(p), 'utf8')

/** The retired asset codes, as of `contracts/packages/chain/src/index.ts:58`. */
const RETIRED = ['SHARD'] as const

/** Where a micro-contracts checkout is, in the order CI and a developer's machine put it. */
const CONTRACTS = ['../contracts/packages/chain/src/index.ts', '../../contracts/packages/chain/src/index.ts']
  .map(at)
  .find((p) => existsSync(p))

/**
 * A file with its comments removed — the same helper `test/render.test.ts` uses and for the same
 * reason. A rule that can only be satisfied by deleting the sentence explaining it is a rule
 * somebody deletes. This file, and the note in `src/pages/chains.tsx` recording what was removed
 * and why, both quote SHARD in order to explain it.
 */
const rendered = (source: string): string =>
  source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

/** Every file this bundle can put in front of a reader. */
function surfaces(): { path: string; text: string }[] {
  const files = ['index.html', 'src/styles.css']
  for (const dir of ['src', 'src/pages', 'src/components', 'src/lib']) {
    for (const name of readdirSync(at(dir), { withFileTypes: true })) {
      if (name.isFile() && /\.(tsx|ts|css|html)$/.test(name.name)) files.push(`${dir}/${name.name}`)
    }
  }
  return [...new Set(files)].map((path) => ({ path, text: rendered(read(path)) }))
}

describe('the retired-asset list is the one contracts declares', () => {
  it('contracts still retires exactly these codes', { skip: CONTRACTS ? false : 'no micro-contracts checkout' }, () => {
    const source = readFileSync(CONTRACTS as string, 'utf8')
    const declared = /export const RETIRED_ASSETS: readonly AssetCode\[\] = Object\.freeze\(\[([^\]]*)\]\)/.exec(
      source,
    )
    assert.ok(declared, 'RETIRED_ASSETS is gone from contracts/packages/chain/src/index.ts')
    const upstream = (declared[1] ?? '')
      .split(',')
      .map((s) => s.trim().replace(/'/g, ''))
      .filter(Boolean)
    assert.deepEqual(
      upstream,
      [...RETIRED],
      'contracts retired a different set of assets; add it to RETIRED here so the scan below covers it',
    )
  })
})

describe('no retired asset code reaches a user-facing surface', () => {
  it('found the surfaces it means to scan', () => {
    const paths = surfaces().map((f) => f.path)
    for (const required of ['index.html', 'src/pages/chains.tsx', 'src/pages/search.tsx']) {
      assert.ok(paths.includes(required), `${required} was not scanned`)
    }
  })

  for (const code of RETIRED) {
    it(`${code} appears nowhere that can be rendered`, () => {
      // Word-bounded and case-insensitive: the chain slug was lowercase (`shard`), the asset code
      // is uppercase, and the plural is how it was written in prose. All three are the same claim.
      const pattern = new RegExp(`\\b${code}s?\\b`, 'i')
      for (const file of surfaces()) {
        assert.doesNotMatch(
          file.text,
          pattern,
          `${file.path} names the retired asset ${code}. It was migrated to EMBER and no longer ` +
            'exists as a balance; a surface that names it tells a user an asset exists that does not.',
        )
      }
    })
  }

  it('SPARKS IS NOT AN ASSET CODE and this scan must never remove it', () => {
    // The guard on the guard. If somebody widens `RETIRED` by hand, or reaches for a looser
    // pattern, this is what says no: Sparks is a display denomination of EMBER and deleting it
    // breaks the only legible form of a small balance.
    for (const code of RETIRED) {
      const pattern = new RegExp(`\\b${code}s?\\b`, 'i')
      assert.doesNotMatch('Sparks', pattern, `the retired-asset scan matches "Sparks"`)
      assert.doesNotMatch('1 EMBER = 1,000,000 Sparks', pattern)
    }
  })
})
