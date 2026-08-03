/**
 * Where this bundle talks to, and how it decides.
 *
 * The rule the whole file exists to keep: NOTHING here is a build-time constant. Every host is
 * derived from `window.location` on the call, so one image serves localhost, a preview deployment
 * and production — and the tests install four different windows to prove it rather than trusting
 * a comment.
 *
 * The second thing under test WAS the dev-port disagreement, asserted as a fact rather than fixed
 * with a literal: the registry said 8080 — this bundle's own container port — while `micro-indexer`
 * binds **4008** (`indexer/src/env.ts:364`, `indexer/.env.example:9`, `indexer/Dockerfile:91`).
 * micro-ui corrected the registry to 4008 (`ui/packages/ui/src/surfaces.ts:523`) and these pins
 * flipped to the agreeing direction; both halves stay pinned, so a NEW disagreement fails and
 * names the side that moved. See the header of src/lib/hosts.ts.
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, it } from 'node:test'
import { SURFACES, cloudsforgeHosts, type CloudsForgeHosts } from '@cloudsforge/ui'
import {
  ACCENT_SURFACE,
  APP_NAME,
  PRODUCT,
  apiBase,
  isLocal,
  isRegisteredPlacement,
  resolveApiBase,
} from '../src/lib/hosts.ts'
import { installWindow, removeWindow } from './browser-stubs.ts'

afterEach(removeWindow)

/**
 * A file in this repository, as text.
 *
 * vite.config.ts and app.tsx are READ rather than imported: the first pulls in a Vite plugin and
 * the second the whole React tree, and this suite deliberately has no DOM.
 */
const read = (file: string): string => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const at = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url))

/** The production host table, as `cloudsforgeHosts()` derives it from an apex hostname. */
function production(): CloudsForgeHosts {
  installWindow('https://explorer.cloudsforge.online/')
  const hosts = cloudsforgeHosts()
  removeWindow()
  return hosts
}

describe('the surface this app is', () => {
  it('is the explorer surface', () => {
    assert.equal(PRODUCT, 'explorer')
  })

  it('is registered as a service, out of the switcher, with its own subdomain and NO MARK', () => {
    const surface = SURFACES.find((s) => s.key === PRODUCT)
    assert.ok(surface, 'explorer is not in the surface registry')
    assert.equal(surface.kind, 'service')
    assert.equal(surface.subdomain, 'explorer')
    assert.equal(surface.name, 'Network Explorer')
    // Out of the switcher on purpose: an explorer is reached from Forge Network, not chosen from a
    // product list.
    assert.equal(surface.inSwitcher, false)
    // The decision this repository is built around. `brand/plan.ts:50-62` gives the reason, and
    // test/brand-chrome.test.ts asserts the asset set really matches it.
    assert.equal(surface.markId, null, 'explorer has grown a mark; brand/plan.ts:50-62 says it has none')
  })

  it('names the accent block index.html actually sets, which is NOT its own key', () => {
    // tokens.css has no `[data-cf-product='explorer']` block. Pinned here as well as in
    // brand-chrome.test.ts, because this constant and index.html have to agree.
    assert.equal(ACCENT_SURFACE, 'network')
    assert.match(read('index.html'), /data-cf-product="network"/)
  })

  it('reports a name to the observability ingest that names the bundle, not the surface', () => {
    // Lantern groups on it, and "explorer" is the surface while "explorer-web" is the artefact that
    // threw. An error report that cannot name the bundle cannot be pinned to a deploy.
    assert.equal(APP_NAME, 'explorer-web')
  })
})

describe('the API base is an origin comparison, never a flag', () => {
  const hosts = production()

  it('is relative when the page and the API share an origin', () => {
    // Production: nginx serves this bundle and micro-indexer serves /v1 behind explorer.<apex>.
    assert.equal(resolveApiBase('https://explorer.cloudsforge.online', hosts, PRODUCT), '')
  })

  it('is absolute when they do not', () => {
    assert.equal(resolveApiBase('https://hub.cloudsforge.online', hosts, PRODUCT), hosts[PRODUCT])
  })

  it('is absolute when there is no page origin at all', () => {
    assert.equal(resolveApiBase('', hosts, PRODUCT), hosts[PRODUCT])
  })

  it('resolves from the window on every call, so one image serves every environment', () => {
    installWindow('https://explorer.cloudsforge.online/chains/ember/testnet')
    assert.equal(apiBase(), '')
    removeWindow()

    installWindow('http://localhost:5189/chains/ember/testnet')
    // Under `pnpm dev` the page is on Vite's port and the service is on the registry's, so the
    // request goes cross-origin and absolute.
    assert.notEqual(apiBase(), '')
    assert.match(apiBase(), /^http:\/\/localhost:\d+$/)
  })
})

describe('the dev port disagreement, recorded rather than papered over', () => {
  /**
   * A hard-coded host would be a second, unversioned copy of the registry, and the copy is the one
   * that goes stale — so this app resolves what the registry says and the README tells a developer
   * to start the indexer on it. BOTH halves are pinned so the day either moves, this fails and
   * names the other.
   */
  it('the registry now gives explorer the port the indexer binds', () => {
    // This said 8080 and was pinned as a DISAGREEMENT: 8080 is this bundle's own nginx container
    // port, so the registry told a frontend to ask itself for chain data. It has been corrected in
    // micro-ui to 4008, which is what indexer/src/env.ts:364 binds, and the pin flipped with it.
    assert.equal(SURFACES.find((s) => s.key === 'explorer')?.devPort, 4008)
  })

  it('and micro-indexer binds 4008, which is a different number', (t) => {
    // Read from the service, not from the registry and not from a sibling's comment. The comment
    // here already said "Skipped without the checkout" — and it was not skipped, it PASSED, which
    // is the estate's signature defect written down beside itself. `t.skip` now, so a run that
    // could not read the service says so. CI has the checkout and makes the absence fatal.
    const env = at('../indexer/src/env.ts')
    if (!existsSync(env)) return void t.skip('micro-indexer is not checked out; CI has it')
    assert.match(readFileSync(env, 'utf8'), /port\(source, 'PORT', 4008\)/)
    const example = at('../indexer/.env.example')
    if (existsSync(example)) assert.match(readFileSync(example, 'utf8'), /^PORT=4008$/m)
  })

  it('there is no `indexer` key in the registry at all, which is the root of it', () => {
    // `CloudsForgeHosts` is `Record<SurfaceKey, string>`, so a service with no entry cannot be
    // resolved. `explorer` is the key this bundle uses, and in production it is the right one
    // because the two share a hostname.
    assert.equal(
      SURFACES.find((s) => s.key === ('indexer' as never)),
      undefined,
    )
  })

  it('and this app therefore calls the indexer, not itself', () => {
    installWindow('http://localhost:5189/')
    assert.equal(apiBase(), 'http://localhost:4008')
  })

  it('the vite dev port is neither of them, and must not be confused with either', () => {
    // The registry's devPort names where the surface answers; Vite's names where the bundle is
    // served from in development. admin-web had to draw this distinction after its own entry was
    // read as the latter, and mint-web and trade-web after it.
    const vite = /server:\s*\{\s*port:\s*(\d+)/.exec(read('vite.config.ts'))
    assert.ok(vite, 'vite.config.ts declares no dev server port')
    assert.notEqual(Number(vite[1]), 4008)
  })

  /**
   * EVERY NUMBER IN THE README'S TABLE, PINNED — including the two that are FIXED.
   *
   * `micro-trade-web/src/lib/hosts.ts:16-17` names `admin` as "registry 3002" and `emberkin` as
   * "registry 3014" in the present tense. Both were corrected in micro-ui after that was written,
   * so copying the sentence forward would have carried a fixed defect into a new repository as a
   * live one — which is precisely the class of failure the estate keeps finding in its own
   * documents, arriving by the route it always arrives by: a claim inherited rather than re-read.
   *
   * So the fixed entries are pinned in the AGREEING direction. If `admin` or `emberkin` ever drifts
   * apart again this fails; if `create`, `trade` or `explorer` is ever reconciled, the assertion
   * below it fails and the README's "three live, not seven" has to be rewritten. Either way the
   * count in the prose cannot quietly stop being true.
   */
  const bound = (dir: string, fallback: number): number | null => {
    const file = at(`../${dir}`)
    if (!existsSync(file)) return null
    const m = /port: (?:integer|port)\(source, 'PORT', (\d+)/.exec(readFileSync(file, 'utf8'))
    return m ? Number(m[1]) : fallback
  }
  const devPort = (key: string): number | undefined =>
    SURFACES.find((s) => s.key === (key as never))?.devPort

  it('the two the registry has already corrected still agree', () => {
    assert.equal(devPort('admin'), 4014)
    const adminApi = bound('admin-api/src/env.ts', 0)
    if (adminApi !== null) assert.equal(adminApi, 4014, 'admin-api no longer binds what the registry says')

    assert.equal(devPort('emberkin'), 4100)
    const emberkin = bound('emberkin/src/env.ts', 0)
    if (emberkin !== null) assert.equal(emberkin, 4100, 'emberkin no longer binds what the registry says')
  })

  it('and the three that do not agree still do not, so "three live" is a measured number', () => {
    assert.equal(devPort('create'), 4004)
    const mint = bound('mint/src/env.ts', 0)
    if (mint !== null) assert.equal(mint, 4000, 'mint moved; the README table needs rewriting')

    assert.equal(devPort('trade'), 4006)
    const trade = bound('trade/src/env.ts', 0)
    if (trade !== null) assert.equal(trade, 4000, 'trade moved; the README table needs rewriting')

    assert.equal(devPort('explorer'), 4008)
    const indexer = bound('indexer/src/env.ts', 0)
    if (indexer !== null) assert.equal(indexer, 4008, 'the registry and the indexer disagree again')
  })

  it('the README no longer tells anybody to reconcile a disagreement that is gone', () => {
    // It used to say PORT=8080, which was the workaround for the registry naming this bundle's own
    // port. Leaving that instruction after the fix would send a developer to start the indexer on
    // the wrong port for no reason.
    assert.doesNotMatch(read('README.md'), /PORT=8080/, 'the stale workaround is still documented')
  })
})

describe('local development is exempt, in exactly the four names cloudsforgeHosts() exempts', () => {
  it('treats the four as local', () => {
    for (const hostname of ['', 'localhost', '127.0.0.1', 'dev.local']) {
      assert.equal(isLocal(hostname), true, hostname)
    }
  })

  it('treats a real hostname as not local', () => {
    for (const hostname of ['explorer.cloudsforge.online', 'example.test', 'localhost.evil.test']) {
      assert.equal(isLocal(hostname), false, hostname)
    }
  })
})

describe('the placement warning', () => {
  const hosts = production()

  it('accepts this surface’s own origin', () => {
    assert.equal(
      isRegisteredPlacement(
        'https://explorer.cloudsforge.online',
        'explorer.cloudsforge.online',
        hosts,
      ),
      true,
    )
  })

  it('accepts localhost, where there is no apex to get wrong', () => {
    assert.equal(isRegisteredPlacement('http://localhost:5189', 'localhost', hosts), true)
  })

  it('flags an address the registry does not know', () => {
    // An unknown prefix is left alone, so the whole name becomes the apex and every derived host —
    // the chain index, the account portal — resolves one level too deep.
    assert.equal(
      isRegisteredPlacement('https://preview-7.example.test', 'preview-7.example.test', hosts),
      false,
    )
  })

  it('flags another surface’s origin', () => {
    assert.equal(
      isRegisteredPlacement('https://hub.cloudsforge.online', 'hub.cloudsforge.online', hosts),
      false,
    )
  })

  it('warns rather than refusing, because a public reference surface should still render', () => {
    // The opposite of admin-web, which refuses to render at all. Asserted so the difference stays a
    // decision: a reference page that blanks itself on a preview deployment is worse than one that
    // says where it is.
    const app = read('src/app.tsx')
    assert.doesNotMatch(app, /MisplacedBundle/, 'this surface must not refuse to render')
    assert.match(app, /unregistered/, 'the placement must still be passed to the shell')
  })
})
