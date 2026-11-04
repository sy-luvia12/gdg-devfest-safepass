// Read-only check before spending testnet gas: minter balance, live gas price, and how many
// tickets the balance covers. Base also charges an L1 data fee; on Base Sepolia it measured about
// 1e-14 ETH for the whole deploy (2026-11-04), so it is left out.
// Sends no transaction. Exits 1 when the balance cannot pay for the deploy.
const hre = require('hardhat');

const { GAS, budget } = require('./budget');
const { NETWORKS } = require('./networks');

const fmt = (wei) => hre.ethers.formatEther(wei);

async function main() {
  const [signer] = await hre.ethers.getSigners();
  const provider = hre.ethers.provider;
  const { chainId } = await provider.getNetwork();
  const balance = await provider.getBalance(signer.address);
  const fee = await provider.getFeeData();
  // ethers sends EIP-1559 txs; maxFeePerGas is the ceiling a tx can be charged per gas.
  const price = fee.maxFeePerGas ?? fee.gasPrice;
  const deployed = hre.network.name !== 'hardhat' && (await existingDeployment(provider));
  const b = budget({ balance, price, deployed: Boolean(deployed) });
  const out = {
    network: hre.network.name,
    chainId: Number(chainId),
    minter: signer.address,
    unit: NETWORKS[hre.network.name]?.symbol ?? 'ETH',
    balance: fmt(balance),
    maxFeeGwei: hre.ethers.formatUnits(price, 'gwei'),
    deployCost: fmt(GAS.deploy * price),
    setupCost: fmt(b.setupCost),
    ticketIssueAndEntryCost: fmt(b.perTicket),
    alreadyDeployed: Boolean(deployed),
    ticketsCovered: b.ticketsCovered,
  };
  console.log(JSON.stringify(out, null, 2));
  if (!b.canSetup) {
    console.error('balance does not cover the deploy and event setup at the current max fee');
    process.exit(1);
  }
}

async function existingDeployment(provider) {
  const fs = require('node:fs');
  const p = require('node:path').join(__dirname, '..', 'deployments', `${hre.network.name}.json`);
  if (!fs.existsSync(p)) return null;
  const { address } = JSON.parse(fs.readFileSync(p, 'utf8'));
  return (await provider.getCode(address)) !== '0x' ? address : null;
}

main().catch((e) => {
  console.error(e.shortMessage ?? e.message);
  process.exit(1);
});
