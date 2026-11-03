import { initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { Contract, id as hashOf, JsonRpcProvider, Wallet } from 'ethers';
import { beforeAll, describe, expect, it } from 'vitest';
import { FESTIVAL_TICKET_ABI } from '../src/chain/abi';
import { ChainError, createChainClient, type ChainClient } from '../src/chain/client';
import { REASON, tokenIdOf } from '../src/chain/ids';
import { processChainOp, walletAddressFor, WaitingForPrevious } from '../src/chain/process';
import { preflightChain } from '../src/chain/preflight';
import { deriveAddress } from '../src/chain/wallets';

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
