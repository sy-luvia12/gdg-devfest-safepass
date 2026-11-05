import { initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { Contract, id as hashOf, JsonRpcProvider, Wallet } from 'ethers';
import { beforeAll, describe, expect, it } from 'vitest';
import { FESTIVAL_TICKET_ABI } from '../src/chain/abi';
import { ChainError, createChainClient, type ChainClient } from '../src/chain/client';
import { eventKeyOf, REASON, tokenIdOf } from '../src/chain/ids';
import { processChainOp, walletAddressFor, WaitingForPrevious } from '../src/chain/process';
import { preflightChain } from '../src/chain/preflight';
import { deriveAddress } from '../src/chain/wallets';
import { entryIdOf, scoreOf, studentRefOf } from '../src/domain/entryDraw';
import { buildSnapshot, drawWinners, merkleProof, newSalt, verifyProof } from '../src/lottery/draw';
import { drawRef, planRef, snapshotRound } from '../src/lottery/rounds';

// Hardhat's default account 0 (deployer and minter in scripts/deploy.js). Public test key, local chain only.
const MINTER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const MNEMONIC = 'test test test test test test test test test test test junk';
const RPC = 'http://127.0.0.1:8545';
const CONTRACT = process.env.CHAIN_TEST_CONTRACT ?? '';

let db: Firestore;
let client: ChainClient;
let reader: Contract;
const run = Math.random().toString(36).slice(2, 8);
const id = (s: string) => `${s}-${run}`;

// A minter with the role but no gas: the deployer grants the role to a fresh, empty wallet.
async function brokeMinter(): Promise<ChainClient> {
  const key = Wallet.createRandom().privateKey;
  const signer = new Wallet(MINTER_KEY, new JsonRpcProvider(RPC, undefined, { cacheTimeout: -1 }));
  const admin = new Contract(CONTRACT, ['function grantRole(bytes32 role, address account)'], signer);
  await (await admin.grantRole(hashOf('MINTER_ROLE'), new Wallet(key).address)).wait();
  return createChainClient({ rpcUrl: RPC, contractAddress: CONTRACT, minterPrivateKey: key });
}

beforeAll(() => {
  if (!CONTRACT) throw new Error('CHAIN_TEST_CONTRACT is not set. Run npm run test:chain.');
  db = getFirestore(initializeApp({ projectId: 'demo-ttv' }, 'chain-int'));
  client = createChainClient({ rpcUrl: RPC, contractAddress: CONTRACT, minterPrivateKey: MINTER_KEY });
  reader = new Contract(CONTRACT, FESTIVAL_TICKET_ABI, new JsonRpcProvider(RPC));
});

describe('chain client on a local chain', () => {
  it('mints once: a retried mint is skipped instead of issuing again', async () => {
    const eventId = id('ev-client');
    expect((await client.ensureEvent(eventId, 5)).txHash).toMatch(/^0x/);
    expect((await client.ensureEvent(eventId, 99)).txHash).toBeNull(); // capacity stays fixed
    const to = deriveAddress(MNEMONIC, 100);
    const first = await client.mint({ ticketId: id('t1'), eventId, to });
    expect(first.txHash).toMatch(/^0x/);
    expect(first.tokenId).toBe(tokenIdOf(id('t1')));
    const again = await client.mint({ ticketId: id('t1'), eventId, to });
    expect(again.txHash).toBeNull();
    expect(await reader.ownerOf(first.tokenId)).toBe(to);
  });

  it('reassign, markUsed and release are safe to repeat', async () => {
    const eventId = id('ev-steps');
    await client.ensureEvent(eventId, 5);
    const [a, b] = [deriveAddress(MNEMONIC, 101), deriveAddress(MNEMONIC, 102)];
    await client.mint({ ticketId: id('t2'), eventId, to: a });
    expect((await client.reassign({ ticketId: id('t2'), to: b, reason: REASON.CANCEL_QUEUE })).txHash).toMatch(/^0x/);
    expect((await client.reassign({ ticketId: id('t2'), to: b, reason: REASON.CANCEL_QUEUE })).txHash).toBeNull();
    expect((await client.markUsed(id('t2'))).txHash).toMatch(/^0x/);
    expect((await client.markUsed(id('t2'))).txHash).toBeNull();

    await client.mint({ ticketId: id('t3'), eventId, to: a });
    expect((await client.release({ ticketId: id('t3'), reason: REASON.CANCEL_RELEASED })).txHash).toMatch(/^0x/);
    expect((await client.release({ ticketId: id('t3'), reason: REASON.CANCEL_RELEASED })).txHash).toBeNull();
  });

  it('a minter without gas fails with INSUFFICIENT_FUNDS', async () => {
    const broke = await brokeMinter();
    await expect(broke.ensureEvent(id('ev-broke'), 1)).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
    await expect(broke.ensureEvent(id('ev-broke'), 1)).rejects.toBeInstanceOf(ChainError);
  });
});

describe('processChainOp with Firestore', () => {
  async function seedTicket(ticketId: string, eventId: string, ownerUid: string, ops: object[]) {
    await db.doc(`events/${eventId}`).set({ capacity: 3 });
    await db.doc(`users/${ownerUid}`).set({ email: `${ownerUid}@korea.ac.kr` });
    await db.doc(`tickets/${ticketId}`).set({ eventId, ownerUid, chainSeq: ops.length, chain: { status: 'pending' } });
    for (const [i, op] of ops.entries()) {
      await db.doc(`chainOps/${ticketId}-${i + 1}`).set({ ticketId, eventId, seq: i + 1, status: 'pending', attempts: 0, txHash: null, error: null, ...op });
    }
  }
  const deps = () => ({ db, client, mnemonic: MNEMONIC });

  it('runs a ticket\'s ops in order and records the token and tx on the ticket', async () => {
    const [t, ev, uid, uid2] = [id('pt1'), id('pev1'), id('alice'), id('bob')];
    await db.doc(`users/${uid2}`).set({ email: `${uid2}@korea.ac.kr` });
    const reassignmentId = id('r1');
    await db.doc(`reassignments/${reassignmentId}`).set({ ticketId: t });
    await seedTicket(t, ev, uid, [
      { kind: 'mint', toUid: uid },
      { kind: 'reassign', toUid: uid2, reason: REASON.CANCEL_QUEUE, reassignmentId },
      { kind: 'markUsed' },
    ]);

    await expect(processChainOp(deps(), `${t}-2`)).rejects.toBeInstanceOf(WaitingForPrevious);
    expect(await processChainOp(deps(), `${t}-1`)).toBe('done');
    let ticket = (await db.doc(`tickets/${t}`).get()).data()!;
    expect(ticket.chain.tokenId).toBe(tokenIdOf(t));
    expect(ticket.chain.mintTx).toMatch(/^0x/);
    expect(ticket.chain.status).toBe('pending'); // more ops queued

    expect(await processChainOp(deps(), `${t}-2`)).toBe('done');
    expect(await processChainOp(deps(), `${t}-3`)).toBe('done');
    expect(await processChainOp(deps(), `${t}-3`)).toBe('skipped');
    ticket = (await db.doc(`tickets/${t}`).get()).data()!;
    expect(ticket.chain.status).toBe('done');
    const bobAddress = (await db.doc(`users/${uid2}`).get()).get('walletAddress');
    expect(await reader.ownerOf(tokenIdOf(t))).toBe(bobAddress);
    expect(await reader.isUsed(tokenIdOf(t))).toBe(true);
    expect((await db.doc(`reassignments/${reassignmentId}`).get()).get('txHash')).toMatch(/^0x/);
  });

  it('gives each user one wallet index for good', async () => {
    const uid = id('carol');
    await db.doc(`users/${uid}`).set({ email: 'c@korea.ac.kr' });
    const a = await walletAddressFor(db, MNEMONIC, uid);
    const b = await walletAddressFor(db, MNEMONIC, uid);
    expect(a).toBe(b);
    const index = (await db.doc(`users/${uid}`).get()).get('walletIndex');
    expect(deriveAddress(MNEMONIC, index)).toBe(a);
  });

  it('leaves ops pending while the chain is off, and parks them as blocked when the minter has no gas', async () => {
    const [t, ev, uid] = [id('pt2'), id('pev2'), id('dave')];
    await seedTicket(t, ev, uid, [{ kind: 'mint', toUid: uid }]);
    expect(await processChainOp({ db, client: null, mnemonic: null }, `${t}-1`)).toBe('disabled');
    expect((await db.doc(`chainOps/${t}-1`).get()).get('status')).toBe('pending');

    const broke = await brokeMinter();
    expect(await processChainOp({ db, client: broke, mnemonic: MNEMONIC }, `${t}-1`)).toBe('blocked');
    expect((await db.doc(`chainOps/${t}-1`).get()).get('status')).toBe('blocked');
    expect((await db.doc(`tickets/${t}`).get()).get('chain.status')).toBe('blocked');
  });
});

describe('go-live preflight on a local chain', () => {
  const good = () => ({
    rpcUrl: RPC,
    contractAddress: CONTRACT,
    minterPrivateKey: MINTER_KEY,
    mnemonic: MNEMONIC,
    expectedChainId: 31337,
  });
  const byName = (r: Awaited<ReturnType<typeof preflightChain>>) => Object.fromEntries(r.checks.map((c) => [c.name, c]));

  it('passes every check with the deployed contract and the funded minter', async () => {
    const r = await preflightChain(good());
    expect(r.checks.filter((c) => !c.ok)).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.minter).toBe(new Wallet(MINTER_KEY).address);
    expect(r.checks.map((c) => c.name).sort()).toEqual(['contract', 'erc5192', 'minterGas', 'minterRole', 'mnemonic', 'rpc']);
  });

  it('fails on the wrong chain id', async () => {
    const r = await preflightChain({ ...good(), expectedChainId: 80002 });
    expect(r.ok).toBe(false);
    expect(byName(r).rpc.detail).toContain('expected 80002');
  });

  it('fails when the address has no contract', async () => {
    const r = await preflightChain({ ...good(), contractAddress: Wallet.createRandom().address });
    expect(r.ok).toBe(false);
    expect(byName(r).contract.ok).toBe(false);
  });

  it('fails for a key without MINTER_ROLE and with no gas', async () => {
    const r = await preflightChain({ ...good(), minterPrivateKey: Wallet.createRandom().privateKey });
    expect(byName(r).minterRole.ok).toBe(false);
    expect(byName(r).minterGas.ok).toBe(false);
    expect(r.ok).toBe(false);
  });

  it('fails for a bad mnemonic and never echoes secrets', async () => {
    const r = await preflightChain({ ...good(), mnemonic: 'not a real phrase' });
    expect(byName(r).mnemonic.ok).toBe(false);
    const text = JSON.stringify(r);
    expect(text).not.toContain(MINTER_KEY.slice(2));
    expect(text).not.toContain('not a real phrase');
    expect(text).not.toContain(RPC);
  });

  it('reports an unreachable RPC without its URL', async () => {
    const r = await preflightChain({ ...good(), rpcUrl: 'http://127.0.0.1:1/secret-key-path' });
    expect(byName(r).rpc.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain('secret-key-path');
  }, 30_000);
});

describe('lottery round on a local chain', () => {
  it('commits the snapshot, seeds it from a later block hash and draws the same winners anyone can recompute', async () => {
    const eventId = id('ev-draw');
    await client.ensureEvent(eventId, 10);
    const entries = Array.from({ length: 6 }, (_, i) => ({ uid: `waiter-${i}`, salt: newSalt() }));
    const tokenIds = [tokenIdOf(id('dt1')), tokenIdOf(id('dt2'))];
    const snap = buildSnapshot({ eventId, round: 1, entries, tokenIds });

    const provider = new JsonRpcProvider(RPC, undefined, { cacheTimeout: -1 });
    const minter = new Contract(CONTRACT, FESTIVAL_TICKET_ABI, new Wallet(MINTER_KEY, provider));
    const receipt = await (await minter.commitDraw(snap.eventKey, 1, snap.commitment)).wait();
    const committed = receipt.logs.map((l: { topics: string[]; data: string }) => minter.interface.parseLog(l)).find((l: { name?: string } | null) => l?.name === 'DrawCommitted');
    const seedBlock = Number(committed.args.seedBlock);

    await provider.send('hardhat_mine', ['0x6']);
    await (await minter.seedDraw(snap.eventKey, 1)).wait();
    const [commitment, storedSeedBlock, seed] = await reader.draws(snap.eventKey, 1);
    expect(commitment).toBe(snap.commitment);
    expect(Number(storedSeedBlock)).toBe(seedBlock);
    expect(seed).toBe((await provider.getBlock(seedBlock))!.hash);

    const winners = drawWinners({ seed, leaves: snap.leaves, tokenIds });
    expect(winners).toHaveLength(2);
    expect(drawWinners({ seed, leaves: [...snap.leaves].reverse(), tokenIds: [...tokenIds].reverse() })).toEqual(winners);
    for (const w of winners) expect(verifyProof(w.leaf, merkleProof(snap.leaves, w.leaf), snap.root)).toBe(true);
  }, 60_000);
});

describe('lottery round through processChainOp', () => {
  it('commits, waits for the seed block, seeds and announces the winners the chain seed decides', async () => {
    const eventId = id('lev');
    await db.doc(`events/${eventId}`).set({ capacity: 5, reassignMode: 'lottery', allowedDomains: ['korea.ac.kr'] });
    for (let i = 0; i < 4; i++) {
      await db.doc(`users/${id(`lw${i}`)}`).set({ email: `${id(`lw${i}`)}@korea.ac.kr`, name: `w${i}`, role: 'student' });
      await db.doc(`events/${eventId}/waitlist/${id(`lw${i}`)}@korea.ac.kr`).set({ order: i, status: 'waiting' });
    }
    for (const t of ['lt1', 'lt2']) await db.doc(`tickets/${id(t)}`).set({ eventId, status: 'pooled', ownerUid: null, drawRound: null });

    const r = await snapshotRound(db, eventId, { nowMs: Date.now(), announceAtMs: Date.now(), announceOnSeed: true, commitNow: true });
    expect(r).toMatchObject({ ok: true, round: 1, tickets: 2, entries: 4 });

    // Hardhat mines only on transactions; keep blocks coming while the processor waits for the seed block.
    const provider = new JsonRpcProvider(RPC);
    const miner = setInterval(() => void provider.send('evm_mine', []), 200);
    try {
      expect(await processChainOp({ db, client, mnemonic: MNEMONIC }, `draw-${eventId}-1`)).toBe('done');
    } finally {
      clearInterval(miner);
    }

    const draw = (await drawRef(db, eventId, 1).get()).data()!;
    expect(draw.status).toBe('announced');
    const [commitment, , seed] = await reader.draws(eventKeyOf(eventId), 1);
    expect(commitment).toBe(draw.commitment);
    expect(seed).toBe(draw.seed);
    const expected = drawWinners({ seed, leaves: draw.leaves, tokenIds: draw.tokenIds }).map((w) => w.leaf);
    expect(draw.winners.map((w: { leaf: string }) => w.leaf)).toEqual(expected);
    for (const w of draw.winners) expect((await db.doc(`tickets/${w.ticketId}`).get()).get('status')).toBe('offered');
    // A repeat finds the round seeded and changes nothing.
    await db.doc(`chainOps/draw-${eventId}-1`).update({ status: 'pending' });
    expect(await processChainOp({ db, client, mnemonic: MNEMONIC }, `draw-${eventId}-1`)).toBe('done');
  }, 120_000);

  it('voids a round whose seed window passed instead of committing it a second time', async () => {
    const eventId = id('lev2');
    await db.doc(`events/${eventId}`).set({ capacity: 5, reassignMode: 'lottery', allowedDomains: ['korea.ac.kr'] });
    await db.doc(`users/${id('vw')}`).set({ email: `${id('vw')}@korea.ac.kr`, name: 'v', role: 'student' });
    await db.doc(`events/${eventId}/waitlist/${id('vw')}@korea.ac.kr`).set({ order: 0, status: 'waiting' });
    await db.doc(`tickets/${id('vt')}`).set({ eventId, status: 'pooled', ownerUid: null, drawRound: null });
    await client.ensureEvent(eventId, 5);
    expect((await snapshotRound(db, eventId, { nowMs: Date.now(), announceAtMs: Date.now(), announceOnSeed: true, commitNow: true })).ok).toBe(true);
    const draw = (await drawRef(db, eventId, 1).get()).data()!;

    // The commit reached the chain, then the processor stayed down for longer than the 256-block window.
    const provider = new JsonRpcProvider(RPC, undefined, { cacheTimeout: -1 });
    const minter = new Contract(CONTRACT, FESTIVAL_TICKET_ABI, new Wallet(MINTER_KEY, provider));
    await (await minter.commitDraw(eventKeyOf(eventId), 1, draw.commitment)).wait();
    await provider.send('hardhat_mine', ['0x120']);

    expect(await processChainOp({ db, client, mnemonic: MNEMONIC }, `draw-${eventId}-1`)).toBe('done');
    expect((await drawRef(db, eventId, 1).get()).get('status')).toBe('void');
    expect((await planRef(db, eventId).get()).get('status')).toBe('skipped');
    expect((await db.doc(`tickets/${id('vt')}`).get()).get('drawRound')).toBeNull();
    const [commitment, , seed] = await reader.draws(eventKeyOf(eventId), 1);
    expect(commitment).toBe(draw.commitment); // no second commit
    expect(seed).toBe(`0x${'0'.repeat(64)}`);
    const commits = await reader.queryFilter(reader.filters.DrawCommitted(eventKeyOf(eventId), 1));
    expect(commits).toHaveLength(1);
  }, 120_000);
});

describe('instant entry draw through processChainOp', () => {
  it('opens the entry, settles it from a later block hash and stores the result the contract decided', async () => {
    const eventId = id('eev');
    await db.doc(`events/${eventId}`).set({ capacity: 5, instantDraw: true, drawPool: 10, allowedDomains: ['korea.ac.kr'] });
    const studentRef = studentRefOf('korea', id('s1'));
    const salt = newSalt();
    const entryId = entryIdOf(eventKeyOf(eventId), studentRef, salt);
    const docId = `${eventId}_${id('s1')}`;
    await db.doc(`entryDraws/${docId}`).set({ eventId, studentRef, salt, entryId, winBps: 5000, status: 'pending' });
    await db.doc(`chainOps/entry-${docId}`).set({ kind: 'openEntry', eventId, entryDocId: docId, seq: 1, status: 'pending' });

    const provider = new JsonRpcProvider(RPC);
    const miner = setInterval(() => void provider.send('evm_mine', []), 200);
    try {
      expect(await processChainOp({ db, client, mnemonic: MNEMONIC }, `entry-${docId}`)).toBe('done');
    } finally {
      clearInterval(miner);
    }

    const entry = (await db.doc(`entryDraws/${docId}`).get()).data()!;
    const [seedBlock, winBps, result] = await reader.entries(eventKeyOf(eventId), entryId);
    expect(Number(winBps)).toBe(5000);
    expect(entry.seedBlock).toBe(Number(seedBlock));
    // Anyone can recompute: the seed is the seed block's hash, and the score decides against the fixed rate.
    expect(entry.seed).toBe((await provider.getBlock(entry.seedBlock))!.hash);
    expect(entry.score).toBe(scoreOf(entry.seed, entryId));
    expect(entry.status).toBe(entry.score < 5000 ? 'won' : 'lost');
    expect(Number(result)).toBe(entry.status === 'won' ? 1 : 2);

    // A repeat finds the entry settled and draws nothing again.
    await db.doc(`chainOps/entry-${docId}`).update({ status: 'pending' });
    expect(await processChainOp({ db, client, mnemonic: MNEMONIC }, `entry-${docId}`)).toBe('done');
    expect((await db.doc(`entryDraws/${docId}`).get()).get('score')).toBe(entry.score);
    expect(await reader.queryFilter(reader.filters.EntrySettled(eventKeyOf(eventId), entryId))).toHaveLength(1);
  }, 120_000);
});

describe('operator action through processChainOp', () => {
  it('records the action once per op, even when the op runs again', async () => {
    const eventId = id('aev');
    await db.doc(`events/${eventId}`).set({ capacity: 5, allowedDomains: ['korea.ac.kr'] });
    const opId = `action-${id('a1')}`;
    const ref = hashOf(`action:${opId}`);
    await db.doc(`chainOps/${opId}`).set({ kind: 'recordAction', eventId, action: 1, ref, seq: 1, status: 'pending' });

    expect(await processChainOp({ db, client, mnemonic: MNEMONIC }, opId)).toBe('done');
    await db.doc(`chainOps/${opId}`).update({ status: 'pending' });
    expect(await processChainOp({ db, client, mnemonic: MNEMONIC }, opId)).toBe('done');

    expect(Number(await reader.actionCount(eventKeyOf(eventId), 1))).toBe(1);
    const logs = await reader.queryFilter(reader.filters.ActionRecorded(eventKeyOf(eventId), 1));
    expect(logs.map((l) => (l as unknown as { args: { ref: string } }).args.ref)).toEqual([ref]);
  }, 60_000);
});
