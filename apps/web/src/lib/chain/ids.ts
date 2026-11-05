import { keccak256, stringToBytes, type Hex } from 'viem';

// Same derivation as functions/src/chain/ids.ts, so the browser finds a ticket on chain from its Firestore id alone.
export const eventKeyOf = (eventId: string): Hex => keccak256(stringToBytes(eventId));
export const tokenIdOf = (ticketId: string): string => BigInt(keccak256(stringToBytes(ticketId))).toString();
