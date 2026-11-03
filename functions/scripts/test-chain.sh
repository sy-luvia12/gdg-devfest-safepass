#!/usr/bin/env bash
# Chain integration test: a local Hardhat chain plus the Firestore emulator.
# Needs contracts/ dependencies (npm --prefix contracts ci), JDK 21+ and the firebase CLI.
set -euo pipefail
cd "$(dirname "$0")/.."
CONTRACTS=../contracts
LOG=$(mktemp)
(cd "$CONTRACTS" && exec npx hardhat node) >"$LOG" 2>&1 &
NODE_PID=$!
trap 'kill $NODE_PID 2>/dev/null || true; rm -f "$LOG"' EXIT
for _ in $(seq 1 120); do
  curl -s -X POST -H 'Content-Type: application/json' --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' http://127.0.0.1:8545 >/dev/null && break
  sleep 0.5
done
(cd "$CONTRACTS" && npx hardhat run scripts/deploy.js --network localhost >/dev/null)
export CHAIN_TEST_CONTRACT
CHAIN_TEST_CONTRACT=$(node -p "require('$CONTRACTS/deployments/localhost.json').address")
firebase emulators:exec --project demo-ttv --only firestore "npx vitest run test/chain-int --testTimeout=60000"
