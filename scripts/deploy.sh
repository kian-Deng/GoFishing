#!/usr/bin/env bash
set -Eeuo pipefail
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
worker=$(mktemp)
trap 'rm -f "$worker"' EXIT
cp "$root/scripts/deploy-worker.sh" "$worker"
bash "$worker" "$root" "$@"
