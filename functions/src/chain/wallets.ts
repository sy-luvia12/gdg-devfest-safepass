import { HDNodeWallet, Mnemonic } from 'ethers';

// Student addresses are derived from one mnemonic, one index per user. The server stores only the
// index and the address. No student key is ever stored, and no student key is needed: the minter
// signs every transaction.
const BASE_PATH = "m/44'/60'/0'/0";

export function deriveAddress(phrase: string, index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= 2 ** 31) throw new RangeError('wallet index out of range');
  const root = HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(phrase), BASE_PATH);
  return root.deriveChild(index).address;
}
