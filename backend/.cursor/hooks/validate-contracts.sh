#!/usr/bin/env sh
set -e
cd "$(dirname "$0")/../.."
pnpm contracts:validate
