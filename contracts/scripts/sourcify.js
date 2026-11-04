#!/usr/bin/env node
// Verifies a deployed FestivalTicket on Sourcify through API v2 (Sourcify removed API v1, which
// hardhat-verify 2.x still calls). Needs no key. Uses the Hardhat build info of the current source,
// so run `npx hardhat compile` on the deployed commit first.
//   node scripts/sourcify.js [network]      (default: the default network in scripts/networks.js)
const fs = require('node:fs');
const path = require('node:path');
const { NETWORKS, DEFAULT_NETWORK } = require('./networks');

const API = 'https://sourcify.dev/server';
const CONTRACT = 'contracts/FestivalTicket.sol:FestivalTicket';
const HEADERS = { 'content-type': 'application/json', 'user-agent': 'safepass-contracts/1 (sourcify.js)' };

function buildInfoFor(identifier) {
  const [file, name] = identifier.split(':');
  const dir = path.join(__dirname, '..', 'artifacts', 'build-info');
  const dbg = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'artifacts', file, `${name}.dbg.json`), 'utf8'),
  );
  return JSON.parse(fs.readFileSync(path.join(dir, path.basename(dbg.buildInfo)), 'utf8'));
}

async function main() {
  const network = process.argv[2] ?? DEFAULT_NETWORK;
  const net = NETWORKS[network];
  if (!net) throw new Error(`unknown network ${network}`);
  const dep = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'deployments', `${network}.json`), 'utf8'));
  const info = buildInfoFor(CONTRACT);
  const { language, sources, settings } = info.input;
  const res = await fetch(`${API}/v2/verify/${net.chainId}/${dep.address}`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      stdJsonInput: { language, sources, settings },
      compilerVersion: info.solcLongVersion,
      contractIdentifier: CONTRACT,
      ...(dep.deployTx ? { creationTransactionHash: dep.deployTx } : {}),
    }),
  });
  const body = await res.json();
  if (res.status === 409) return report(net, dep, 'already verified');
  if (!res.ok) throw new Error(`verify request failed (${res.status}): ${body.message ?? JSON.stringify(body)}`);
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const job = await (await fetch(`${API}/v2/verify/${body.verificationId}`, { headers: HEADERS })).json();
    if (!job.isJobCompleted) continue;
    if (job.error) throw new Error(`verification failed: ${job.error.message ?? JSON.stringify(job.error)}`);
    return report(net, dep, job.contract?.match ?? 'unknown');
  }
  throw new Error(`verification still pending; check ${API}/v2/verify/${body.verificationId}`);
}

function report(net, dep, result) {
  console.log(
    JSON.stringify(
      {
        result,
        sourcify: `https://repo.sourcify.dev/${net.chainId}/${dep.address}`,
        explorer: `${net.explorer}/address/${dep.address}#code`,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
