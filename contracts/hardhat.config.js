require('@nomicfoundation/hardhat-ethers');
require('@nomicfoundation/hardhat-chai-matchers');
require('@nomicfoundation/hardhat-verify');

const { NETWORKS } = require('./scripts/networks');

// Testnet networks exist only when MINTER_PRIVATE_KEY is in the environment. Keys are never committed.
// Each RPC defaults to a public endpoint and can be overridden by its env var (e.g. BASE_SEPOLIA_RPC_URL).
// ETHERSCAN_API_KEY is optional: without it the source is verified on Sourcify only (no key needed).
const { MINTER_PRIVATE_KEY, ETHERSCAN_API_KEY } = process.env;

const testnets = MINTER_PRIVATE_KEY
  ? Object.fromEntries(
      Object.entries(NETWORKS).map(([name, n]) => [
        name,
        { url: process.env[n.rpcEnv] || n.rpc, chainId: n.chainId, accounts: [MINTER_PRIVATE_KEY] },
      ]),
    )
  : {};

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: { version: '0.8.28', settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun' } },
  networks: { localhost: { url: 'http://127.0.0.1:8545' }, ...testnets },
  sourcify: { enabled: true },
  etherscan: ETHERSCAN_API_KEY ? { apiKey: ETHERSCAN_API_KEY } : { enabled: false },
};
