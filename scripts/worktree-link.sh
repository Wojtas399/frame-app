#!/bin/sh
# Run inside a git worktree. Symlinks the main checkout's gitignored .env files into this worktree, so every worktree shares one copy.
# Safe to run again. Leaves a real (non-link) file alone.
set -eu
cd "$(git rev-parse --show-toplevel)"
MAIN="$(dirname "$(cd "$(git rev-parse --git-common-dir)" && pwd)")"
if [ "$MAIN" = "$(pwd)" ]; then
  echo "This is the main checkout; nothing to link."
  exit 0
fi
found=0
for src in "$MAIN"/.env "$MAIN"/.env.*; do
  [ -f "$src" ] || continue
  found=1
  name="$(basename "$src")"
  if [ -e "$name" ] && [ ! -L "$name" ]; then
    echo "skip $name: a real file is already here"
    continue
  fi
  ln -sfn "$src" "$name"
  echo "$name -> $src"
done
[ "$found" = 1 ] || echo "No .env files in $MAIN"
