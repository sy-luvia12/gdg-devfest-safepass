const { expect } = require('chai');
const { ethers } = require('hardhat');
const vectors = require('./vectors/draw.json');

// The lottery vectors (functions/scripts/draw-vectors.ts) recomputed by Solidity and OpenZeppelin MerkleProof.
describe('lottery snapshot format', function () {
  let check;
  before(async function () {
    check = await (await ethers.getContractFactory('DrawFormatCheck')).deploy();
  });

  for (const c of vectors.cases) {
    it(`matches the off-chain vectors: ${c.name}`, async function () {
      const { input, expected } = c;
      expect(await check.ticketsHash(expected.tokenIds)).to.equal(expected.ticketsHash);
      expect(await check.commitment(expected.eventKey, input.round, expected.root, expected.ticketsHash)).to.equal(
        expected.commitment,
      );
      for (const [i, e] of expected.perEntry.entries()) {
        const salt = input.entries[i].salt;
        expect(await check.leaf(expected.eventKey, input.round, e.uid, salt)).to.equal(e.leaf);
        expect(await check.included(e.proof, expected.root, e.leaf)).to.equal(true);
        expect((await check.score(input.seed, e.leaf)).toString()).to.equal(e.score);
      }
      const wrong = ethers.id('not an entry');
      expect(await check.included(expected.perEntry[0].proof, expected.root, wrong)).to.equal(false);
    });
  }
});
