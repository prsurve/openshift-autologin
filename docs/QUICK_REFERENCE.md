# GitHub Actions Quick Reference Card

## 🚀 Common Commands

### Local Testing
```bash
# Full validation (mimics GitHub Actions)
./.github/scripts/validate-local.sh

# Lint JavaScript
npm run lint

# Auto-fix linting issues
npm run lint:fix

# Validate manifest only
npm run validate:manifest

# Create package
npm run package
```

### Git Workflow
```bash
# Create feature branch
git checkout -b feature/my-feature

# Make changes and validate
./.github/scripts/validate-local.sh

# Commit (conventional format)
git commit -m "feat: add new feature"

# Push (triggers validation)
git push origin feature/my-feature

# Create PR
gh pr create --fill
```

### Release Process
```bash
# 1. Update version
vim manifest.json  # Change to "version": "3.2.0"

# 2. Update changelog
vim README.md

# 3. Commit
git add manifest.json README.md
git commit -m "Release v3.2.0: Description"

# 4. Push to main
git push origin main

# 5. Create tag
git tag v3.2.0
git push origin v3.2.0

# ✨ GitHub Actions creates release automatically!
```

---

## 🏷️ Conventional Commit Types

```
feat:     New feature
fix:      Bug fix
docs:     Documentation only
style:    Formatting, missing semicolons, etc.
refactor: Code restructure without behavior change
test:     Adding tests
chore:    Maintenance tasks
ci:       CI/CD changes
```

**Examples:**
```bash
git commit -m "feat(jenkins): add timeout handling"
git commit -m "fix: resolve icon dimension issue"
git commit -m "docs: update installation guide"
git commit -m "ci: update ESLint config"
```

---

## 📋 Workflow Triggers

| Workflow | Trigger |
|----------|---------|
| `validate.yml` | Push to `main`/`ci`, PR to `main` |
| `pr-validation.yml` | PR opened/updated |
| `release.yml` | Tag push (`v*`) |

---

## 🔍 Viewing Results

### Check Workflow Status
```bash
# Via web
open https://github.com/prsurve/openshift-autologin/actions

# Via CLI (requires gh)
gh run list
gh run view --log
```

### Download Artifacts
```bash
# Web: Actions → Workflow Run → Artifacts section

# CLI
gh run download <run-id>
```

---

## 🐛 Quick Fixes

### ESLint Errors
```bash
npm run lint:fix
git add *.js
git commit -m "style: fix linting issues"
```

### Wrong Icon Dimensions
```bash
brew install imagemagick
convert icon.png -resize 16x16 icon16.png
convert icon.png -resize 32x32 icon32.png
convert icon.png -resize 48x48 icon48.png
convert icon.png -resize 128x128 icon128.png
```

### Version Mismatch
```bash
# manifest.json version must match tag
vim manifest.json  # Update version
git commit -am "chore: bump version"
git tag -f v3.2.0
git push --force-with-lease
git push origin v3.2.0 --force
```

### Skip CI on Commit
```bash
git commit -m "docs: update README [skip ci]"
```

---

## 📦 Package Info

### Check Package Size
```bash
npm run package
ls -lh extension.zip
```

### View Package Contents
```bash
unzip -l extension.zip
```

---

## 🔒 Security Checks

The workflows scan for:
- ❌ Hardcoded passwords/API keys
- ❌ `eval()` usage (fails build)
- ⚠️  `innerHTML` usage (warns)
- ⚠️  Sensitive permissions

**Fix hardcoded secrets:**
```bash
# Bad
const password = "my-secret-password";

# Good
chrome.storage.local.get(['password'], (result) => {
  const password = result.password;
});
```

---

## 📊 Status Badges

Add to README.md:
```markdown
![Validation](https://github.com/prsurve/openshift-autologin/workflows/Extension%20Validation/badge.svg)
![Release](https://github.com/prsurve/openshift-autologin/workflows/Create%20Release/badge.svg)
```

---

## 🔗 Quick Links

- [Full Setup Guide](GITHUB_ACTIONS_SETUP.md)
- [Technical Reference](WORKFLOWS.md)
- [Workflow Files](../.github/workflows/)
- [Local Validation Script](../.github/scripts/validate-local.sh)

---

## 💡 Pro Tips

1. **Run validation locally before pushing** to catch issues early
2. **Use conventional commits** for better changelogs
3. **Enable branch protection** to require passing checks
4. **Download artifacts** for quick distribution testing
5. **Check workflow logs** when builds fail

---

**Last Updated:** 2026-06-24
