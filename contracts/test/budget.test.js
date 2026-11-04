const { expect } = require('chai');
const { ethers } = require('hardhat');
const { GAS, TICKET_GAS, budget } = require('../scripts/budget');

const gwei = (n) => ethers.parseUnits(String(n), 'gwei');
const pol = (n) => ethers.parseEther(String(n));

// Fails when a contract change moves real gas use away from the numbers the wallet budget relies on.
describe('gas budget constants', () => {
  const within = (actual, expected) => {
    const diff = actual > expected ? actual - expected : expected - actual;
    expect(Number(diff) / Number(expected), `actual ${actual} vs budget ${expected}`).to.be.at.most(0.05);
  };

  it('match measured gas for every minter operation', async () => {
    const [admin, a, b] = await ethers.getSigners();
    const factory = await ethers.getContractFactory('FestivalTicket');
    within(await admin.estimateGas(await factory.getDeployTransaction(admin.address, admin.address)), GAS.deploy);

    const c = await factory.deploy(admin.address, admin.address);
    await c.waitForDeployment();
    const used = async (p) => (await (await p).wait()).gasUsed;
    const ev = ethers.id('budget-event');

    within(await used(c.createEvent(ev, 10)), GAS.createEvent);
    within(await used(c.mint(a.address, 1n, ev)), GAS.mint);
    within(await used(c.reassign(1n, b.address, 1)), GAS.reassign);
    within(await used(c.markUsed(1n)), GAS.markUsed);
    await used(c.mint(a.address, 2n, ev));
    within(await used(c.release(2n, 3)), GAS.release);
    within(await used(c.commitDraw(ev, 1, ethers.id('snap'))), GAS.commitDraw);
    await ethers.provider.send('hardhat_mine', ['0x6']);
    within(await used(c.seedDraw(ev, 1)), GAS.seedDraw);
  });
});

describe('budget()', () => {
  it('counts setup and tickets for a fresh deploy at 30 gwei with 0.1 POL', () => {
    const r = budget({ balance: pol('0.1'), price: gwei(30), deployed: false });
    expect(r.setupCost).to.equal((GAS.deploy + GAS.createEvent) * gwei(30));
    expect(r.perTicket).to.equal(TICKET_GAS * gwei(30));
    expect(r.canSetup).to.equal(true);
    // (0.1 - 0.0594) / 0.00458 = 8.9
    expect(r.ticketsCovered).to.equal(8);
  });

  it('skips the deploy cost once the contract exists', () => {
    const fresh = budget({ balance: pol('0.1'), price: gwei(30), deployed: false });
    const after = budget({ balance: pol('0.1'), price: gwei(30), deployed: true });
    expect(after.setupCost).to.equal(GAS.createEvent * gwei(30));
    expect(after.ticketsCovered).to.be.greaterThan(fresh.ticketsCovered);
  });

  it('reports no setup and no tickets on an empty wallet', () => {
    const r = budget({ balance: 0n, price: gwei(30), deployed: false });
    expect(r.canSetup).to.equal(false);
    expect(r.ticketsCovered).to.equal(0);
  });

  it('charges createEvent once per event', () => {
    const r = budget({ balance: pol('1'), price: gwei(30), deployed: true, events: 3 });
    expect(r.setupCost).to.equal(GAS.createEvent * 3n * gwei(30));
  });

  it('rejects a zero gas price', () => {
    expect(() => budget({ balance: pol('1'), price: 0n, deployed: false })).to.throw('price must be positive');
  });
});
