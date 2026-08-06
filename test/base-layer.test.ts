/**
 * THE TOKENS ARE CONSUMED, NOT MERELY DELIVERED.
 *
 * This surface shipped with every token check green and still rendered as an unstyled document in
 * a real browser. `--cf-bg` resolved on `:root`, `<html data-cf-product/data-cf-substrate>` was
 * correct, `document.styleSheets.length` was 1 — and the measured `body` was
 * `background: rgba(0,0,0,0)`, `font-family: Times`, `margin: 8px`. The stylesheet declared no
 * `body` rule, so the page fell through to the user-agent stylesheet.
 *
 * Nothing that already exists here could have caught that. `tokens.test.ts` proves the names this
 * file READS are real; it says nothing about whether anything reads them on the document root.
 * `render.test.ts` and the journeys run against a mocked DOM that neither loads the stylesheet nor
 * cascades it, so they pass on a page with no styles at all. `curl` gets a 200. The only signal
 * was a person opening the estate and seeing white.
 *
 * So this file asserts the base layer itself: a TOP-LEVEL `body` rule that takes its background,
 * its foreground and its type from `--cf-*` tokens. Deleting that block turns these red.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const at = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url))

/**
 * The stylesheet with its comments stripped — the same treatment `tokens.test.ts` gives it, and
 * for the same reason. The header above the base layer DESCRIBES the broken state it exists to
 * prevent, so a scan over the raw text would find the words it is looking for inside the
 * explanation and pass on a file with no rules in it at all.
 */
const CSS = readFileSync(at('src/styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/**
 * The declarations of the top-level `body` rule, or `undefined` if there is not one.
 *
 * Depth-aware on purpose. A `body { ... }` nested inside an `@media` block styles the page only at
 * some widths, which is the same defect wearing a narrower hat, so it does not count. The
 * lookbehind keeps `.ex-table tbody tr` and a hypothetical `.body` from matching: those are the
 * selectors that end in the four letters being searched for.
 */
function topLevelBody(): string | undefined {
  let depth = 0
  for (let i = 0; i < CSS.length; i += 1) {
    const ch = CSS[i]
    if (ch === '}') depth -= 1
    else if (ch === '{') depth += 1
    else if (depth === 0 && ch === 'b') {
      const rest = CSS.slice(i)
      const before = i === 0 ? '' : (CSS[i - 1] ?? '')
      if (/[\w.#-]/.test(before)) continue
      const m = /^body\s*\{([^{}]*)\}/.exec(rest)
      if (m) return m[1]
    }
  }
  return undefined
}

describe('the stylesheet declares a base layer', () => {
  it('has a top-level body rule at all', () => {
    assert.notEqual(
      topLevelBody(),
      undefined,
      'src/styles.css declares no top-level `body` rule. Without one the page keeps the user-agent ' +
        'defaults — transparent background, Times, 8px margin — no matter how correct the tokens are.',
    )
  })

  const body = topLevelBody() ?? ''

  it('paints the page background from a token', () => {
    assert.match(
      body,
      /(^|[;{\s])background(-color)?\s*:\s*var\(--cf-[a-z0-9-]+\)/,
      'the `body` rule sets no background from a --cf-* token; the page will be transparent.',
    )
  })

  it('sets the foreground from a token', () => {
    assert.match(
      body,
      /(^|[;{\s])color\s*:\s*var\(--cf-[a-z0-9-]+\)/,
      'the `body` rule sets no color from a --cf-* token; text will be the UA default black.',
    )
  })

  it('sets the type from a token', () => {
    assert.match(
      body,
      /(^|[;{\s])font-family\s*:\s*var\(--cf-[a-z0-9-]+\)/,
      'the `body` rule sets no font-family from a --cf-* token; the page will render in Times.',
    )
  })

  it('clears the user-agent margin', () => {
    assert.match(
      body,
      /(^|[;{\s])margin\s*:\s*0/,
      'the `body` rule does not zero the margin; the UA leaves 8px around the whole page.',
    )
  })

  it('declares NO color-scheme, because that is the token layer’s decision now', () => {
    /*
     * ══════════════════════════════════════════════════════════════════════════════════════════
     * THIS ASSERTION USED TO BE ITS OWN OPPOSITE, AND THE REVERSAL IS THE POINT.
     *
     * It required `color-scheme: dark` on `body`, and that was right while @cloudsforge/ui was
     * dark-only: without it the browser drew light form controls and light scrollbars on a dark
     * page, which on this surface means the chain `<select>` and the paste box on the front page.
     *
     * 1.1 has a light scheme, `index.html` carries `data-cf-scheme="auto"`, and tokens.css sets
     * `color-scheme: light` on `[data-cf-scheme='auto']` inside a `prefers-color-scheme: light`
     * query. `color-scheme` is an INHERITED property, so a declaration on `body` beats the
     * inherited one from `<html>` for the body and every descendant — the whole page. Keeping this
     * line would have served a reader on a light system the light palette with every native
     * control still drawn dark, which is the original defect with the schemes swapped.
     *
     * So the rule is not "declare dark" and it is not "declare light". It is that a surface does
     * not declare this at all: the scheme is decided once, on `<html>`, for the whole estate, and
     * a surface that restates it is a surface that can disagree with it.
     * ══════════════════════════════════════════════════════════════════════════════════════════
     */
    assert.doesNotMatch(
      body,
      /(^|[;{\s])color-scheme\s*:/,
      'the `body` rule declares color-scheme, overriding the scheme tokens.css resolves on <html>.',
    )
    // The whole stylesheet, not only the body rule: any selector matching an ancestor of the page
    // content wins the same way, so a `:root` or `html` rule here would be the same defect.
    assert.doesNotMatch(
      CSS,
      /(^|[;{\s])color-scheme\s*:/,
      'src/styles.css declares color-scheme somewhere; the token layer owns it.',
    )
  })

  it('borders are inside the box, estate-wide', () => {
    assert.match(
      CSS,
      /(^|})\s*\*\s*\{[^{}]*box-sizing\s*:\s*border-box/,
      'src/styles.css has no `* { box-sizing: border-box }`; every padded, bordered element in ' +
        'this file is sized against a different model than the rest of the estate.',
    )
  })
})
