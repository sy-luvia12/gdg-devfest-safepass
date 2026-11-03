const { expect } = require('chai');
const { ethers } = require('hardhat');

const key = (eventId) => ethers.keccak256(ethers.toUtf8Bytes(eventId));
const tokenOf = (ticketId) => BigInt(ethers.keccak256(ethers.toUtf8Bytes(ticketId)));
const R = { QUEUE: 1, RANDOM: 2, RELEASED: 3, REVOKE: 4 };

describe('FestivalTicket', () => {
  let ticket, admin, minter, alice, bob, outsider;
  const EVENT = key('demo-festival');
  const T1 = tokenOf('ticket-1');

  beforeEach(async () => {
    [admin, minter, alice, bob, outsider] = await ethers.getSigners();
    ticket = await ethers.deployContract('FestivalTicket', [admin.address, minter.address]);
    await ticket.connect(minter).createEvent(EVENT, 2);
  });

  describe('events', () => {
    it('fixes capacity once and emits EventCreated', async () => {
      const other = key('other');
      await expect(ticket.connect(minter).createEvent(other, 5)).to.emit(ticket, 'EventCreated').withArgs(other, 5);
      await expect(ticket.connect(minter).createEvent(other, 9)).to.be.revertedWithCustomError(ticket, 'EventExists');
      expect(await ticket.eventInfo(other)).to.deep.equal([5n, 0n, true]);
    });

    it('refuses zero capacity and non-minters', async () => {
      await expect(ticket.connect(minter).createEvent(key('z'), 0)).to.be.revertedWithCustomError(ticket, 'InvalidCapacity');
      await expect(ticket.connect(admin).createEvent(key('x'), 1)).to.be.revertedWithCustomError(
        ticket,
        'AccessControlUnauthorizedAccount',
      );
    });
  });

  describe('mint', () => {
    it('mints to the student and emits Issued', async () => {
      await expect(ticket.connect(minter).mint(alice.address, T1, EVENT))
        .to.emit(ticket, 'Issued')
        .withArgs(T1, EVENT, alice.address);
      expect(await ticket.ownerOf(T1)).to.equal(alice.address);
      expect(await ticket.eventOf(T1)).to.equal(EVENT);
    });

    it('cannot mint the same ticket twice (safe to retry)', async () => {
      await ticket.connect(minter).mint(alice.address, T1, EVENT);
      await expect(ticket.connect(minter).mint(bob.address, T1, EVENT)).to.be.revertedWithCustomError(
        ticket,
        'ERC721InvalidSender',
      );
    });

    it('cannot mint past capacity, not even the minter', async () => {
      await ticket.connect(minter).mint(alice.address, tokenOf('a'), EVENT);
      await ticket.connect(minter).mint(bob.address, tokenOf('b'), EVENT);
      await expect(ticket.connect(minter).mint(outsider.address, tokenOf('c'), EVENT))
        .to.be.revertedWithCustomError(ticket, 'CapacityReached')
        .withArgs(EVENT);
    });

    it('refuses unknown events and non-minters', async () => {
      await expect(ticket.connect(minter).mint(alice.address, T1, key('nope'))).to.be.revertedWithCustomError(
        ticket,
        'UnknownEvent',
      );
      await expect(ticket.connect(alice).mint(alice.address, T1, EVENT)).to.be.revertedWithCustomError(
        ticket,
        'AccessControlUnauthorizedAccount',
      );
    });
  });

  describe('no student-to-student transfer', () => {
    beforeEach(async () => ticket.connect(minter).mint(alice.address, T1, EVENT));

    it('refuses transferFrom and safeTransferFrom by the owner', async () => {
      await expect(ticket.connect(alice).transferFrom(alice.address, bob.address, T1)).to.be.revertedWithCustomError(
        ticket,
        'TransferNotAllowed',
      );
      await expect(
        ticket.connect(alice)['safeTransferFrom(address,address,uint256)'](alice.address, bob.address, T1),
      ).to.be.revertedWithCustomError(ticket, 'TransferNotAllowed');
      expect(await ticket.ownerOf(T1)).to.equal(alice.address);
    });

    it('refuses approvals', async () => {
      await expect(ticket.connect(alice).approve(bob.address, T1)).to.be.revertedWithCustomError(ticket, 'TransferNotAllowed');
      await expect(ticket.connect(alice).setApprovalForAll(bob.address, true)).to.be.revertedWithCustomError(
        ticket,
        'TransferNotAllowed',
      );
    });

    it('the admin role alone cannot move tickets either', async () => {
      await expect(ticket.connect(admin).reassign(T1, bob.address, R.QUEUE)).to.be.revertedWithCustomError(
        ticket,
        'AccessControlUnauthorizedAccount',
      );
    });
  });

  describe('reassign', () => {
    beforeEach(async () => ticket.connect(minter).mint(alice.address, T1, EVENT));

    it('moves the ticket and records the reason', async () => {
      await expect(ticket.connect(minter).reassign(T1, bob.address, R.RANDOM))
        .to.emit(ticket, 'Reassigned')
        .withArgs(T1, alice.address, bob.address, R.RANDOM);
      expect(await ticket.ownerOf(T1)).to.equal(bob.address);
      expect((await ticket.eventInfo(EVENT))[1]).to.equal(1n); // still one active ticket
    });

    it('refuses an unknown reason', async () => {
      await expect(ticket.connect(minter).reassign(T1, bob.address, R.RELEASED))
        .to.be.revertedWithCustomError(ticket, 'InvalidReason')
        .withArgs(R.RELEASED);
    });
  });

  describe('release', () => {
    beforeEach(async () => ticket.connect(minter).mint(alice.address, T1, EVENT));

    it('burns the ticket and frees a seat', async () => {
      await expect(ticket.connect(minter).release(T1, R.RELEASED)).to.emit(ticket, 'Released').withArgs(T1, R.RELEASED);
      await expect(ticket.ownerOf(T1)).to.be.revertedWithCustomError(ticket, 'ERC721NonexistentToken');
      expect((await ticket.eventInfo(EVENT))[1]).to.equal(0n);
      await ticket.connect(minter).mint(bob.address, tokenOf('next'), EVENT);
    });

    it('refuses a reason meant for reassign', async () => {
      await expect(ticket.connect(minter).release(T1, R.QUEUE)).to.be.revertedWithCustomError(ticket, 'InvalidReason');
    });
  });

  describe('markUsed', () => {
    beforeEach(async () => ticket.connect(minter).mint(alice.address, T1, EVENT));

    it('freezes the ticket after entry', async () => {
      await expect(ticket.connect(minter).markUsed(T1)).to.emit(ticket, 'Used').withArgs(T1);
      expect(await ticket.isUsed(T1)).to.equal(true);
      await expect(ticket.connect(minter).markUsed(T1)).to.be.revertedWithCustomError(ticket, 'TicketUsed');
      await expect(ticket.connect(minter).reassign(T1, bob.address, R.QUEUE)).to.be.revertedWithCustomError(
        ticket,
        'TicketUsed',
      );
      await expect(ticket.connect(minter).release(T1, R.RELEASED)).to.be.revertedWithCustomError(ticket, 'TicketUsed');
    });

    it('refuses a ticket that does not exist', async () => {
      await expect(ticket.connect(minter).markUsed(tokenOf('ghost'))).to.be.revertedWithCustomError(
        ticket,
        'ERC721NonexistentToken',
      );
    });
  });

  it('supports the ERC-721 and AccessControl interfaces', async () => {
    expect(await ticket.supportsInterface('0x80ac58cd')).to.equal(true); // ERC-721
    expect(await ticket.supportsInterface('0x7965db0b')).to.equal(true); // AccessControl
  });
});
