// Gas budget for the minter wallet. Pure functions so tests can check them without a network.

// Gas units measured on the Hardhat network (2026-11-04, solc 0.8.28, optimizer 200).
// test/budget.test.js re-measures them and fails when the contract drifts more than 5%.
const GAS = {
  deploy: 1_710_876n,
  createEvent: 48_572n,
  mint: 102_881n,
  reassign: 62_088n,
  markUsed: 49_649n,
  release: 41_419n,
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
