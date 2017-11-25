#!/usr/bin/env sh
set -e

test $# -gt 0

case "$1" in
develop)
  npm install
  exec npm run develop
  ;;
*)
  exec "$@"
  ;;
esac
