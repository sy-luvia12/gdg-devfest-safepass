#!/usr/bin/env bash
# Runs a contracts task against Polygon Amoy with the minter key read from a local file.
# The key never appears on the command line, in shell history or in output.
#   MINTER_KEY_FILE  JSON file with {"address","privateKey"}, kept outside the repo (mode 600)
#   AMOY_RPC_URL     optional, defaults to the public publicnode endpoint
# Usage: scripts/amoy.sh preflight | deploy | verify
set -euo pipefail
cd "$(dirname "$0")/.."

: "${MINTER_KEY_FILE:?set MINTER_KEY_FILE to the minter key JSON (outside the repo)}"
export AMOY_RPC_URL="${AMOY_RPC_URL:-https://polygon-amoy-bor-rpc.publicnode.com}"
# Turn tracing off while the key is in a variable, so `bash -x` cannot print it.
case $- in *x*) had_x=1 ;; *) had_x= ;; esac
{ set +x; } 2>/dev/null
MINTER_PRIVATE_KEY="$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).privateKey)' "$MINTER_KEY_FILE")"
export MINTER_PRIVATE_KEY
[ -n "$had_x" ] && set -x

case "${1:-}" in
  preflight) npx hardhat run scripts/preflight.js --network amoy ;;
  deploy)
    npx hardhat run scripts/preflight.js --network amoy
    npx hardhat run scripts/deploy.js --network amoy ;;
  verify)
    addr="$(node -p 'require("./deployments/amoy.json").address')"
    minter="$(node -p 'require("./deployments/amoy.json").minter')"
    npx hardhat verify --network amoy "$addr" "$minter" "$minter" ;;
  *) echo "usage: $0 preflight|deploy|verify" >&2; exit 2 ;;
esac
