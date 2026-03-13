#!/bin/zsh
set -e
echo "=== PWD ==="
pwd
echo
echo "=== GIT STATUS ==="
git status -sb
echo
echo "=== LATEST COMMITS ==="
git log -5 --oneline
echo
echo "=== HANDOFF_CURRENT ==="
sed -n '1,200p' docs/handoff/HANDOFF_CURRENT.md
echo
echo "=== SESSION_LOG ==="
sed -n '1,200p' docs/handoff/SESSION_LOG.md
echo
