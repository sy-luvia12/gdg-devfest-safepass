#!/usr/bin/env node
// Look up a ticket and its event on-chain without trusting the SafePass server. Needs no key.
//   node scripts/lookup.js --ticket <Firestore ticket id> [--event <Firestore event id>]
//                          [--network amoy|localhost] [--rpc <url>] [--contract <address>]
// The contract address defaults to deployments/<network>.json; anyone can rerun this against any RPC.
const fs = require('node:fs');
const path = require('node:path');
const { Contract, JsonRpcProvider, keccak256, toUtf8Bytes } = require('ethers');

const NETWORKS = {
  amoy: { rpc: 'https://polygon-amoy-bor-rpc.publicnode.com', explorer: 'https://amoy.polygonscan.com' },
  localhost: { rpc: 'http://127.0.0.1:8545', explorer: null },
};
const ABI = [
  'function ticketStatus(uint256 tokenId) view returns (uint8 status, address owner, bytes32 eventKey)',
  'function eventInfo(bytes32 eventKey) view returns (uint32 capacity, uint32 active, bool exists)',
  'function supportsInterface(bytes4 interfaceId) view returns (bool)',
];
const STATUS = ['never issued', 'active', 'used at the gate', 'released'];

const tokenIdOf = (ticketId) => BigInt(keccak256(toUtf8Bytes(ticketId)));
const eventKeyOf = (eventId) => keccak256(toUtf8Bytes(eventId));

/** Reads the public state of one ticket (and optionally one event) from the contract. */
async function lookup(runner, contractAddress, { ticketId, eventId }) {
  const c = new Contract(contractAddress, ABI, runner);
  const out = { contract: contractAddress, soulbound: await c.supportsInterface('0xb45a3c0e') };
  if (ticketId) {
    const tokenId = tokenIdOf(ticketId);
    const [status, owner, eventKey] = await c.ticketStatus(tokenId);
    out.ticket = {
      ticketId,
      tokenId: tokenId.toString(),
      status: STATUS[Number(status)],
      owner: Number(status) === 1 || Number(status) === 2 ? owner : null,
      eventKey: Number(status) === 0 ? null : eventKey,
      eventMatches: eventId && Number(status) !== 0 ? eventKey === eventKeyOf(eventId) : undefined,
    };
  }
  if (eventId) {
    const [capacity, active, exists] = await c.eventInfo(eventKeyOf(eventId));
    out.event = { eventId, eventKey: eventKeyOf(eventId), exists, capacity: Number(capacity), active: Number(active) };
  }
  return out;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i];
    if (!k.startsWith('--') || argv[i + 1] === undefined) throw new Error(`bad argument: ${k}`);
    args[k.slice(2)] = argv[i + 1];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.ticket && !args.event) throw new Error('give --ticket and/or --event');
  const network = args.network ?? 'amoy';
  const net = NETWORKS[network];
  if (!net && !args.rpc) throw new Error(`unknown network ${network}; pass --rpc`);
  const contract =
    args.contract ??
    JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'deployments', `${network}.json`), 'utf8')).address;
  const provider = new JsonRpcProvider(args.rpc ?? net.rpc);
  const out = await lookup(provider, contract, { ticketId: args.ticket, eventId: args.event });
  if (net?.explorer) {
    out.links = { contract: `${net.explorer}/address/${contract}#readContract` };
    if (out.ticket) out.links.token = `${net.explorer}/nft/${contract}/${out.ticket.tokenId}`;
  }
  console.log(JSON.stringify(out, null, 2));
  provider.destroy();
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e.shortMessage ?? e.message);
    process.exit(1);
  });
}

module.exports = { lookup, tokenIdOf, eventKeyOf };
