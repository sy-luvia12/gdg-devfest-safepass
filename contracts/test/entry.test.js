const { expect } = require('chai');
const { ethers } = require('hardhat');
const { mine } = require('@nomicfoundation/hardhat-network-helpers');

const key = (s) => ethers.id(s);
const abi = ethers.AbiCoder.defaultAbiCoder();
const scoreOf = (seed, entryId) => Number(BigInt(ethers.keccak256(abi.encode(['bytes32', 'bytes32'], [seed, entryId]))) % 10000n);

describe('FestivalTicket instant entry draw', () => {
  const EVENT = key('entry-festival');
  let ticket, minter, outsider;

  beforeEach(async () => {
    let admin;
    [admin, minter, outsider] = await ethers.getSigners();
    ticket = await ethers.deployContract('FestivalTicket', [admin.address, minter.address]);
    await ticket.connect(minter).createEvent(EVENT, 2);
  });

  const open = (id, bps) => ticket.connect(minter).openEntry(EVENT, id, bps);

  it('opens with a seed block SEED_DELAY ahead and emits EntryOpened', async () => {
    const id = key('student-1');
    const tx = await open(id, 2500);
    const { blockNumber } = await tx.wait();
    const seedBlock = BigInt(blockNumber) + (await ticket.SEED_DELAY());
    await expect(tx).to.emit(ticket, 'EntryOpened').withArgs(EVENT, id, 2500, seedBlock);
    expect(await ticket.entries(EVENT, id)).to.deep.equal([seedBlock, 2500n, 0n]);
  });

  it('only the minter opens, for a known event, a non-empty entry and a rate of at most 10000', async () => {
    const id = key('s');
    await expect(ticket.connect(outsider).openEntry(EVENT, id, 1)).to.be.revertedWithCustomError(ticket, 'AccessControlUnauthorizedAccount');
    await expect(ticket.connect(minter).openEntry(key('nope'), id, 1)).to.be.revertedWithCustomError(ticket, 'UnknownEvent');
    await expect(open(ethers.ZeroHash, 1)).to.be.revertedWithCustomError(ticket, 'EmptyEntry');
    await expect(open(id, 10001)).to.be.revertedWithCustomError(ticket, 'InvalidWinRate');
    await expect(open(id, 10000)).to.emit(ticket, 'EntryOpened');
  });

  it('refuses to reopen a live entry', async () => {
    const id = key('s');
    await open(id, 5000);
    await expect(open(id, 10000)).to.be.revertedWithCustomError(ticket, 'EntryAlreadyOpen');
  });

  it('lets anyone settle once the seed block exists, and the result follows the block hash', async () => {
    const id = key('s');
    await open(id, 5000);
    await expect(ticket.connect(outsider).settleEntry(EVENT, id)).to.be.revertedWithCustomError(ticket, 'SeedNotReady');
    await mine(5);
    const { seedBlock } = await ticket.entries(EVENT, id);
    const settle = await ticket.connect(outsider).settleEntry(EVENT, id);
    const seed = (await ethers.provider.getBlock(Number(seedBlock))).hash;
    const score = scoreOf(seed, id);
    const won = score < 5000;
    await expect(settle).to.emit(ticket, 'EntrySettled').withArgs(EVENT, id, seed, score, won);
    expect((await ticket.entries(EVENT, id)).result).to.equal(won ? 1n : 2n);
    expect(await ticket.entryStats(EVENT)).to.deep.equal([1n, won ? 1n : 0n]);
    await expect(ticket.settleEntry(EVENT, id)).to.be.revertedWithCustomError(ticket, 'EntryAlreadySettled');
    // A settled entry is never drawn again
    await expect(open(id, 10000)).to.be.revertedWithCustomError(ticket, 'EntryAlreadySettled');
  });

  it('a rate of 0 always loses and 10000 always wins until the capacity is reached', async () => {
    const ids = ['a', 'b', 'c', 'zero'].map(key);
    for (const id of ids.slice(0, 3)) await open(id, 10000);
    await open(ids[3], 0);
    await mine(5);
    for (const id of ids) await ticket.settleEntry(EVENT, id);
    const results = await Promise.all(ids.map(async (id) => (await ticket.entries(EVENT, id)).result));
    // capacity 2: the third sure winner loses
    expect(results).to.deep.equal([1n, 1n, 2n, 2n]);
    expect(await ticket.entryStats(EVENT)).to.deep.equal([4n, 2n]);
  });

  it('refuses to settle an entry that was never opened or whose seed expired, then lets it reopen visibly', async () => {
    const id = key('late');
    await expect(ticket.settleEntry(EVENT, id)).to.be.revertedWithCustomError(ticket, 'EntryNotOpen');
    await open(id, 5000);
    await mine(5 + 257);
    await expect(ticket.settleEntry(EVENT, id)).to.be.revertedWithCustomError(ticket, 'SeedExpired');
    await expect(open(id, 5000)).to.emit(ticket, 'EntryOpened');
  });
});

describe('FestivalTicket operator actions', () => {
  const EVENT = key('action-festival');
  let ticket, minter, outsider;

  beforeEach(async () => {
    let admin;
    [admin, minter, outsider] = await ethers.getSigners();
    ticket = await ethers.deployContract('FestivalTicket', [admin.address, minter.address]);
    await ticket.connect(minter).createEvent(EVENT, 10);
  });

  it('counts each kind per event and emits ActionRecorded', async () => {
    const ref = key('ticket-1');
    await expect(ticket.connect(minter).recordAction(EVENT, 1, ref)).to.emit(ticket, 'ActionRecorded').withArgs(EVENT, 1, ref);
    await ticket.connect(minter).recordAction(EVENT, 1, key('ticket-2'));
    await ticket.connect(minter).recordAction(EVENT, 3, ethers.ZeroHash);
    expect(await ticket.actionCount(EVENT, 1)).to.equal(2n);
    expect(await ticket.actionCount(EVENT, 2)).to.equal(0n);
    expect(await ticket.actionCount(EVENT, 3)).to.equal(1n);
  });

  it('only the minter records, for a known event and a known kind', async () => {
    await expect(ticket.connect(outsider).recordAction(EVENT, 1, ethers.ZeroHash)).to.be.revertedWithCustomError(
      ticket,
      'AccessControlUnauthorizedAccount',
    );
    await expect(ticket.connect(minter).recordAction(key('nope'), 1, ethers.ZeroHash)).to.be.revertedWithCustomError(ticket, 'UnknownEvent');
    for (const kind of [0, 4]) {
      await expect(ticket.connect(minter).recordAction(EVENT, kind, ethers.ZeroHash)).to.be.revertedWithCustomError(ticket, 'InvalidAction');
    }
  });
});
