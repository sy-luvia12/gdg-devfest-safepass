import { AbiCoder, keccak256, toUtf8Bytes } from 'ethers';
import { describe, expect, it } from 'vitest';
import { eventKeyOf } from '../src/chain/ids';
import { BPS, entryIdOf, scoreOf, studentRefOf, winBpsOf } from '../src/domain/entryDraw';

const abi = AbiCoder.defaultAbiCoder();

describe('winBpsOf', () => {
  it('is capacity / pool in 1/10000, so more students per ticket is harder', () => {
    expect(winBpsOf(5_000, 20_000)).toBe(2_500);
    expect(winBpsOf(3_000, 20_000)).toBe(1_500);
    expect(winBpsOf(12_000, 19_000)).toBe(6_315);
    expect(winBpsOf(3_000, 20_000)).toBeLessThan(winBpsOf(5_000, 20_000));
  });

  it('lets everyone win when there are at least as many tickets as students, or no pool is known', () => {
    expect(winBpsOf(5_000, 5_000)).toBe(BPS);
    expect(winBpsOf(5_000, 3)).toBe(BPS);
    expect(winBpsOf(5_000, 0)).toBe(BPS);
  });

  it('never rounds a real chance down to zero, and gives nothing without tickets', () => {
    expect(winBpsOf(1, 1_000_000)).toBe(1);
    expect(winBpsOf(0, 20_000)).toBe(0);
  });
});

describe('entry ids and scores', () => {
  const key = eventKeyOf('korea-koyon-basketball');
  const salt = `0x${'11'.repeat(32)}`;

  it('hides the student behind a salted hash', () => {
    const ref = studentRefOf('korea', '2024123456');
    expect(ref).toBe(keccak256(toUtf8Bytes('korea:2024123456')));
    const id = entryIdOf(key, ref, salt);
    expect(id).toBe(keccak256(abi.encode(['bytes32', 'bytes32', 'bytes32'], [key, ref, salt])));
    expect(entryIdOf(key, ref, `0x${'22'.repeat(32)}`)).not.toBe(id);
    expect(entryIdOf(eventKeyOf('other'), ref, salt)).not.toBe(id);
  });

  it('scores like FestivalTicket.settleEntry: keccak256(abi.encode(seed, entryId)) % 10000', () => {
    const seed = `0x${'ab'.repeat(32)}`;
    const id = entryIdOf(key, studentRefOf('korea', '1'), salt);
    const expected = Number(BigInt(keccak256(abi.encode(['bytes32', 'bytes32'], [seed, id]))) % 10_000n);
    expect(scoreOf(seed, id)).toBe(expected);
    expect(scoreOf(seed, id)).toBeGreaterThanOrEqual(0);
    expect(scoreOf(seed, id)).toBeLessThan(BPS);
  });
});
