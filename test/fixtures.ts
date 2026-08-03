/**
 * The responses the scenarios are run against.
 *
 * Every shape is one `src/lib/indexer.ts` declares, which was read out of `indexer/src/reads.ts`
 * at the lines that module cites. Typed against the client's own declarations so a drift between
 * them is a type error here rather than a scenario asserting a shape nothing produces.
 */
import type { ChainStatus, ConfirmationView, TransactionView } from '../src/lib/indexer.ts'

export const HASH = `0x${'ab'.repeat(32)}`
export const ADDRESS = '0x1111111111111111111111111111111111111111'

export function transaction(over: Partial<TransactionView> = {}): TransactionView {
  return {
    chain: 'ember',
    network: 'testnet',
    hash: HASH,
    txUrn: `urn:cf:tx:ember:testnet:${HASH}`,
    explorerUrl: null,
    blockHash: `0x${'cd'.repeat(32)}`,
    blockHeight: 900,
    txIndex: 3,
    from: ADDRESS,
    to: '0x2222222222222222222222222222222222222222',
    value: '1000000000000000000',
    fee: '21000',
    status: 'success',
    nonceOrSequence: 7,
    confirmations: 12,
    detail: {},
    firstSeenAt: '2026-08-01T09:00:00.000Z',
    logs: [],
    ...over,
  }
}

export function confirmation(over: Partial<ConfirmationView> = {}): ConfirmationView {
  return {
    chain: 'ember',
    network: 'testnet',
    hash: HASH,
    txUrn: `urn:cf:tx:ember:testnet:${HASH}`,
    explorerUrl: null,
    status: 'success',
    blockHash: `0x${'cd'.repeat(32)}`,
    blockHeight: 900,
    canonical: true,
    confirmations: 12,
    requiredConfirmations: 6,
    confirmed: true,
    indexedHeight: 912,
    tipHeight: 915,
    halted: false,
    ...over,
  }
}

export function chainStatus(over: Partial<ChainStatus> = {}): ChainStatus {
  return {
    chain: 'ember',
    network: 'testnet',
    family: 'evm',
    asset: 'CFG',
    chainId: 4242,
    requiredConfirmations: 6,
    reorgAlarmDepth: 12,
    tipHeight: 915,
    tipSeenAt: '2026-08-03T09:00:00.000Z',
    indexedHeight: 912,
    indexedHash: `0x${'ef'.repeat(32)}`,
    lagBlocks: 3,
    halted: false,
    haltReason: null,
    providers: [],
    recentReorgs: [],
    ...over,
  }
}

/** The estate's error envelope — nested, as `errorReply()` builds it in every service. */
export function error(code: string, message: string): { error: { code: string; message: string } } {
  return { error: { code, message } }
}
