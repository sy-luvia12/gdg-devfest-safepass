import { describe, expect, it } from 'vitest';
import { eventKeyOf, tokenIdOf } from './ids';
import { createChainReader, type ChainClientLike } from './reader';

const EV = eventKeyOf('ev');
const OTHER = eventKeyOf('other');
const T = (id: string) => BigInt(tokenIdOf(id));
const log = (blockNumber: bigint, eventName: string, args: Record<string, unknown>, logIndex = 0) => ({
  eventName,
  args,
  blockNumber,
  logIndex,
  transactionHash: `0x${blockNumber.toString(16).padStart(64, '0')}` as const,
});
const A = '0x00000000000000000000000000000000000000aa';
const B = '0x00000000000000000000000000000000000000bb';

const LOGS = [
  log(110n, 'Issued', { tokenId: T('t1'), eventKey: EV, to: A }),
  log(120n, 'Issued', { tokenId: T('t2'), eventKey: EV, to: A }),
  log(130n, 'Issued', { tokenId: T('t3'), eventKey: OTHER, to: B }),
  log(140n, 'Reassigned', { tokenId: T('t1'), from: A, to: B, reason: 2 }),
  log(150n, 'Used', { tokenId: T('t1') }),
  log(160n, 'Released', { tokenId: T('t2'), reason: 4 }),
  log(170n, 'Reassigned', { tokenId: T('t3'), from: B, to: A, reason: 1 }),
  log(180n, 'DrawCommitted', { eventKey: EV, round: 1, commitment: `0x${'c'.repeat(64)}`, seedBlock: 185n }),
  log(190n, 'DrawSeeded', { eventKey: EV, round: 1, seed: `0x${'5'.repeat(64)}` }),
];

function fakeClient(head: bigint) {
  const calls: Array<[bigint, bigint]> = [];
  const client: ChainClientLike = {
    getBlockNumber: async () => head,
    getLogs: async ({ fromBlock, toBlock }) => {
      calls.push([fromBlock, toBlock]);
      return LOGS.filter((l) => l.blockNumber >= fromBlock && l.blockNumber <= toBlock);
    },
    readContract: async ({ functionName, args }) => {
      if (functionName === 'eventInfo') return args[0] === EV ? [10, 1, true] : [0, 0, false];
      if (functionName === 'draws')
        return args[1] === 1 ? [`0x${'c'.repeat(64)}`, 185n, `0x${'5'.repeat(64)}`] : [`0x${'0'.repeat(64)}`, 0n, `0x${'0'.repeat(64)}`];
      throw new Error(functionName);
    },
    getBlock: async ({ blockNumber }) => ({ timestamp: blockNumber * 2n }),
  };
  return { client, calls, setHead: (h: bigint) => (head = h) };
}

const reader = (c: ChainClientLike) =>
  createChainReader({ client: c, contract: '0x577aDF622034aBE56a4dE0792EDBFCe1d1c6A5fE', fromBlock: 100n, explorer: 'https://x', chunk: 40n });

describe('chain reader', () => {
  it('counts one event from its own Issued tokens, by reason', async () => {
    const { client } = fakeClient(200n);
    const s = await reader(client).eventStatus('ev');
    expect(s).toMatchObject({
      exists: true,
      capacity: 10,
      active: 1,
      withinCapacity: true,
      issued: 2,
      used: 1,
      reassigned: { queue: 0, lottery: 1 }, // t3's queue reassignment belongs to the other event
      released: { noWaiter: 0, adminRevoke: 1 },
      drawRounds: 1,
      asOfBlock: '200',
    });
  });

  it('reads the logs in chunks once, then only new blocks', async () => {
    const f = fakeClient(200n);
    const r = reader(f.client);
    await Promise.all([r.eventStatus('ev'), r.eventStatus('other')]);
    expect(f.calls).toEqual([
      [100n, 139n],
      [140n, 179n],
      [180n, 200n],
    ]);
    f.setHead(230n);
    await r.eventStatus('ev');
    expect(f.calls.at(-1)).toEqual([201n, 230n]);
  });

  it('lists one ticket in chain order with times and links', async () => {
    const steps = await reader(fakeClient(200n).client).ticketHistory('t1');
    expect(steps.map((s) => [s.kind, s.reason])).toEqual([
      ['issued', undefined],
      ['reassigned', 2],
      ['used', undefined],
    ]);
    expect(steps[1]).toMatchObject({ from: A, to: B, at: 280_000, txUrl: `https://x/tx/${LOGS[3].transactionHash}` });
  });

  it('returns a committed round with its transactions, and null before a commit', async () => {
    const r = reader(fakeClient(200n).client);
    expect(await r.draw('ev', 1)).toEqual({
      commitment: `0x${'c'.repeat(64)}`,
      seedBlock: '185',
      seed: `0x${'5'.repeat(64)}`,
      commitTx: LOGS[7].transactionHash,
      seedTx: LOGS[8].transactionHash,
    });
    expect(await r.draw('ev', 2)).toBeNull();
  });
});
