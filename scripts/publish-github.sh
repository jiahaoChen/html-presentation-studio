#!/usr/bin/env bash
set -euo pipefail

# Run after installing GitHub CLI and authenticating with `gh auth login`.
# Defaults to a private repository to avoid publishing potentially internal presentations.
REPO_OWNER="${REPO_OWNER:-jiahaoChen}"
REPO_NAME="${REPO_NAME:-html-presentation-studio}"
REPO="${REPO_OWNER}/${REPO_NAME}"

command -v gh >/dev/null || { echo 'GitHub CLI (gh) is required. Install it and run: gh auth login' >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo 'Please run: gh auth login' >&2; exit 1; }
if gh repo view "$REPO" >/dev/null 2>&1; then
  echo "Repository $REPO already exists. Refusing to overwrite or push automatically." >&2
  exit 1
fi
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git init -b main
fi
git add .
if ! git diff --cached --quiet; then
  git commit -m "feat: initial HTML Presentation Studio MVP"
fi
git branch -M main
gh repo create "$REPO" --private --source=. --remote=origin --push
printf 'Published: https://github.com/%s\n' "$REPO"