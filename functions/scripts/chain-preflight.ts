// Go-live check before setting CHAIN_CONTRACT_ADDRESS and redeploying functions. Read-only.
//   MINTER_KEY_FILE      {"address","privateKey"} JSON outside the repo
//   MNEMONIC_FILE        {"phrase"} JSON outside the repo
//   CHAIN_RPC_URL        optional, defaults to the public Base Sepolia endpoint
//   CHAIN_CONTRACT_ADDRESS  optional, defaults to contracts/deployments/baseSepolia.json
//   CHAIN_ID             optional, defaults to 84532 (Base Sepolia)
// Usage: npx tsx scripts/chain-preflight.ts   (exit 1 when any check fails)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { preflightChain } from '../src/chain/preflight';

const need = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
};
const json = (p: string) => JSON.parse(readFileSync(p, 'utf8'));

async function main() {
  const contractAddress =
    process.env.CHAIN_CONTRACT_ADDRESS ?? json(join(__dirname, '..', '..', 'contracts', 'deployments', 'baseSepolia.json')).address;
  const report = await preflightChain({
    rpcUrl: process.env.CHAIN_RPC_URL ?? 'https://base-sepolia-rpc.publicnode.com',
    contractAddress,
    minterPrivateKey: json(need('MINTER_KEY_FILE')).privateKey,
    mnemonic: json(need('MNEMONIC_FILE')).phrase,
    expectedChainId: Number(process.env.CHAIN_ID ?? 84532),
  });
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
