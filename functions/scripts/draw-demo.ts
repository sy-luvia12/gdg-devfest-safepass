// Runs one real lottery round for the S7 "verify the draw" demo, on a dedicated event key that no Firestore
// event uses (a real event id here would register it on chain with the wrong capacity before the backend does).
// Fake entrants only: their salts are written to the output, which a real round would never do.
//   MINTER_KEY_FILE         {"address","privateKey"} JSON outside the repo (never printed)
//   CHAIN_RPC_URL           optional, defaults to the public Base Sepolia endpoint
//   CHAIN_CONTRACT_ADDRESS  optional, defaults to contracts/deployments/baseSepolia.json
//   DRAW_DEMO_OUT           optional, defaults to contracts/deployments/draw-demo.baseSepolia.json
// Usage: npx tsx scripts/draw-demo.ts   (two transactions: commitDraw, seedDraw; plus createEvent the first time)
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Contract, JsonRpcProvider, Wallet, ZeroHash } from 'ethers';
import { FESTIVAL_TICKET_ABI } from '../src/chain/abi';
import { createChainClient, redact } from '../src/chain/client';
import { eventKeyOf, tokenIdOf } from '../src/chain/ids';
import { buildSnapshot, drawWinners, leafOf, merkleProof, newSalt, scoreOf } from '../src/lottery/draw';

export const DEMO_EVENT_ID = 'safepass-draw-demo';
const ENTRANTS = 10;
const TICKETS = 2;
const deployments = join(__dirname, '..', '..', 'contracts', 'deployments');
const need = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const rpcUrl = process.env.CHAIN_RPC_URL ?? 'https://base-sepolia-rpc.publicnode.com';
  const contractAddress =
    process.env.CHAIN_CONTRACT_ADDRESS ?? JSON.parse(readFileSync(join(deployments, 'baseSepolia.json'), 'utf8')).address;
  const out = process.env.DRAW_DEMO_OUT ?? join(deployments, 'draw-demo.baseSepolia.json');
  const minterPrivateKey = JSON.parse(readFileSync(need('MINTER_KEY_FILE'), 'utf8')).privateKey as string;

  const provider = new JsonRpcProvider(rpcUrl, undefined, { cacheTimeout: -1 });
  const minter = new Contract(contractAddress, FESTIVAL_TICKET_ABI, new Wallet(minterPrivateKey, provider));
  const client = createChainClient({ rpcUrl, contractAddress, minterPrivateKey });
  const network = await provider.getNetwork();

  const created = await client.ensureEvent(DEMO_EVENT_ID, 100);
  const entries = Array.from({ length: ENTRANTS }, (_, i) => ({ uid: `demo-student-${i + 1}`, salt: newSalt() }));
  const tokenIds = Array.from({ length: TICKETS }, (_, i) => tokenIdOf(`${DEMO_EVENT_ID}-ticket-${i + 1}`));

  const eventKey = eventKeyOf(DEMO_EVENT_ID);
  let round = 1;
  while ((await minter.draws(eventKey, round))[0] !== ZeroHash) round += 1;
  const snap = buildSnapshot({ eventId: DEMO_EVENT_ID, round, entries, tokenIds });

  const commitTx = await minter.commitDraw(snap.eventKey, round, snap.commitment);
  const commitReceipt = await commitTx.wait();
  const [, seedBlockRaw] = await minter.draws(snap.eventKey, round);
  const seedBlock = Number(seedBlockRaw);
  while ((await provider.getBlockNumber()) <= seedBlock) await sleep(1000);
  const seedTx = await minter.seedDraw(snap.eventKey, round);
  await seedTx.wait();
  const [, , seed] = await minter.draws(snap.eventKey, round);

  const winners = drawWinners({ seed, leaves: snap.leaves, tokenIds });
  const result = {
    note: 'Demo round with fake entrants. A real round never publishes salts before the show.',
    chainId: Number(network.chainId),
    contract: contractAddress,
    eventId: DEMO_EVENT_ID,
    eventKey: snap.eventKey,
    round,
    createEventTx: created.txHash,
    commitTx: commitReceipt.hash,
    commitBlock: commitReceipt.blockNumber,
    seedBlock,
    seedTx: seedTx.hash,
    seed,
    commitment: snap.commitment,
    root: snap.root,
    ticketsHash: snap.ticketsHash,
    tokenIds: snap.tokenIds,
    leaves: snap.leaves,
    entries: entries.map((e) => {
      const leaf = leafOf(snap.eventKey, round, e.uid, e.salt);
      return { ...e, leaf, proof: merkleProof(snap.leaves, leaf), score: scoreOf(seed, leaf).toString() };
    }),
    winners,
  };
  writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ round, commitTx: result.commitTx, seedTx: result.seedTx, winners: winners.length, out }, null, 2));
}

main().catch((e) => {
  console.error(redact(e instanceof Error ? e.message : String(e)));
  process.exit(1);
});
