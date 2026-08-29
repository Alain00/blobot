#!/usr/bin/env bash
# usage: run.sh <tag> <AGENT> [extra env assignments...]
set -u
cd "$(dirname "$0")"
TAG=$1; AGENT=$2; shift 2
rm -f "$TAG-server.log" "$TAG.jsonl" "$TAG-port.txt"
SRVENV="LOG=$TAG-server.log"
env $SRVENV ${SRV_EXTRA:-} node httpmcp.mjs > "$TAG-port.txt" 2>&1 &
SRVPID=$!
sleep 1.5
PORT=$(awk '{print $2}' "$TAG-port.txt")
echo "server pid=$SRVPID port=$PORT"
if [ -n "${DEAD_PORT:-}" ]; then PORT=$DEAD_PORT; echo "using DEAD_PORT=$PORT"; fi
env AGENT=$AGENT PROJ="$PWD/proj" OUT="$TAG.jsonl" URL="http://127.0.0.1:$PORT/mcp" "$@" \
  timeout "${TMO:-300}" node drive-http.mjs 2>&1 | tail -30
kill $SRVPID 2>/dev/null
echo "=== SERVER LOG ($TAG-server.log) ==="
cat "$TAG-server.log" 2>/dev/null
