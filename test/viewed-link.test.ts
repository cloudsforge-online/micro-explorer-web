/**
 * THE NETWORK SURVIVES A PRODUCT SWITCH — the carrier half, on the reading side.
 *
 * *"if you select testnet and switch product you are back to mainnet"*
 *
 * `@cloudsforge/ui` composes the outgoing link with `?net=`, because every surface is its own
 * origin and neither storage nor the hostname can carry the reader's choice across one: the
 * combined view retired the testnet frontends, so `explorer-testnet.<apex>` 302s straight back to
 * `explorer.<apex>`. This file asserts the other end — that arriving here with the parameter
 * re-points what the bundle READS, and that `network.ts`'s invariant is intact.
 *
 * ── THE INVARIANT THIS DOES NOT WEAKEN ────────────────────────────────────────────────────────
 *
 * `test/network.test.ts` guards the scar from a stored network default: the mainnet explorer
 * looking up every pasted hash on a halted testnet scope and telling readers their real
 * transactions did not exist. What that closed was a choice made once OUTLIVING the reader's
 * intent. A parameter in the address just followed is the opposite — present, visible, scoped to
 * one navigation, written back nowhere. The last two cases here assert exactly that.
 *
 * Each case installs its window first and then imports a FRESH copy of the module (the `?case=`
 * suffix defeats the module cache), because the seed is read once at load — which is the property
 * that makes it a carrier rather than a store.
 */
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { installWindow, removeWindow } from './browser-stubs.ts'

let seq = 0

/** A fresh `viewed.ts`, loaded as a browser would load it at `url`. */
async function loadAt(url: string): Promise<typeof import('../src/lib/viewed.ts')> {
  installWindow(url)
  seq += 1
  return (await import(`../src/lib/viewed.ts?case=${seq}`)) as typeof import('../src/lib/viewed.ts')
}

afterEach(() => {
  removeWindow()
})

describe('the network a link arrived carrying', () => {
  it('is what the reader is viewing, and the reads follow it', async () => {
    const m = await loadAt('https://explorer.cloudsforge.online/block/128?net=testnet')
    assert.equal(m.viewedNetwork(), 'testnet')
    assert.equal(m.viewedApiOrigin(), 'https://explorer-testnet.cloudsforge.online')
  })

  it('works in the other direction too', async () => {
    const m = await loadAt('https://explorer-testnet.cloudsforge.online/?net=mainnet')
    assert.equal(m.viewedNetwork(), 'mainnet')
    assert.equal(m.viewedApiOrigin(), 'https://explorer.cloudsforge.online')
  })

  it('is ignored when it agrees with the hostname, so reads stay relative', async () => {
    const m = await loadAt('https://explorer.cloudsforge.online/?net=mainnet')
    assert.equal(m.viewedNetwork(), 'mainnet')
    assert.equal(m.viewedApiOrigin(), '')
  })

  it('is ignored when it is absent or nonsense', async () => {
    // A malformed link must not change which chain a pasted hash is looked up on. That is the
    // original defect, arriving by a different road.
    for (const search of ['', '?q=0xabc', '?net=', '?net=maiinet', '?net=MAINNET']) {
      const m = await loadAt(`https://explorer.cloudsforge.online/${search}`)
      assert.equal(m.viewedNetwork(), 'mainnet', search)
      assert.equal(m.viewedApiOrigin(), '', search)
    }
  })

  it('does nothing off-registry, where there is no sibling estate', async () => {
    const m = await loadAt('http://localhost:3002/?net=testnet')
    assert.equal(m.viewedApiOrigin(), '')
  })

  it('is a starting point, not a lock — the switcher still wins', async () => {
    const m = await loadAt('https://explorer.cloudsforge.online/?net=testnet')
    m.setViewedNetwork('mainnet')
    assert.equal(m.viewedNetwork(), 'mainnet')
    assert.equal(m.viewedApiOrigin(), '')
  })

  it('is read, never written back — nothing about it persists', async () => {
    const browser = installWindow('https://explorer.cloudsforge.online/?net=testnet')
    seq += 1
    await import(`../src/lib/viewed.ts?case=${seq}`)
    assert.deepEqual(browser.replaced, [])
    assert.deepEqual(browser.assigned, [])
  })
})
