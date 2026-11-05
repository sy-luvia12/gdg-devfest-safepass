// Gas budget for the minter wallet. Pure functions so tests can check them without a network.

// Gas units measured on the Hardhat network (2026-11-05, solc 0.8.28, optimizer 200).
// test/budget.test.js re-measures them and fails when the contract drifts more than 5%.
const GAS = {
  deploy: 2_356_473n,
  createEvent: 48_624n,
  mint: 102_881n,
  reassign: 62_088n,
  markUsed: 49_737n,
  release: 41_419n,
  commitDraw: 76_095n, // one per lottery round
  seedDraw: 50_726n,
  recordAction: 51_772n, // one per operator action (lost reissue, refund, manual entry)
  openEntry: 52_112n, // one per student and event (instant entry draw)
  settleEntry: 53_552n,
};

// One ticket that is issued and later scanned at the gate.
const TICKET_GAS = GAS.mint + GAS.markUsed;

/**
 * @param {{ balance: bigint, price: bigint, deployed: boolean, events?: number }} p
 *   price is the per-gas ceiling (maxFeePerGas); events is how many events still need createEvent.
 */
function budget({ balance, price, deployed, events = 1 }) {
  if (price <= 0n) throw new Error('price must be positive');
  const setup = (deployed ? 0n : GAS.deploy) + GAS.createEvent * BigInt(events);
  const setupCost = setup * price;
  const left = balance - setupCost;
  const perTicket = TICKET_GAS * price;
  return {
    setupCost,
    perTicket,
    canSetup: balance >= setupCost,
    ticketsCovered: left > 0n ? Number(left / perTicket) : 0,
  };
}

module.exports = { GAS, TICKET_GAS, budget };
