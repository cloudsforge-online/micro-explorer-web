/**
 * EVERY `--cf-*` AND EVERY `cf-` CLASS THIS APP NAMES IS DEFINED BY THE DESIGN SYSTEM.
 *
 * An undefined custom property does not fall back to something sensible. `var(--cf-nope)` makes
 * the whole declaration invalid at computed-value time, so `border: 1px solid var(--cf-nope)`
 * removes the border — silently, in a file that looks correct, in a browser that reports nothing.
 *
 * The estate has shipped exactly this. `micro-mint-web/src/styles.css` references ten properties
 * that `ui/packages/ui/src/tokens.css` does not declare — `--cf-border`, `--cf-radius-md`,
 * `--cf-space-1` … `--cf-space-5`, `--cf-status-good`, `--cf-status-warn`, `--cf-status-crit` —
 * across 72 declarations. Three of those are written `var(--cf-status-good, var(--cf-border))`,
 * where the FALLBACK is undefined too.
 *
 * ── The half this repository added: CLASS names fail the same way ─────────────────────────────
 *
 * `ui/packages/ui/src/ui.css` declares `.cf-btn` and `.cf-btn--ember`. It declares no
 * `.cf-btn--primary`, no `.cf-input` and no `.cf-select` — this surface has a search form and
 * reached for all three by reflex before the file was opened. A class the design system does not
 * declare fails exactly as quietly as a property it does not declare: the control renders with the
 * browser's own chrome on a dark substrate, and nothing anywhere reports it.
 *
 * `test/tokens.test.ts` in micro-trade-web checks the properties and not the classes, so nothing in
 * the estate would have caught it. The second half of this file is that check.
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const at = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url))

/**
 * The stylesheet with its comments stripped.
 *
 * Same lesson as nginx.conf and the `try_files` grep: the file's own header QUOTES the property
 * names it forbids, in order to explain why they are forbidden. A scan over the raw text matches
 * the warning and fails a correct file — which is a check that can only be satisfied by deleting
 * the explanation.
 */
const CSS = readFileSync(at('src/styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/** Where a micro-ui checkout is, in the order CI and a developer's machine put it. */
const UI_ROOT = [process.env['CLOUDSFORGE_UI_DIR'], at('../ui')]
  .filter((v): v is string => Boolean(v))
  .find((p) => existsSync(`${p}/packages/ui/src/tokens.css`))

/** Every `--cf-*` the stylesheet READS. */
function referenced(): string[] {
  return [...new Set([...CSS.matchAll(/var\((--cf-[a-z0-9-]+)/g)].map((m) => m[1] ?? ''))].sort()
}

/** Every `cf-`-prefixed class name this bundle puts in a `className` or a stylesheet selector. */
function classesUsed(): string[] {
  const found = new Set<string>()
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (extname(entry.name) === '.tsx' || extname(entry.name) === '.ts') {
        const text = readFileSync(full, 'utf8')
        for (const m of text.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
          for (const cls of `${m[1] ?? ''} ${m[2] ?? ''}`.split(/[\s${}]+/)) {
            if (cls.startsWith('cf-')) found.add(cls)
          }
        }
      }
    }
  }
  walk(at('src'))
  // …and any `cf-` class this stylesheet tries to restyle, which would be the same mistake with
  // the arrow pointing the other way.
  for (const m of CSS.matchAll(/\.(cf-[a-z0-9_-]+)/g)) found.add(m[1] ?? '')
  return [...found].sort()
}

describe('the stylesheet names only tokens that exist', () => {
  it('references a real number of them, so this cannot pass on an empty match', () => {
    assert.ok(referenced().length >= 20, `found ${referenced().length} token references`)
  })

  if (UI_ROOT === undefined) {
    it('SKIPPED: no micro-ui checkout — CI checks one out and requires this to run', () => {
      assert.ok(true)
    })
  } else {
    const tokens = readFileSync(`${UI_ROOT}/packages/ui/src/tokens.css`, 'utf8')
    const ui = readFileSync(`${UI_ROOT}/packages/ui/src/ui.css`, 'utf8')
    const defined = new Set(
      [...tokens.matchAll(/^\s*(--cf-[a-z0-9-]+)\s*:/gm)].map((m) => m[1] ?? ''),
    )

    it('reads a tokens file with tokens in it', () => {
      assert.ok(defined.size >= 60, `found ${defined.size} definitions in tokens.css`)
    })

    it('every property this stylesheet reads is declared by the design system', () => {
      const undefinedOnes = referenced().filter((name) => !defined.has(name))
      assert.deepEqual(
        undefinedOnes,
        [],
        `src/styles.css reads ${undefinedOnes.join(', ')}, which tokens.css does not define. ` +
          'An undefined custom property invalidates the whole declaration.',
      )
    })

    it('names none of the ten properties micro-mint-web invented', () => {
      // Spelled out so the failure message names the right file to go and read, rather than only
      // saying "undefined". These are the ones this estate has actually shipped by mistake.
      const KNOWN_BAD = [
        '--cf-border',
        '--cf-radius-md',
        '--cf-space-1',
        '--cf-space-2',
        '--cf-space-3',
        '--cf-space-4',
        '--cf-space-5',
        '--cf-status-good',
        '--cf-status-warn',
        '--cf-status-crit',
      ]
      for (const bad of KNOWN_BAD) {
        // Boundary-aware: a plain `includes('var(--cf-space-2')` also matches the REAL
        // `var(--cf-space-2xl)`, and a test that fails on a correct token is a test somebody
        // deletes.
        assert.doesNotMatch(
          CSS,
          new RegExp(`var\\(${bad}(?![a-z0-9-])`),
          `src/styles.css uses ${bad}, which does not exist. The real name is in the header of that file.`,
        )
        assert.ok(!defined.has(bad), `${bad} now exists upstream; this test is out of date`)
      }
    })

    it('the four names the brief warned about are not tokens, and the real ones are', () => {
      // Asserted in both directions so a reader can see which is which without opening tokens.css.
      for (const wrong of ['--cf-border', '--cf-critical', '--cf-warning', '--cf-font']) {
        assert.ok(!defined.has(wrong), `${wrong} is defined after all; this comment is wrong`)
      }
      for (const right of [
        '--cf-line',
        '--cf-line-strong',
        '--cf-danger',
        '--cf-warn',
        '--cf-success',
        '--cf-font-sans',
      ]) {
        assert.ok(defined.has(right), `${right} is not defined; the stylesheet is built on it`)
      }
    })

    /* ── the half this repository added ──────────────────────────────────────────────────── */

    it('every cf- CLASS this bundle names is declared by the design system', () => {
      const declared = new Set([...ui.matchAll(/\.(cf-[a-z0-9_-]+)/g)].map((m) => m[1] ?? ''))
      const used = classesUsed()
      assert.ok(used.length >= 3, `found ${used.length} cf- classes, which is too few to be right`)
      const missing = used.filter((cls) => !declared.has(cls))
      assert.deepEqual(
        missing,
        [],
        `this bundle uses ${missing.join(', ')}, which ui.css does not declare. ` +
          'A class the design system does not have fails as silently as a token it does not have.',
      )
    })

    it('the three form classes this surface reached for do NOT exist, which is why it declares its own', () => {
      // Asserted as an absence in both directions. If micro-ui grows them, this test fails and the
      // local `.ex-input` / `.ex-select` should be deleted in favour of the shared ones — which is
      // the right prompt to get, rather than carrying a private copy for ever.
      const declared = new Set([...ui.matchAll(/\.(cf-[a-z0-9_-]+)/g)].map((m) => m[1] ?? ''))
      for (const absent of ['cf-input', 'cf-select', 'cf-btn--primary']) {
        assert.ok(
          !declared.has(absent),
          `.${absent} now exists in ui.css; use it instead of this repository's local class`,
        )
      }
      assert.ok(declared.has('cf-btn'), '.cf-btn is gone; the buttons on this surface are unstyled')
      assert.ok(declared.has('cf-btn--ember'), '.cf-btn--ember is gone')
      assert.match(CSS, /\.ex-input,\s*\n\.ex-select \{/, 'the local form controls are gone')
    })
  }
})

describe('no hard-coded colour, including one hiding in a fallback', () => {
  it('declares no hex literal', () => {
    const hexes = [...CSS.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0])
    assert.deepEqual(hexes, [], `src/styles.css hard-codes ${hexes.join(', ')}`)
  })

  it('declares no rgb/rgba/hsl literal', () => {
    const fns = [...CSS.matchAll(/\b(rgba?|hsla?)\(/g)].map((m) => m[0])
    assert.deepEqual(fns, [], `src/styles.css hard-codes ${fns.join(', ')}`)
  })

  it('uses no var() fallback at all, because a fallback is where a literal hides', () => {
    // `var(--cf-something, #b28e1e)` passes every "uses tokens" check ever written and is a
    // hard-coded colour. There is no legitimate use for one here: every property this file reads
    // is asserted above to exist.
    const fallbacks = [...CSS.matchAll(/var\(--cf-[a-z0-9-]+\s*,/g)].map((m) => m[0])
    assert.deepEqual(fallbacks, [], `src/styles.css uses a var() fallback: ${fallbacks.join(', ')}`)
  })
})
