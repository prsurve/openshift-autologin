# Pre-Commit Hooks Setup

Automatically run validation checks before every commit to catch issues early!

## 🚀 Quick Install

```bash
# One command installation
./.github/hooks/install.sh
```

**That's it!** The hook will now run automatically before every commit.

---

## ✅ What Gets Validated

Every time you run `git commit`, the hook automatically checks:

1. **Manifest validation** ✅
   - Valid JSON syntax
   - Semantic version format (e.g., `3.1.0`)
   - Required fields present

2. **Security scanning** 🔒
   - No hardcoded passwords/secrets
   - No `eval()` usage (security risk)
   - Warns on `innerHTML` usage

3. **JavaScript linting** 🔍
   - ESLint on staged `.js` files only
   - Max 10 warnings allowed
   - Auto-runs if `node_modules` exists

4. **Commit message format** 📝
   - Suggests conventional commit format
   - Examples: `feat:`, `fix:`, `docs:`

---

## 📋 Example Output

```bash
$ git commit -m "feat: add dark mode"

🔍 Running pre-commit validation...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Validating manifest.json...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Valid JSON syntax
✅ Valid version: 3.1.0

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Checking for hardcoded secrets...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ No dangerous patterns found

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Running ESLint on staged files...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ ESLint passed

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Checking commit message format...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Commit message follows conventional format

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ All pre-commit checks passed!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[ci abc1234] feat: add dark mode
 2 files changed, 50 insertions(+)
```

---

## ⚙️ Skip Hook (When Needed)

Sometimes you need to commit without validation:

```bash
# Skip validation for this commit only
git commit --no-verify -m "wip: work in progress"
```

**Common use cases:**
- Work-in-progress commits
- Emergency hotfixes
- Committing known failing code temporarily

---

## 🔧 Installation Details

### What the Install Script Does

```bash
./.github/hooks/install.sh
```

1. Copies `.github/hooks/pre-commit` to `.git/hooks/pre-commit`
2. Makes it executable (`chmod +x`)
3. Shows installation confirmation

### Manual Installation

If the script doesn't work:

```bash
cp .github/hooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
echo "✅ Pre-commit hook installed!"
```

### Verify Installation

```bash
# Check if hook exists
ls -la .git/hooks/pre-commit

# Test the hook
git commit --allow-empty -m "test: verify hook works"
```

---

## 🗑️ Uninstall

```bash
# Remove the hook
rm .git/hooks/pre-commit

# Or disable temporarily
mv .git/hooks/pre-commit .git/hooks/pre-commit.disabled
```

---

## 🎨 Customize Validation

### Adjust ESLint Warnings

Edit `.github/hooks/pre-commit`:

```bash
# Find this line:
if echo "$STAGED_JS_FILES" | xargs npx eslint --max-warnings 10; then

# Change to:
if echo "$STAGED_JS_FILES" | xargs npx eslint --max-warnings 0; then  # No warnings allowed
# or
if echo "$STAGED_JS_FILES" | xargs npx eslint --max-warnings 50; then  # More lenient
```

### Skip Specific Checks

Comment out sections you don't want:

```bash
# In .github/hooks/pre-commit

# Skip ESLint check
# if [ -d "node_modules" ] && [ -n "$STAGED_JS_FILES" ]; then
#   ... (comment out entire ESLint section)
# fi
```

### Add Custom Checks

Add your own validation at the end:

```bash
# In .github/hooks/pre-commit, before final result

# Custom check example
echo "Running custom validation..."
if ! ./my-custom-script.sh; then
  echo "❌ Custom check failed"
  FAILED=1
fi
```

---

## 🐛 Troubleshooting

### Hook Doesn't Run

**Symptom:** Commits go through without validation

**Fix:**
```bash
# Reinstall
./.github/hooks/install.sh

# Check permissions
chmod +x .git/hooks/pre-commit

# Verify it exists
ls -la .git/hooks/pre-commit
```

### Permission Denied Error

**Symptom:** `Permission denied: .git/hooks/pre-commit`

**Fix:**
```bash
chmod +x .git/hooks/pre-commit
```

### ESLint Not Found

**Symptom:** `npx: command not found` or `eslint: not found`

**Fix:**
```bash
# Install dependencies
npm install

# Or skip ESLint check
git commit --no-verify -m "message"
```

### Hook Runs Too Slow

**Symptom:** Commit takes several seconds

**Causes:**
- Large number of files staged
- Slow ESLint on big files

**Fixes:**
```bash
# Commit in smaller chunks
git add file1.js
git commit -m "message"

# Or skip for large commits
git commit --no-verify -m "message"
```

### jq Command Not Found

**Symptom:** `jq: command not found`

**Fix:**
```bash
# macOS
brew install jq

# Ubuntu/Debian
sudo apt-get install jq

# Or skip manifest check temporarily
git commit --no-verify -m "message"
```

---

## 📊 What's Different from GitHub Actions?

| Check | Pre-Commit Hook | GitHub Actions |
|-------|-----------------|----------------|
| **When** | Before local commit | After push/PR |
| **Speed** | Very fast (staged files only) | Slower (full validation) |
| **Scope** | Staged files only | All files |
| **Icon check** | ❌ No | ✅ Yes (dimensions) |
| **Package creation** | ❌ No | ✅ Yes (.zip) |
| **Can skip** | ✅ Yes (--no-verify) | ❌ No |
| **Requires** | Local git hook | Push to GitHub |

**Best practice:** Use both!
- Pre-commit → Catch issues early (local)
- GitHub Actions → Full validation (CI/CD)

---

## 💡 Tips

### Speed Up Commits

Only stage files you're committing:

```bash
# Good: Only validates changed files
git add popup.js
git commit -m "fix: update popup"

# Avoid: Validates all files
git add .
git commit -m "fix: update popup"
```

### Commit Message Format

Follow conventional commits for better changelogs:

```bash
feat: add new feature
fix: resolve bug
docs: update documentation
style: formatting changes
refactor: code restructure
test: add tests
chore: maintenance tasks
ci: workflow changes
```

### Team Setup

Add to your README:

```markdown
## Developer Setup

After cloning, install the pre-commit hook:

\`\`\`bash
./.github/hooks/install.sh
\`\`\`

This ensures all commits pass validation before pushing.
```

---

## 🚀 Quick Commands

```bash
# Install hook
./.github/hooks/install.sh

# Commit normally (runs validation)
git commit -m "feat: add feature"

# Skip validation once
git commit --no-verify -m "wip: work in progress"

# Test hook without committing
./.github/hooks/pre-commit

# Uninstall hook
rm .git/hooks/pre-commit

# Auto-fix linting issues before committing
npm run lint:fix
git add .
git commit -m "style: fix linting issues"
```

---

## 📚 Related

- [Local Validation Script](../.github/scripts/validate-local.sh) - Full validation (all files)
- [GitHub Actions](GITHUB_ACTIONS_SETUP.md) - CI/CD workflows
- [Quick Reference](QUICK_REFERENCE.md) - Common commands

---

## 🎯 Summary

**Install once:**
```bash
./.github/hooks/install.sh
```

**Benefits:**
- ✅ Catch errors before committing
- ✅ No broken commits in history
- ✅ Faster than waiting for CI/CD
- ✅ Works offline
- ✅ No dependencies needed
- ✅ Runs in ~1-2 seconds

**Skip when needed:**
```bash
git commit --no-verify -m "message"
```

---

**Last Updated:** 2026-06-24
