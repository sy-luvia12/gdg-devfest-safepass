require('@nomicfoundation/hardhat-ethers');
require('@nomicfoundation/hardhat-chai-matchers');
require('@nomicfoundation/hardhat-verify');

// Amoy values come from the environment only. Keys are never committed.
// ETHERSCAN_API_KEY is optional: without it the source is verified on Sourcify only (no key needed).
const { AMOY_RPC_URL, MINTER_PRIVATE_KEY, ETHERSCAN_API_KEY } = process.env;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: { version: '0.8.28', settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun' } },
  networks: {
    localhost: { url: 'http://127.0.0.1:8545' },
    ...(AMOY_RPC_URL && MINTER_PRIVATE_KEY
      ? { amoy: { url: AMOY_RPC_URL, chainId: 80002, accounts: [MINTER_PRIVATE_KEY] } }
      : {}),
  },
  sourcify: { enabled: true },
  etherscan: ETHERSCAN_API_KEY ? { apiKey: ETHERSCAN_API_KEY } : { enabled: false },
};
