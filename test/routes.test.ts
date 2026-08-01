/**
 * The three descriptions of this app's addresses, checked against each other.
 *
 *   1. `src/lib/routes.ts` — the declaration, from which the navigation is derived.
 *   2. `src/app.tsx`       — which component renders at each path.
 *   3. `nginx.conf`        — which addresses are served the app shell at all.
 *
 * The third is what makes this test worth having. nginx enumerates the real routes and 404s
 * everything else on purpose, so that a wrong address answers 404 rather than 200 — an app that
 * answers 200 for every address serves its "page not found" screen as a success, which crawlers
 * index and monitors call healthy.
 *
 * The price of that honesty is that a route added to the router and not to nginx works perfectly
 * under `pnpm dev` and 404s on the first hard refresh in production. That failure survives review
 * because nothing about the diff looks wrong. This test is the mechanism instead.
 *
 * It reads `app.tsx` as TEXT rather than importing it: importing would pull in React, the router
 * and every page, and this suite deliberately has no DOM.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { DEEP_LINK_PATH, NAV, NON_INDEX_PATHS, ROUTES, guessKind, linkTo } from '../src/lib/routes.ts'

const read = (file: string): string => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

const appSource = read('src/app.tsx')
const nginx = read('nginx.conf')
const ci = read('.github/workflows/ci.yml')

/**
 * nginx.conf with its comments removed.
 *
 * The file's own header quotes the directive it forbids, in order to explain why the routes are
 * enumerated by hand — so a grep over the raw text matches the warning and fails a correct file.
 * The rule is about DIRECTIVES; strip the prose before checking it.
 */
const directives = nginx
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('#'))
  .join('\n')

/** A TypeScript or TSX source with its comments removed, for the same reason. */
const rendered = (source: string): string =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

/** The alternation inside nginx's enumerated `location ~ ^/(…)` block. */
function nginxPaths(): string[] {
  const match = /location\s+~\s+\^\/\(([^)]+)\)/.exec(directives)
  assert.ok(match, 'nginx.conf has no enumerated route block')
  return (match[1] ?? '').split('|').map((p) => p.trim())
}

describe('the route declaration', () => {
  it('is not empty, so this whole file cannot pass for the wrong reason', () => {
    assert.ok(ROUTES.length >= 6, `expected the route table, found ${ROUTES.length} entries`)
  })

  it('has exactly one index route, and it is the search', () => {
    // The search calls nothing, which is what makes it the one screen on this surface that behaves
    // identically for an operator and for a stranger. Anything that fetched would greet every
    // visitor with a refusal panel before they had asked a question.
    const index = ROUTES.filter((r) => r.path === '')
    assert.equal(index.length, 1)
    assert.equal(index[0]?.label, 'Search')
    assert.equal(index[0]?.public, true)
  })

  it('declares no duplicate path', () => {
    const paths = ROUTES.map((r) => r.path)
    assert.equal(new Set(paths).size, paths.length)
  })

  it('declares no path with a slash: these are TOP-LEVEL segments', () => {
    // nginx matches on the first segment and everything under it. A declaration of `blocks/detail`
    // would produce a location block that does not mean what it says.
    for (const route of ROUTES) {
      assert.ok(!route.path.includes('/'), `${route.path} is not a top-level segment`)
    }
  })

  it('marks every non-index route as a wildcard, because each owns a scoped address', () => {
    // `/blocks/ember/testnet/1` and `/chains/ember/testnet` both live under a top-level segment.
    for (const route of ROUTES) {
      if (route.path === '') continue
      assert.equal(route.wildcard, true, `${route.path} is not a wildcard`)
    }
  })

  it('offers only the two routes that mean something without an identifier', () => {
    // `label: null` is "reachable and deliberately not offered". `/blocks` with no height would be
    // a navigation entry that always lands on the 404 page, so the four record routes are hidden.
    const hidden = ROUTES.filter((r) => r.label === null).map((r) => r.path)
    assert.deepEqual(hidden, ['blocks', 'tx', 'address', 'tokens'])
  })
})

describe('every route is public, and NOTHING is gated', () => {
  /**
   * THE ASSERTION THIS FILE EXISTS FOR, ALONGSIDE THE nginx ONE.
   *
   * `micro-indexer` authorises a service principal holding `indexer:read` or an admin user, and
   * nothing else (`indexer/src/server.ts:679-697`). A customer who signs in is refused by exactly
   * the request that refused them signed out, so a gate would send them through an SSO round trip
   * to arrive at a 403 — the same class of mistake as a client sending a bearer to a route that
   * never wanted one, which this estate has already shipped.
   */
  it('marks every route public', () => {
    const gated = ROUTES.filter((r) => !r.public).map((r) => r.path)
    assert.deepEqual(gated, [])
  })

  it('has no ProtectedRoute anywhere in the source', () => {
    // COMMENTS STRIPPED FIRST — the fourth place in this repository that has to, and for the same
    // reason each time. app.tsx and auth.tsx both NAME the thing they refuse in order to explain
    // why they refuse it, so a grep over the raw text matches the explanation and fails a correct
    // file. A rule that can only be satisfied by deleting the sentence explaining it is a rule
    // somebody deletes. (nginx.conf, src/styles.css and src/lib/format.ts are the other three.)
    assert.doesNotMatch(rendered(appSource), /ProtectedRoute/, 'app.tsx has grown a gate')
    assert.doesNotMatch(rendered(read('src/lib/auth.tsx')), /ProtectedRoute/, 'auth.tsx exports a gate')
  })

  it('and the reason is written down where somebody will read it', () => {
    // A rule with no reason beside it is a rule the next writer deletes. Both files carry it.
    assert.match(appSource, /indexer\/src\/server\.ts:679-697/)
    assert.match(read('src/lib/auth.tsx'), /indexer\/src\/server\.ts:679-697/)
  })
})

describe('the navigation', () => {
  it('is derived from the declaration rather than restated', () => {
    const labelled = ROUTES.filter((r) => r.label !== null)
    assert.equal(NAV.length, labelled.length)
    assert.deepEqual(
      NAV.map((n) => n.to),
      labelled.map((r) => `/${r.path}`),
    )
  })

  it('points the first entry at the index, with the leading slash a NavLink needs', () => {
    assert.equal(NAV[0]?.to, '/')
  })

  it('offers the chains', () => {
    assert.ok(NAV.some((n) => n.to === '/chains'))
  })
})

describe('the router', () => {
  it('renders a route element for every non-index path', () => {
    for (const path of NON_INDEX_PATHS) {
      assert.match(
        appSource,
        new RegExp(`path="${path}(?:/|")`),
        `app.tsx has no route for /${path}`,
      )
    }
  })

  it('scopes every record route by chain AND network, as two separate segments', () => {
    // The same discipline the API paths follow. A combined `:scope` segment would make
    // `/tx/ember-testnet/0x…` and `/tx/ember/testnet` indistinguishable by shape, which is the
    // failure `market/src/indexerclient.test.ts:328-341` measures on the service side.
    for (const path of ['blocks', 'tx', 'address', 'tokens', 'chains']) {
      assert.match(
        appSource,
        new RegExp(`path="${path}/:chain/:network`),
        `/${path} is not scoped by two segments`,
      )
    }
  })

  it('renders the four record routes with the parameter each needs', () => {
    assert.match(appSource, /path="blocks\/:chain\/:network\/:height"/)
    assert.match(appSource, /path="tx\/:chain\/:network\/:hash"/)
    assert.match(appSource, /path="address\/:chain\/:network\/:address"/)
    assert.match(appSource, /path="tokens\/:chain\/:network\/:address"/)
  })

  it('has an index route', () => {
    assert.match(appSource, /<Route\s+index/)
  })

  it('has a catch-all, so an unknown address renders inside the shell', () => {
    assert.match(appSource, /path="\*"/)
  })
})

describe('nginx serves exactly the routes that exist', () => {
  it('enumerates every non-index path', () => {
    const served = nginxPaths()
    for (const path of NON_INDEX_PATHS) {
      assert.ok(served.includes(path), `nginx.conf does not serve /${path}`)
    }
  })

  it('enumerates nothing that is not a route', () => {
    for (const path of nginxPaths()) {
      assert.ok(
        NON_INDEX_PATHS.includes(path),
        `nginx.conf serves /${path}, which is not in the route table`,
      )
    }
  })

  it('serves the index', () => {
    assert.match(directives, /location = \/\s*\{/)
  })

  it('does NOT use the SPA 200-fallback', () => {
    // `try_files $uri /index.html` serves the bundle with a 200 for every address in existence.
    assert.doesNotMatch(directives, /try_files\s+\$uri\s+(\$uri\/\s+)?\/index\.html/)
  })

  it('keeps the honest 404 through error_page', () => {
    assert.match(directives, /error_page 404 \/index\.html/)
  })

  it('404s a missing asset rather than serving the shell for it', () => {
    // A JavaScript request answered with HTML fails with a syntax error naming the wrong file.
    assert.match(directives, /location \/assets\/\s*\{\s*try_files \$uri =404/)
  })

  it('sets the three security headers at the server level', () => {
    for (const header of ['X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy']) {
      assert.match(directives, new RegExp(`add_header ${header}`), header)
    }
  })

  it('allows same-origin framing, because this surface has legitimate embeds', () => {
    // The operator console uses DENY and has to: it has no embeds and a session that can authorise
    // a ledger reversal. This one is a public reference surface. Asserted in both directions so
    // the difference stays a decision.
    assert.match(directives, /X-Frame-Options "SAMEORIGIN"/)
    assert.doesNotMatch(directives, /X-Frame-Options "DENY"/)
  })

  it('does NOT tell robots to stay away: a block explorer is a public reference', () => {
    assert.doesNotMatch(directives, /X-Robots-Tag/)
  })

  it('proxies nothing, so no credential can be smuggled into the image', () => {
    // The tempting fix for the authority gap is a `proxy_pass` with an Authorization header. An
    // image is built once and promoted; a credential inside one is a published credential. See the
    // header of nginx.conf and of src/lib/indexer.ts.
    assert.doesNotMatch(directives, /proxy_pass/)
    assert.doesNotMatch(directives, /proxy_set_header\s+Authorization/i)
  })

  it('restates the security headers in EVERY location that sets Cache-Control', () => {
    // nginx's add_header is all-or-nothing per level: a location that declares ANY add_header
    // inherits NONE from its parent. The template's `location /assets/` stripped nosniff from
    // every hashed script in every frontend cut from it.
    const blocks = directives.split(/location\s/).slice(1)
    for (const block of blocks) {
      if (!block.includes('Cache-Control')) continue
      assert.match(block, /X-Content-Type-Options/, `a Cache-Control location without nosniff: ${block.slice(0, 40)}`)
      assert.match(block, /X-Frame-Options/, `a Cache-Control location without frame-options: ${block.slice(0, 40)}`)
      assert.match(block, /Referrer-Policy/, `a Cache-Control location without referrer-policy: ${block.slice(0, 40)}`)
    }
  })

  it('never caches the shell', () => {
    const root = /location = \/\s*\{([^}]*)\}/.exec(directives)?.[1] ?? ''
    assert.match(root, /Cache-Control "no-store"/)
  })

  it('caches hashed assets immutably', () => {
    const assets = /location \/assets\/\s*\{([^}]*)\}/.exec(directives)?.[1] ?? ''
    assert.match(assets, /immutable/)
  })
})

describe('the CI deep-link probe names a real route', () => {
  it('is a path this app owns', () => {
    const segment = DEEP_LINK_PATH.split('/')[1] ?? ''
    assert.ok(
      NON_INDEX_PATHS.includes(segment),
      `${DEEP_LINK_PATH} starts at /${segment}, which is not a route`,
    )
  })

  it('is deep enough to exercise the wildcard rather than the top-level location', () => {
    assert.ok(DEEP_LINK_PATH.split('/').length >= 4, `${DEEP_LINK_PATH} is not a deep link`)
  })

  it('names a scope this estate really runs, so it is a plausible address', () => {
    const [, , chain, network] = DEEP_LINK_PATH.split('/')
    assert.equal(chain, 'ember')
    assert.equal(network, 'testnet')
  })

  it('is the path CI actually probes', () => {
    // A probe against a path the app does not own proves only that the 404 page renders, which is
    // the opposite of what the check is for.
    assert.ok(ci.includes(DEEP_LINK_PATH), `ci.yml does not probe ${DEEP_LINK_PATH}`)
  })

  it('CI also probes an address the app does NOT own, and requires a 404', () => {
    assert.match(ci, /nope\/not\/a\/route/)
    assert.match(ci, /"404"/)
  })
})

describe('the addresses this app builds', () => {
  it('encodes every segment and writes the scope out as two', () => {
    assert.equal(linkTo.block('ember', 'testnet', 42), '/blocks/ember/testnet/42')
    assert.equal(
      linkTo.transaction('ember', 'testnet', '0xAbC'),
      '/tx/ember/testnet/0xAbC',
      'the hash case is preserved: the service lower-cases EVM values itself',
    )
    // A slash inside a value must not become a path segment. The height comes from a route
    // parameter and an address from a paste, so neither is trusted.
    assert.equal(linkTo.address('ember', 'testnet', 'a/b'), '/address/ember/testnet/a%2Fb')
  })
})

describe('what a pasted string is taken to be', () => {
  it('reads a run of digits as a height, up to the fifteen the service accepts', () => {
    assert.equal(guessKind('0').kind, 'height')
    assert.equal(guessKind('999999999999999').kind, 'height')
    // Sixteen digits is a 400 `bad_height` upstream (`indexer/src/server.ts:518`), so it is not
    // classified as one here either — being sent to a page that can only fail is not a service.
    assert.equal(guessKind('9999999999999999').kind, 'unknown')
  })

  it('separates a 64-hex hash from a 40-hex address, which is the paste people get wrong', () => {
    assert.equal(guessKind(`0x${'a'.repeat(64)}`).kind, 'hash')
    assert.equal(guessKind(`0x${'a'.repeat(40)}`).kind, 'address')
    // A truncated hash is neither, and saying so is the whole value of showing the guess.
    assert.equal(guessKind(`0x${'a'.repeat(63)}`).kind, 'unknown')
  })

  it('PRESERVES case, because the service lower-cases EVM values itself', () => {
    // `indexer/src/server.ts:601-608` normalises so that the EIP-55 checksum form every wallet and
    // explorer displays does not silently return an empty page. Doing it here as well would put a
    // second copy of that rule in a browser, and the non-EVM families are case-significant.
    const checksummed = '0xAbCdEf0123456789AbCdEf0123456789AbCdEf01'
    assert.equal(guessKind(checksummed).value, checksummed)
  })

  it('trims, because a paste carries whitespace', () => {
    assert.equal(guessKind('  1234  ').value, '1234')
  })
})
