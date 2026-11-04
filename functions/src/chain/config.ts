import { defineSecret, defineString } from 'firebase-functions/params';
import { createChainClient, type ChainClient } from './client';

// The contract address is public and is the on/off switch: empty means the chain is off, and ops wait
// in chainOps until retryChainOps replays them. The RPC URL is a secret because provider URLs
// (Alchemy, Infura) embed the API key.
export const CHAIN_CONTRACT_ADDRESS = defineString('CHAIN_CONTRACT_ADDRESS', { default: '' });
export const CHAIN_RPC_URL = defineSecret('CHAIN_RPC_URL');
export const CHAIN_MINTER_KEY = defineSecret('CHAIN_MINTER_KEY');
export const CHAIN_WALLET_MNEMONIC = defineSecret('CHAIN_WALLET_MNEMONIC');
export const CHAIN_SECRETS = [CHAIN_RPC_URL, CHAIN_MINTER_KEY, CHAIN_WALLET_MNEMONIC];

export function chainFromParams(): { client: ChainClient | null; mnemonic: string | null } {
  const contractAddress = CHAIN_CONTRACT_ADDRESS.value();
  // Secrets are read only when the chain is switched on, so a chain-less emulator run stays quiet.
  if (!contractAddress) return { client: null, mnemonic: null };
  const rpcUrl = CHAIN_RPC_URL.value();
  const minterPrivateKey = CHAIN_MINTER_KEY.value();
  const mnemonic = CHAIN_WALLET_MNEMONIC.value();
  if (!rpcUrl || !minterPrivateKey || !mnemonic) return { client: null, mnemonic: null };
  return { client: createChainClient({ rpcUrl, contractAddress, minterPrivateKey }), mnemonic };
}
