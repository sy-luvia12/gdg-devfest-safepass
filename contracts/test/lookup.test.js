const { expect } = require('chai');
const { ethers } = require('hardhat');
const { lookup, tokenIdOf, eventKeyOf } = require('../scripts/lookup');

describe('scripts/lookup.js', () => {
  let ticket, address, minter, alice;

  beforeEach(async () => {
    let admin;
    [admin, minter, alice] = await ethers.getSigners();
    ticket = await ethers.deployContract('FestivalTicket', [admin.address, minter.address]);
    address = await ticket.getAddress();
    await ticket.connect(minter).createEvent(eventKeyOf('fest'), 3);
  });

  it('uses the same ids as the server (functions/src/chain/ids.ts)', () => {
    expect(tokenIdOf('ticket-1')).to.equal(BigInt(ethers.id('ticket-1')));
    expect(eventKeyOf('fest')).to.equal(ethers.id('fest'));
  });

  it('shows an issued ticket, its owner and the event count', async () => {
    await ticket.connect(minter).mint(alice.address, tokenIdOf('t-1'), eventKeyOf('fest'));
    const r = await lookup(ethers.provider, address, { ticketId: 't-1', eventId: 'fest' });
    expect(r.soulbound).to.equal(true);
    expect(r.ticket).to.include({ status: 'active', owner: alice.address, eventMatches: true });
    expect(r.event).to.include({ exists: true, capacity: 3, active: 1 });
  });

  it('flags a ticket id the chain has never seen', async () => {
    const r = await lookup(ethers.provider, address, { ticketId: 'forged', eventId: 'fest' });
    expect(r.ticket).to.include({ status: 'never issued', owner: null, eventKey: null });
    expect(r.ticket.eventMatches).to.equal(undefined);
  });

  it('shows a used ticket and a released one', async () => {
    await ticket.connect(minter).mint(alice.address, tokenIdOf('u'), eventKeyOf('fest'));
    await ticket.connect(minter).markUsed(tokenIdOf('u'));
    await ticket.connect(minter).mint(alice.address, tokenIdOf('r'), eventKeyOf('fest'));
    await ticket.connect(minter).release(tokenIdOf('r'), 3);
    expect((await lookup(ethers.provider, address, { ticketId: 'u' })).ticket.status).to.equal('used at the gate');
    const released = await lookup(ethers.provider, address, { ticketId: 'r', eventId: 'fest' });
    expect(released.ticket).to.include({ status: 'released', owner: null, eventMatches: true });
    expect(released.event.active).to.equal(1);
  });

  it('reports an event the chain does not know', async () => {
    const r = await lookup(ethers.provider, address, { eventId: 'nope' });
    expect(r.event).to.include({ exists: false, capacity: 0, active: 0 });
  });
});
