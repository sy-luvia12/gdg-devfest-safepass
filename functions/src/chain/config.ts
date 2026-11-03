import { defineSecret, defineString } from 'firebase-functions/params';
import { createChainClient, type ChainClient } from './client';

// Public values are plain params, keys are Secret Manager secrets. An empty contract address
// switches the chain off: ops then wait in chainOps until retryChainOps replays them.
export const CHAIN_RPC_URL = defineString('CHAIN_RPC_URL', { default: '' });
export const CHAIN_CONTRACT_ADDRESS = defineString('CHAIN_CONTRACT_ADDRESS', { default: '' });
export const CHAIN_MINTER_KEY = defineSecret('CHAIN_MINTER_KEY');
export const CHAIN_WALLET_MNEMONIC = defineSecret('CHAIN_WALLET_MNEMONIC');
export const CHAIN_SECRETS = [CHAIN_MINTER_KEY, CHAIN_WALLET_MNEMONIC];

export function chainFromParams(): { client: ChainClient | null; mnemonic: string | null } {
  const rpcUrl = CHAIN_RPC_URL.value();
  const contractAddress = CHAIN_CONTRACT_ADDRESS.value();
  // Secrets are read only when the chain is switched on, so a chain-less emulator run stays quiet.
  if (!rpcUrl || !contractAddress) return { client: null, mnemonic: null };
  const minterPrivateKey = CHAIN_MINTER_KEY.value();
  const mnemonic = CHAIN_WALLET_MNEMONIC.value();
  if (!minterPrivateKey || !mnemonic) return { client: null, mnemonic: null };
  return { client: createChainClient({ rpcUrl, contractAddress, minterPrivateKey }), mnemonic };
}
