#!/bin/bash

# Install Git hooks for OpenShift Auto-Login extension

echo "🔧 Installing Git hooks..."

# Get the repository root
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)

if [ -z "$REPO_ROOT" ]; then
  echo "❌ Error: Not in a git repository"
  exit 1
fi

# Create .git/hooks directory if it doesn't exist
mkdir -p "$REPO_ROOT/.git/hooks"

# Copy pre-commit hook
HOOK_SOURCE="$REPO_ROOT/.github/hooks/pre-commit"
HOOK_DEST="$REPO_ROOT/.git/hooks/pre-commit"

if [ ! -f "$HOOK_SOURCE" ]; then
  echo "❌ Error: Hook file not found at $HOOK_SOURCE"
  exit 1
fi

cp "$HOOK_SOURCE" "$HOOK_DEST"
chmod +x "$HOOK_DEST"

echo "✅ Pre-commit hook installed!"
echo ""
echo "The hook will run automatically before each commit."
echo ""
echo "📋 What it validates:"
echo "  • Manifest.json syntax and version"
echo "  • Security (no hardcoded secrets, no eval())"
echo "  • ESLint on staged JavaScript files"
echo "  • Commit message format"
echo ""
echo "💡 To skip the hook on a specific commit, use:"
echo "   git commit --no-verify -m \"message\""
echo ""
echo "🗑️  To uninstall, run:"
echo "   rm .git/hooks/pre-commit"
