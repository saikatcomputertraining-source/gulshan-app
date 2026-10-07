#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${1:-https://gulshanbazarbd.com}"
docker run --rm -e BASE_URL="$BASE_URL" -v "$PWD/load-test:/scripts" grafana/k6:latest run /scripts/catalog.js
