#!/usr/bin/env bash
# Runs the native client's unit tests.
set -euo pipefail
make -C "$(dirname "$0")/../native" test
