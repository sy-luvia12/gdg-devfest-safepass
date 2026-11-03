const { expect } = require('chai');
const { ethers } = require('hardhat');
const { mine } = require('@nomicfoundation/hardhat-network-helpers');

const key = (s) => ethers.id(s);

describe('FestivalTicket lottery commit-reveal', () => {
  const EVENT = key('draw-festival');
  const C = key('snapshot-1');
  let ticket, minter, outsider;

  beforeEach(async () => {
    let admin;
    [admin, minter, outsider] = await ethers.getSigners();
    ticket = await ethers.deployContract('FestivalTicket', [admin.address, minter.address]);
    await ticket.connect(minter).createEvent(EVENT, 10);
  });

  it('commits with a seed block SEED_DELAY ahead and emits DrawCommitted', async () => {
    const delay = await ticket.SEED_DELAY();
    const tx = await ticket.connect(minter).commitDraw(EVENT, 1, C);
    const { blockNumber } = await tx.wait();
    const seedBlock = BigInt(blockNumber) + delay;
    await expect(tx).to.emit(ticket, 'DrawCommitted').withArgs(EVENT, 1, C, seedBlock);
    expect(await ticket.draws(EVENT, 1)).to.deep.equal([C, seedBlock, ethers.ZeroHash]);
  });

  it('only the minter commits, only for a known event, never an empty hash', async () => {
    await expect(ticket.connect(outsider).commitDraw(EVENT, 1, C)).to.be.revertedWithCustomError(
      ticket,
      'AccessControlUnauthorizedAccount',
    );
    await expect(ticket.connect(minter).commitDraw(key('nope'), 1, C)).to.be.revertedWithCustomError(ticket, 'UnknownEvent');
    await expect(ticket.connect(minter).commitDraw(EVENT, 1, ethers.ZeroHash)).to.be.revertedWithCustomError(
      ticket,
      'EmptyCommitment',
    );
  });

  it('refuses a second commit for a live round', async () => {
    await ticket.connect(minter).commitDraw(EVENT, 1, C);
    await expect(ticket.connect(minter).commitDraw(EVENT, 1, key('other'))).to.be.revertedWithCustomError(
      ticket,
      'DrawAlreadyCommitted',
    );
  });

  it('lets anyone store the seed once the seed block exists, and stores blockhash(seedBlock)', async () => {
    await ticket.connect(minter).commitDraw(EVENT, 1, C);
    await expect(ticket.connect(outsider).seedDraw(EVENT, 1)).to.be.revertedWithCustomError(ticket, 'SeedNotReady');
    const [, seedBlock] = await ticket.draws(EVENT, 1);
    await mine(Number(await ticket.SEED_DELAY()));
    const block = await ethers.provider.getBlock(Number(seedBlock));
    await expect(ticket.connect(outsider).seedDraw(EVENT, 1)).to.emit(ticket, 'DrawSeeded').withArgs(EVENT, 1, block.hash);
    expect((await ticket.draws(EVENT, 1))[2]).to.equal(block.hash);
    await expect(ticket.connect(outsider).seedDraw(EVENT, 1)).to.be.revertedWithCustomError(ticket, 'DrawAlreadySeeded');
    await expect(ticket.connect(minter).commitDraw(EVENT, 1, key('again'))).to.be.revertedWithCustomError(
      ticket,
      'DrawAlreadySeeded',
    );
  });

  it('refuses to seed a round that was never committed', async () => {
    await expect(ticket.seedDraw(EVENT, 9)).to.be.revertedWithCustomError(ticket, 'DrawNotCommitted');
  });

  it('expires after 256 blocks; a recommit is allowed and shows up as a second event', async () => {
    await ticket.connect(minter).commitDraw(EVENT, 1, C);
    await mine(300);
    await expect(ticket.seedDraw(EVENT, 1)).to.be.revertedWithCustomError(ticket, 'SeedExpired');
    const C2 = key('snapshot-1-retry');
    await expect(ticket.connect(minter).commitDraw(EVENT, 1, C2)).to.emit(ticket, 'DrawCommitted');
    expect((await ticket.queryFilter(ticket.filters.DrawCommitted(EVENT, 1))).length).to.equal(2);
    await mine(Number(await ticket.SEED_DELAY()));
    await expect(ticket.seedDraw(EVENT, 1)).to.emit(ticket, 'DrawSeeded');
  });

  it('keeps rounds and events independent', async () => {
    const OTHER = key('other-festival');
    await ticket.connect(minter).createEvent(OTHER, 1);
    await ticket.connect(minter).commitDraw(EVENT, 1, C);
    await ticket.connect(minter).commitDraw(EVENT, 2, C);
    await ticket.connect(minter).commitDraw(OTHER, 1, C);
    expect((await ticket.draws(EVENT, 3))[0]).to.equal(ethers.ZeroHash);
  });
});
