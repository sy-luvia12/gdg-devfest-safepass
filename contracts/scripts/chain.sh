#!/usr/bin/env bash
# Runs a contracts task against a public testnet with the minter key read from a local file.
# The key never appears on the command line, in shell history or in output.
#   MINTER_KEY_FILE  JSON file with {"address","privateKey"}, kept outside the repo (mode 600)
#   NETWORK          optional: baseSepolia (default) or amoy, see scripts/networks.js
#   BASE_SEPOLIA_RPC_URL / AMOY_RPC_URL  optional RPC override, defaults to publicnode
# Usage: scripts/chain.sh preflight | deploy | verify
set -euo pipefail
cd "$(dirname "$0")/.."

: "${MINTER_KEY_FILE:?set MINTER_KEY_FILE to the minter key JSON (outside the repo)}"
NETWORK="${NETWORK:-baseSepolia}"
node -e 'const {NETWORKS}=require("./scripts/networks"); if(!NETWORKS[process.argv[1]]){console.error("unknown NETWORK "+process.argv[1]+"; one of "+Object.keys(NETWORKS).join(", ")); process.exit(2)}' "$NETWORK"
# Turn tracing off while the key is in a variable, so `bash -x` cannot print it.
case $- in *x*) had_x=1 ;; *) had_x= ;; esac
{ set +x; } 2>/dev/null
MINTER_PRIVATE_KEY="$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).privateKey)' "$MINTER_KEY_FILE")"
export MINTER_PRIVATE_KEY
[ -n "$had_x" ] && set -x

deployment="./deployments/$NETWORK.json"
case "${1:-}" in
  preflight) npx hardhat run scripts/preflight.js --network "$NETWORK" ;;
  deploy)
    npx hardhat run scripts/preflight.js --network "$NETWORK"
    npx hardhat run scripts/deploy.js --network "$NETWORK" ;;
  verify)
    addr="$(node -p "require('$deployment').address")"
    minter="$(node -p "require('$deployment').minter")"
    npx hardhat verify --network "$NETWORK" "$addr" "$minter" "$minter" ;;
  *) echo "usage: $0 preflight|deploy|verify" >&2; exit 2 ;;
esac
