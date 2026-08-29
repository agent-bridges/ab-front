#!/bin/sh
set -eu

if [ -z "${BACKEND_UPSTREAM:-}" ]; then
  echo >&2 "BACKEND_UPSTREAM is required (for example, ab-core-service:8720)"
  exit 1
fi

case "$BACKEND_UPSTREAM" in
  *://*|*/*|*\?*|*\#*)
    echo >&2 "BACKEND_UPSTREAM must be a host:port authority without scheme or path"
    exit 1
    ;;
esac
