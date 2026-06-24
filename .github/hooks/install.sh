#!/bin/bash

# Install Git hooks for OpenShift Auto-Login extension

echo "🔧 Installing Git hooks..."

# Get the repository root
REPO_ROOT=$(git rev-parse --show-toplevel)

# Create .git/hooks directory if it doesn't exist
mkdir -p "$REPO_ROOT/.git/hooks"

# Copy pre-commit hook
cp "$REPO_ROOT/.github/hooks/pre-commit" "$REPO_ROOT/.git/hooks/pre-commit"
chmod +x "$REPO_ROOT/.git/hooks/pre-commit"

echo "✅ Pre-commit hook installed!"
echo ""
echo "The hook will run automatically before each commit."
echo ""
echo "To skip the hook on a specific commit, use:"
echo "  git commit --no-verify -m \"message\""
echo ""
echo "To uninstall, run:"
echo "  rm .git/hooks/pre-commit"
