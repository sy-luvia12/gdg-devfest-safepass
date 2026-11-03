import { Contract, formatEther, HDNodeWallet, id as hashOf, JsonRpcProvider, Mnemonic, Wallet } from 'ethers';
import { redact } from './client';

// Read-only go-live check for the chain settings the functions will run with. It sends no
// transaction and reports public facts only (addresses, balance), never a key, phrase or URL.

const ERC5192_ID = '0xb45a3c0e';
// mint + markUsed, measured in contracts/scripts/budget.js (contracts/test/budget.test.js keeps it honest).
const TICKET_GAS = 102_881n + 49_649n;

export interface PreflightInput {
  rpcUrl: string;
  contractAddress: string;
  minterPrivateKey: string;
  mnemonic: string;
  expectedChainId: number;
}

export interface PreflightCheck {
  name: 'rpc' | 'contract' | 'erc5192' | 'minterRole' | 'minterGas' | 'mnemonic';
  ok: boolean;
  detail: string;
}

export interface PreflightReport {
  ok: boolean;
  minter: string | null;
  checks: PreflightCheck[];
}

const message = (e: unknown) =>
  redact((e as { shortMessage?: string })?.shortMessage ?? (e instanceof Error ? e.message : String(e)));

export async function preflightChain(input: PreflightInput): Promise<PreflightReport> {
  const checks: PreflightCheck[] = [];
  const add = (name: PreflightCheck['name'], ok: boolean, detail: string) => checks.push({ name, ok, detail });

  let minter: string | null = null;
  try {
    minter = new Wallet(input.minterPrivateKey).address;
  } catch {
    add('minterRole', false, 'minter key is not a valid private key');
  }

  try {
    const root = HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(input.mnemonic), "m/44'/60'/0'/0");
    add('mnemonic', true, `student address 0 is ${root.deriveChild(0).address}`);
  } catch {
    add('mnemonic', false, 'wallet mnemonic is not a valid BIP-39 phrase');
  }

  const provider = new JsonRpcProvider(input.rpcUrl, undefined, { staticNetwork: false });
  try {
    const { chainId } = await provider.getNetwork();
    if (Number(chainId) !== input.expectedChainId) {
      add('rpc', false, `RPC is on chain ${chainId}, expected ${input.expectedChainId}`);
      return finish();
    }
    add('rpc', true, `chain ${chainId}`);
  } catch (e) {
    add('rpc', false, `RPC unreachable: ${message(e)}`);
    return finish();
  }

  try {
    if ((await provider.getCode(input.contractAddress)) === '0x') {
      add('contract', false, `no contract at ${input.contractAddress}`);
      return finish();
    }
    add('contract', true, input.contractAddress);
    const c = new Contract(
      input.contractAddress,
      [
        'function supportsInterface(bytes4) view returns (bool)',
        'function hasRole(bytes32, address) view returns (bool)',
      ],
      provider,
    );
    const is5192 = (await c.supportsInterface(ERC5192_ID)) as boolean;
    add('erc5192', is5192, is5192 ? 'locked tickets (ERC-5192)' : 'contract does not report ERC-5192');
    if (minter) {
      const role = (await c.hasRole(hashOf('MINTER_ROLE'), minter)) as boolean;
      add('minterRole', role, role ? `${minter} has MINTER_ROLE` : `${minter} lacks MINTER_ROLE`);
      const [balance, fee] = await Promise.all([provider.getBalance(minter), provider.getFeeData()]);
      const price = fee.maxFeePerGas ?? fee.gasPrice ?? 0n;
      const tickets = price > 0n ? balance / (TICKET_GAS * price) : 0n;
      add('minterGas', tickets > 0n, `${formatEther(balance)} POL, about ${tickets} tickets at the current fee`);
    }
  } catch (e) {
    add('contract', false, `contract call failed: ${message(e)}`);
  }
  return finish();

  function finish(): PreflightReport {
    provider.destroy();
    return { ok: checks.every((c) => c.ok), minter, checks };
  }
}
