// Public testnets the contract can be deployed to. Public data only: no keys, no API-keyed URLs.
// Base Sepolia is the default. Both chains make a block about every 2 s, so SEED_DELAY and the
// 256-block seed window mean the same wall-clock time on either.
const NETWORKS = {
  baseSepolia: {
    chainId: 84532,
    rpc: 'https://base-sepolia-rpc.publicnode.com',
    rpcEnv: 'BASE_SEPOLIA_RPC_URL',
    explorer: 'https://sepolia.basescan.org',
    symbol: 'ETH',
  },
  amoy: {
    chainId: 80002,
    rpc: 'https://polygon-amoy-bor-rpc.publicnode.com',
    rpcEnv: 'AMOY_RPC_URL',
    explorer: 'https://amoy.polygonscan.com',
    symbol: 'POL',
  },
};

const DEFAULT_NETWORK = 'baseSepolia';

module.exports = { NETWORKS, DEFAULT_NETWORK };
