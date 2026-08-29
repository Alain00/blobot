#!/usr/bin/env bash
# usage: run-restart.sh <tag> <AGENT> [env assignments...]
# Runs the HTTP MCP server on a FIXED port under a restart loop; DIE_AFTER=1 makes it
# drop the very first tools/call and respawn. Tests whether the agent reconnects to a
# restarted MCP server within the SAME session (no session/load).
set -u
cd "$(dirname "$0")"
TAG=$1; AGENT=$2; shift 2
PORT=${FIXED_PORT:-47311}
rm -f "$TAG-server.log" "$TAG.jsonl"
( for i in 1 2 3 4 5; do
    if [ $i -eq 1 ]; then D=${DIE_AFTER:-1}; else D=0; fi
    env LOG="$TAG-server.log" PORT=$PORT DIE_AFTER=$D node httpmcp.mjs >/dev/null 2>&1
    sleep 0.5
  done ) &
LOOPPID=$!
sleep 1.5
echo "loop pid=$LOOPPID port=$PORT"
env AGENT=$AGENT PROJ="$PWD/proj" OUT="$TAG.jsonl" URL="http://127.0.0.1:$PORT/mcp" SCENARIO=twoturns "$@" \
  timeout "${TMO:-300}" node drive-http.mjs 2>&1 | tail -30
kill $LOOPPID 2>/dev/null
echo "=== SERVER LOG ==="
grep -E 'LISTENING|TOOL CALLED|DIE_AFTER|tools/list' "$TAG-server.log"
