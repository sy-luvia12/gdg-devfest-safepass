// Deploys FestivalTicket and writes its address to deployments/<network>.json (public data, committed).
// The deploying key becomes both admin and minter: the server wallet is the only one that moves tickets.
const fs = require('node:fs');
const path = require('node:path');
const hre = require('hardhat');

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const ticket = await hre.ethers.deployContract('FestivalTicket', [deployer.address, deployer.address]);
  await ticket.waitForDeployment();
  const tx = ticket.deploymentTransaction();
  const out = {
    network: hre.network.name,
    chainId: Number((await hre.ethers.provider.getNetwork()).chainId),
    address: await ticket.getAddress(),
    minter: deployer.address,
    deployTx: tx?.hash ?? null,
    deployedAt: new Date().toISOString(),
  };
  const dir = path.join(__dirname, '..', 'deployments');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${hre.network.name}.json`), JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify(out));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
