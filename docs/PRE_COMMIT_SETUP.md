# Pre-Commit Hooks Setup

Automatically run validation checks before every commit to catch issues early!

## 🎯 Two Options

### Option 1: Simple Git Hook (Recommended)
**Pros:** No dependencies, fast, lightweight
**Cons:** Manual installation per developer

### Option 2: Husky + lint-staged
**Pros:** Auto-installs for all developers, more features
**Cons:** Requires npm dependencies

---

## 🚀 Option 1: Simple Git Hook (Quick Setup)

### Install

```bash
# Run the install script
./.github/hooks/install.sh
```

**What it installs:**
- Pre-commit hook at `.git/hooks/pre-commit`
- Runs automatically before every `git commit`

### What It Checks

1. ✅ **Manifest validation** - JSON syntax, version format
2. ✅ **Security scanning** - Hardcoded secrets, eval() usage
3. ✅ **ESLint** - Code quality on staged files only
4. ✅ **Commit message** - Suggests conventional format

### Manual Installation

If the script doesn't work:

```bash
# Copy hook manually
cp .github/hooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

### Uninstall

```bash
rm .git/hooks/pre-commit
```

---

## 🔧 Option 2: Husky + lint-staged (Advanced)

### Install

```bash
# Install dependencies
npm install

# Initialize Husky
npm run prepare
```

**What happens:**
- Installs Husky and lint-staged
- Creates `.husky/` directory with hooks
- Auto-runs on `npm install` for all developers

### Configuration

Already configured in `package.json`:

```json
{
  "lint-staged": {
    "*.js": ["eslint --max-warnings 10"],
    "manifest.json": ["jq empty"]
  }
}
```

### Customize

Edit `package.json` to change what runs:

```json
{
  "lint-staged": {
    "*.js": [
      "eslint --fix",           // Auto-fix issues
      "prettier --write"        // Format code
    ],
    "*.{json,md}": [
      "prettier --write"        // Format JSON/MD files
    ]
  }
}
```

---

## 📋 What Runs on Each Commit

### Option 1: Simple Hook

```bash
git commit -m "feat: add feature"

# Output:
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
✅ All pre-commit checks passed!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[main abc1234] feat: add feature
```

### Option 2: Husky

```bash
git commit -m "feat: add feature"

# Output:
✔ Preparing lint-staged...
✔ Running tasks for staged files...
  ✔ *.js — eslint --max-warnings 10
  ✔ manifest.json — jq empty
✔ Applying modifications from tasks...
✔ Cleaning up temporary files...

[main abc1234] feat: add feature
```

---

## ⚙️ Skip Hooks (When Needed)

Sometimes you need to commit without running hooks:

### Skip Once

```bash
git commit --no-verify -m "wip: work in progress"
```

### Skip Globally (Not Recommended)

```bash
# Disable hooks
git config core.hooksPath /dev/null

# Re-enable hooks
git config --unset core.hooksPath
```

---

## 🔍 Troubleshooting

### Hook Doesn't Run

**Check if installed:**
```bash
ls -la .git/hooks/pre-commit
```

**Reinstall:**
```bash
./.github/hooks/install.sh
```

### Hook Fails with Permission Error

```bash
chmod +x .git/hooks/pre-commit
```

### ESLint Not Found

```bash
npm install
```

### Hook Takes Too Long

Edit `.github/hooks/pre-commit` and comment out slow checks:

```bash
# 3. Run ESLint on staged files (if node_modules exists)
# if [ -d "node_modules" ] && [ -n "$STAGED_JS_FILES" ]; then
#   ... (comment out ESLint section)
# fi
```

---

## 🎨 Customize Checks

### Add More Checks

Edit `.github/hooks/pre-commit`:

```bash
# Add custom check
echo "Running custom validation..."
if ! ./my-custom-check.sh; then
  echo "❌ Custom check failed"
  FAILED=1
fi
```

### Change ESLint Max Warnings

```bash
# In .github/hooks/pre-commit, find:
if echo "$STAGED_JS_FILES" | xargs npx eslint --max-warnings 10; then

# Change to:
if echo "$STAGED_JS_FILES" | xargs npx eslint --max-warnings 0; then  # No warnings allowed
```

---

## 📊 Comparison

| Feature | Simple Hook | Husky + lint-staged |
|---------|-------------|---------------------|
| **Installation** | Manual | Auto with npm install |
| **Dependencies** | None | Node packages |
| **Speed** | Fast | Fast |
| **Team sharing** | Manual setup per dev | Auto for all devs |
| **Customization** | Edit shell script | Edit package.json |
| **Works offline** | ✅ Yes | ✅ Yes |
| **CI/CD integration** | ❌ No | ✅ Yes |

---

## 💡 Recommendations

### For Solo Development
**Use:** Simple Git Hook
**Why:** No dependencies, quick to set up

```bash
./.github/hooks/install.sh
```

### For Team Projects
**Use:** Husky + lint-staged
**Why:** Auto-installs for all team members

```bash
npm install
```

### For Maximum Control
**Use:** Both!
- Husky for consistent team experience
- Simple hook as fallback

---

## 🚀 Quick Start

**Fastest way to get started:**

```bash
# Install the simple hook
./.github/hooks/install.sh

# Test it
git add .
git commit -m "test: verify pre-commit hook"

# If validation fails, fix issues:
npm run lint:fix
```

---

## 📚 Related

- [Local Validation Script](../.github/scripts/validate-local.sh) - Full validation
- [GitHub Actions](GITHUB_ACTIONS_SETUP.md) - CI/CD workflows
- [Quick Reference](QUICK_REFERENCE.md) - Common commands

---

**Last Updated:** 2026-06-24
