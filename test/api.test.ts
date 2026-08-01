/**
 * The auth client, without a browser.
 *
 * Three behaviours are load-bearing and each has cost somebody a session at least once:
 *
 *   1. TEN CONCURRENT 401s CAUSE ONE REFRESH. Refresh tokens rotate; ten parallel refreshes means
 *      nine of them present a token that has just been superseded, and a user holding a perfectly
 *      valid session is signed out.
 *   2. THE CALLBACK CODE LEAVES THE ADDRESS BAR BEFORE IT GOES OVER THE WIRE. Not after: a code
 *      that is still on screen during a network round trip is in the history, in the referrer of
 *      whatever loads next, and in any screenshot taken meanwhile.
 *   3. A FAILED REFRESH CLEARS THE TOKENS AND SAYS SO, once, so the tree can drop the session
 *      instead of every screen discovering it independently.
 */
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  AUTH_EXPIRED_EVENT,
  ApiError,
  __resetAuth,
  api,
  bootstrapSession,
  clearTokens,
  getAccessToken,
  getRefreshToken,
  hasSession,
  noticeFor,
  readErrorBody,
  refreshSession,
  setTokens,
} from '../src/lib/api.ts'
import * as indexerClient from '../src/lib/indexer.ts'
import {
  getAddressActivity,
  getBlock,
  getChainStatus,
  getConfirmations,
  getToken,
  getTokenBalances,
  getTransaction,
} from '../src/lib/indexer.ts'
import { __resetObs } from '../src/lib/obs.ts'
import {
  installFetch,
  installStorage,
  installWindow,
  json,
  removeStorage,
  removeWindow,
  type Browser,
  type FetchStub,
} from './browser-stubs.ts'

let browser: Browser
let stub: FetchStub | null = null

beforeEach(() => {
  browser = installWindow('http://localhost:5183/')
  installStorage()
  __resetAuth()
})

afterEach(() => {
  stub?.restore()
  stub = null
  // The reporter batches on a timer. Left running, it would outlive the test that queued it and
  // then post to a Lantern that is not there.
  __resetObs()
  removeStorage()
  removeWindow()
})

/* ---------------------------- token storage ------------------------- */

describe('token storage', () => {
  it('round-trips the shared CloudsForge keys', () => {
    setTokens({ accessToken: 'a1', refreshToken: 'r1' })
    assert.equal(getAccessToken(), 'a1')
    assert.equal(getRefreshToken(), 'r1')
    assert.equal(hasSession(), true)
  })

  it('clears both tokens, not just the access token', () => {
    // Clearing only the access token leaves a refresh token that silently signs the user back in
    // on the next request, which is not what "sign out" means on a shared machine.
    setTokens({ accessToken: 'a1', refreshToken: 'r1' })
    clearTokens()
    assert.equal(getAccessToken(), null)
    assert.equal(getRefreshToken(), null)
    assert.equal(hasSession(), false)
  })

  it('has no session when only one of the two tokens is present', () => {
    setTokens({ accessToken: 'a1', refreshToken: 'r1' })
    clearTokens()
    setTokens({ accessToken: 'a1', refreshToken: '' })
    assert.equal(hasSession(), false)
  })

  it('falls back to memory when localStorage is unavailable', () => {
    // Safari's private mode and a storage-blocked iframe THROW on access. A module that took that
    // literally would take the whole bundle down at import time in both.
    removeStorage()
    setTokens({ accessToken: 'a-mem', refreshToken: 'r-mem' })
    assert.equal(getAccessToken(), 'a-mem')
    clearTokens()
    assert.equal(getAccessToken(), null)
  })
})

/* -------------------------- single-flight refresh ------------------- */

describe('single-flight refresh', () => {
  it('performs ONE refresh for ten concurrent 401s, and retries all ten', async () => {
    setTokens({ accessToken: 'stale', refreshToken: 'r1' })
    let refreshes = 0
    let dataCalls = 0

    stub = installFetch((call) => {
      if (call.url.includes('/auth/refresh')) {
        refreshes += 1
        return json(200, { accessToken: 'fresh', refreshToken: 'r2' })
      }
      dataCalls += 1
      const token = call.headers['authorization']
      return token === 'Bearer fresh'
        ? json(200, { ok: true })
        : json(401, { error: 'token expired' })
    })

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => api<{ ok: boolean }>(`/v1/thing/${i}`)),
    )

    assert.equal(refreshes, 1, 'ten 401s must share one refresh')
    assert.equal(dataCalls, 20, 'each of the ten is sent once, then retried once')
    assert.equal(results.every((r) => r.ok), true)
    assert.equal(getAccessToken(), 'fresh')
  })

  it('starts a NEW refresh once the previous one has settled', async () => {
    // The slot is cleared when the promise settles, not held for the life of the page: an access
    // token that expires again an hour later must be refreshable again.
    setTokens({ accessToken: 'a1', refreshToken: 'r1' })
    let refreshes = 0
    stub = installFetch(() => {
      refreshes += 1
      return json(200, { accessToken: `a${refreshes + 1}`, refreshToken: `r${refreshes + 1}` })
    })

    assert.equal(await refreshSession(), true)
    assert.equal(await refreshSession(), true)
    assert.equal(refreshes, 2)
  })

  it('reports false without calling Nimbus when there is no refresh token', async () => {
    let called = 0
    stub = installFetch(() => {
      called += 1
      return json(200, {})
    })
    assert.equal(await refreshSession(), false)
    assert.equal(called, 0)
  })

  it('clears the session and announces it once when the refresh token has expired', async () => {
    setTokens({ accessToken: 'stale', refreshToken: 'r-expired' })
    stub = installFetch((call) =>
      call.url.includes('/auth/refresh')
        ? json(401, { error: 'refresh token expired' })
        : json(401, { error: 'token expired' }, 'req-abc'),
    )

    await assert.rejects(
      () => api('/v1/thing'),
      (err: unknown) => err instanceof ApiError && err.status === 401 && err.code === 'session_expired',
    )
    assert.equal(hasSession(), false)
    assert.deepEqual(browser.dispatched, [AUTH_EXPIRED_EVENT])
  })
})

/* ------------------------------ failures ---------------------------- */

describe('failures', () => {
  it('carries the request id from the header onto the error', async () => {
    setTokens({ accessToken: 'a1', refreshToken: 'r1' })
    stub = installFetch(() => json(500, { error: 'the ledger is unavailable' }, 'req-7f3a'))

    const err = await api('/v1/thing').catch((e: unknown) => e)
    if (!(err instanceof ApiError)) throw new Error(`expected an ApiError, got ${String(err)}`)
    assert.equal(err.status, 500)
    assert.equal(err.message, 'the ledger is unavailable')
    assert.equal(err.requestId, 'req-7f3a')

    // …and the notice a failure state renders carries it through to the screen, because that id
    // is the only thing a user can quote that finds their request across every service at once.
    const notice = noticeFor(err, 'Could not load.')
    assert.equal(notice.requestId, 'req-7f3a')
    assert.equal(notice.status, 500)
  })

  /* ════════════════════════════════════════════════════════════════════════════════════════════
   * THERE WAS A `refused` FLAG ON `ErrorNotice`, AND IT HAS BEEN DELETED.
   *
   * It was set on 401 OR 403 and drove a screen that explained why `micro-indexer` would not serve
   * an anonymous read. The reads are anonymous now (`indexer/src/server.ts:708-717`) and this app
   * presents no credential, so nothing it sends can be refused for lacking one: an auth status
   * arriving anyway is a fault in the service or in something in front of it, and `failed` — a
   * message and a request id — is the honest screen for that.
   *
   * The tests below are the two that survive, and they are the ones that would catch this app
   * quietly re-acquiring a dependency on a session.
   * ════════════════════════════════════════════════════════════════════════════════════════════ */

  it('a 403 is a plain failure now, carrying its code and status and no special state', async () => {
    setTokens({ accessToken: 'a1', refreshToken: 'r1' })
    stub = installFetch(() =>
      json(403, { error: { code: 'forbidden', message: 'missing required authority: indexer:write' } }, 'req-403'),
    )
    const err = await api('/v1/thing').catch((e: unknown) => e)
    const notice = noticeFor(err, 'Could not load.')
    assert.equal(notice.code, 'forbidden')
    assert.equal(notice.status, 403)
    assert.equal(notice.requestId, 'req-403')
    assert.ok(!('refused' in notice), 'the refusal flag is back; the screen it drove is deleted')
  })

  it('does NOT fire cf:auth-expired when there was no session to expire', async () => {
    // The template ended a session on ANY 401 to an authenticated call. This surface reported that
    // and the template has since fixed it (`web-template/src/lib/api.ts:344`). The guard matters
    // less here than it did — the chain reads pass `auth: false` and never reach the branch — but a
    // client that is only correct because of where it happens to be called is one refactor from
    // signing a user out of a session they never had.
    clearTokens()
    const browser = installWindow('https://explorer.cloudsforge.online/')
    stub = installFetch(() => json(401, { error: { code: 'unauthenticated', message: 'no' } }, 'r'))
    await api('/v1/thing').catch(() => undefined)
    assert.deepEqual(browser.dispatched, [], 'an anonymous 401 dispatched a session event')
    removeWindow()
  })

  it('…and still DOES fire it when a session really has gone stale', async () => {
    // The other direction, so the guard cannot go vacuous. With a refresh token present the client
    // tries a refresh; when that is refused, the session ends exactly as the template intends.
    setTokens({ accessToken: 'a1', refreshToken: 'r1' })
    const browser = installWindow('https://explorer.cloudsforge.online/')
    stub = installFetch((call) =>
      call.url.includes('/auth/refresh')
        ? json(401, { error: 'expired' }, 'r-ref')
        : json(401, { error: { code: 'unauthenticated', message: 'no' } }, 'r'),
    )
    await api('/v1/thing').catch(() => undefined)
    assert.deepEqual(browser.dispatched, ['cf:auth-expired'])
    removeWindow()
  })

  it('carries the CODE through, because a 404 means two different things on this API', () => {
    // `micro-indexer` distinguishes "no such transaction" from "no such route" by code alone; the
    // status is 404 either way (`indexer/src/server.ts:433-435`). The template's ErrorNotice drops
    // the code, and dropping it is how micro-market and micro-mint each rendered a router 404 as a
    // fact about a chain.
    const err = new ApiError(404, 'no', 'transaction_not_found', 'req-1')
    const notice = noticeFor(err, 'Could not load.')
    assert.equal(notice.code, 'transaction_not_found')
    assert.equal(notice.status, 404)
  })

  it('turns an unreachable server into a status 0 ApiError rather than a raw TypeError', async () => {
    stub = installFetch(() => {
      throw new TypeError('Failed to fetch')
    })
    const err = await api('/v1/thing', { auth: false }).catch((e: unknown) => e)
    if (!(err instanceof ApiError)) throw new Error(`expected an ApiError, got ${String(err)}`)
    assert.equal(err.status, 0)
  })
})

/* --------------------------- the auth callback ---------------------- */

describe('auth callback', () => {
  it('strips the code from the address bar BEFORE the exchange is sent', async () => {
    browser = installWindow('https://explorer.cloudsforge.online/chains/ember/testnet#cf_code=abc123&view=grid')
    stub = installFetch(
      () => json(200, { accessToken: 'a-new', refreshToken: 'r-new' }),
      browser.trace,
    )

    assert.equal(await bootstrapSession(), true)

    // The ORDER is the assertion. Reverse the two side effects in @cloudsforge/ui and this fails.
    assert.equal(browser.trace[0], 'replaceState:/chains/ember/testnet#view=grid')
    assert.ok(browser.trace[1]?.startsWith('fetch:'))
    assert.ok(browser.trace[1]?.includes('/auth/exchange'))

    // The rest of the fragment survives: an app may keep its own route there.
    assert.deepEqual(browser.replaced, ['/chains/ember/testnet#view=grid'])
    assert.equal(browser.window.location.hash, '#view=grid')
    assert.equal(getAccessToken(), 'a-new')
  })

  it('still strips the code when the exchange fails', async () => {
    // An "after the exchange resolves" implementation never strips it at all on this path, and
    // the code stays in the address bar for as long as the tab is open.
    browser = installWindow('https://explorer.cloudsforge.online/#cf_code=dead')
    stub = installFetch(() => json(400, { error: 'code expired' }), browser.trace)

    assert.equal(await bootstrapSession(), false)
    assert.deepEqual(browser.replaced, ['/'])
    assert.equal(getAccessToken(), null)
  })

  it('does nothing to a URL that carries no code', async () => {
    browser = installWindow('https://explorer.cloudsforge.online/chains#section-2')
    let calls = 0
    stub = installFetch(() => {
      calls += 1
      return json(200, {})
    })

    assert.equal(await bootstrapSession(), false)
    assert.equal(calls, 0, 'no code means no exchange request')
    assert.deepEqual(browser.replaced, [], 'and no history rewrite either')
  })

  it('reports an existing session when there is no code but tokens are stored', async () => {
    setTokens({ accessToken: 'a1', refreshToken: 'r1' })
    stub = installFetch(() => json(200, {}))
    assert.equal(await bootstrapSession(), true)
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * NO BEARER REACHES THE CHAIN INDEX. MEASURED ON THE WIRE, NOT READ OFF THE SOURCE.
 *
 * `test/indexer.test.ts` proves the seven reads all go through `publicRead` and that `publicRead`
 * is the only place `auth` is decided. That is a check on the SHAPE of the module. This is the
 * check on its behaviour: with an access token sitting in storage — the state an operator who
 * signed in for the shared bar is actually in — every one of the seven requests must still go out
 * with no `authorization` header.
 *
 * It matters because a token that IS presented is verified rather than ignored
 * (`indexer/src/server.ts:711`). An expired one would come back 401 on a page that needs no
 * session, and the explorer would have made itself depend on a credential it never needed — the
 * defect this repository was built around, arriving from the client's side.
 * ══════════════════════════════════════════════════════════════════════════════════════════════ */

describe('the chain index is read anonymously, with a session in storage', () => {
  const SCOPE = { chain: 'ember', network: 'testnet' } as const

  /** Every read this bundle can issue, called exactly as a page calls it. */
  const READS: ReadonlyArray<{ name: string; call: () => Promise<unknown> }> = [
    { name: 'getChainStatus', call: () => getChainStatus(SCOPE) },
    { name: 'getBlock', call: () => getBlock(SCOPE, '42') },
    { name: 'getTransaction', call: () => getTransaction(SCOPE, '0xabc') },
    { name: 'getConfirmations', call: () => getConfirmations(SCOPE, '0xabc') },
    { name: 'getAddressActivity', call: () => getAddressActivity(SCOPE, '0xdef', { limit: 50 }) },
    { name: 'getTokenBalances', call: () => getTokenBalances(SCOPE, '0xdef') },
    { name: 'getToken', call: () => getToken(SCOPE, '0xfeed') },
  ]

  it('covers every call this client exports, so a new one cannot slip past', () => {
    // Counted against the module rather than against this list, which would only agree with
    // itself. A read added without a line here is a read nobody checked for a bearer.
    const exported = Object.keys(indexerClient).filter((k) => k.startsWith('get'))
    assert.deepEqual(READS.map((r) => r.name).sort(), exported.sort())
  })

  for (const read of READS) {
    it(`${read.name} sends no authorization header`, async () => {
      setTokens({ accessToken: 'operator-token', refreshToken: 'r1' })
      assert.equal(hasSession(), true, 'the test is vacuous without a session in storage')
      stub = installFetch(() => json(200, {}))
      await read.call()
      const call = stub.calls[0]
      assert.ok(call, `${read.name} sent no request at all`)
      const names = Object.keys(call.headers).map((h) => h.toLowerCase())
      assert.ok(
        !names.includes('authorization'),
        `${read.name} presented a bearer to a route that needs none: ${names.join(', ')}`,
      )
    })
  }

  it('and the stub WOULD have seen one, so the assertion above is not vacuous', () => {
    // The other direction. `api()` with its default `auth` attaches the token, and if it did not
    // then every check above would pass against a client that had simply stopped working.
    setTokens({ accessToken: 'operator-token', refreshToken: 'r1' })
    stub = installFetch(() => json(200, {}))
    return api('/v1/thing').then(() => {
      const names = Object.keys(stub?.calls[0]?.headers ?? {}).map((h) => h.toLowerCase())
      assert.ok(names.includes('authorization'), 'the client no longer attaches a bearer at all')
      assert.equal(stub?.calls[0]?.headers['authorization'], 'Bearer operator-token')
    })
  })
})

describe('the error envelope', () => {
  // Regression, found while cutting micro-hub-web from this template. The estate serves a NESTED
  // envelope and this client read it as flat, so `message` was assigned an object and every
  // server-side failure rendered as `[object Object]` — discarding the message, the code and the
  // request id, which is the single field a support conversation runs on.
  it('reads the nested envelope every service actually sends', () => {
    assert.deepEqual(
      readErrorBody({ error: { code: 'rate_unavailable', message: 'No usable price.', requestId: 'req-77' } }),
      { message: 'No usable price.', code: 'rate_unavailable', requestId: 'req-77' },
    )
  })

  it('never yields a non-string message, whatever the body holds', () => {
    const { message } = readErrorBody({ error: { message: 'Refused.' } })
    assert.equal(typeof message, 'string')
    assert.notEqual(message, '[object Object]')
  })

  it('still reads the flat shape, for a proxy or a service on the rollback path', () => {
    assert.deepEqual(readErrorBody({ error: 'Refused.', code: 'forbidden', requestId: 'req-9' }), {
      message: 'Refused.',
      code: 'forbidden',
      requestId: 'req-9',
    })
  })

  it('ignores a body that carries nothing usable rather than inventing a sentence', () => {
    assert.deepEqual(readErrorBody({}), {})
    assert.deepEqual(readErrorBody(null), {})
    assert.deepEqual(readErrorBody('gateway timeout'), {})
    assert.deepEqual(readErrorBody({ error: {} }), {})
    assert.deepEqual(readErrorBody({ error: { message: '' } }), {}, 'an empty string is not a message')
  })

  it('surfaces the nested fields through ApiError, which is what the failure states render', async () => {
    stub = installFetch(() =>
      json(422, { error: { code: 'below_minimum', message: 'Amount is below the minimum.', requestId: 'req-42' } }),
    )
    await assert.rejects(
      () => api('/v1/withdrawals', { method: 'POST' }),
      (err: unknown) => {
        assert.ok(err instanceof ApiError)
        assert.equal(err.message, 'Amount is below the minimum.')
        assert.equal(err.code, 'below_minimum')
        assert.equal(err.requestId, 'req-42')
        assert.equal(noticeFor(err, 'fallback').message, 'Amount is below the minimum.')
        return true
      },
    )
  })
})
