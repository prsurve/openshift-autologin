# OpenShift Auto-Login Documentation

This directory contains detailed documentation for developers and contributors.

## 📚 Documentation Index

### [Quick Reference Card](QUICK_REFERENCE.md) ⭐
One-page cheat sheet for common tasks:
- Local testing commands
- Git workflow
- Release process
- Conventional commits
- Quick fixes

### [GitHub Actions Setup](GITHUB_ACTIONS_SETUP.md)
Complete guide to the automated CI/CD workflows:
- What was created and why
- Quick start guide
- Creating releases
- Troubleshooting
- Next steps

### [Workflows Reference](WORKFLOWS.md)
Detailed technical reference for GitHub Actions workflows:
- Workflow descriptions
- Local validation commands
- Customization options
- Best practices
- Security considerations

### [Release Workflows](RELEASE_WORKFLOWS.md) 🎯
Compare 3 different release workflow options:
- Tag-based (default) - Production releases
- Manual - Release from any branch/PR
- PR merge - Fully automated on merge

### [Pre-Commit Hooks](PRE_COMMIT_SETUP.md) 🔒
Automatically validate code before every commit:
- Simple Git hook (lightweight, no dependencies)
- Husky + lint-staged (team-friendly, auto-install)
- Choose the option that fits your workflow

---

## 🚀 Quick Links

### For Contributors
- [GitHub Actions Setup](GITHUB_ACTIONS_SETUP.md) - Start here
- [Local Validation Script](../.github/scripts/validate-local.sh) - Test before pushing

### For Maintainers
- [Workflows Reference](WORKFLOWS.md) - Complete technical docs
- [Workflow Files](../.github/workflows/) - Actual workflow YAML files
- [Release Process](GITHUB_ACTIONS_SETUP.md#-creating-releases) - How to create releases

### For Users
- [Main README](../README.md) - Extension features and usage
- [Installation Guide](../README.md#-installation) - How to install the extension

---

## 🔧 Development Workflow

```bash
# 1. Make changes to code
vim popup.js

# 2. Validate locally
./.github/scripts/validate-local.sh

# 3. Lint and fix
npm run lint:fix

# 4. Commit and push
git add .
git commit -m "feat: add new feature"
git push origin feature-branch

# 5. Create PR
gh pr create --fill
```

Automated validation runs on every push and PR!

---

## 📦 Creating a Release

```bash
# 1. Update version in manifest.json
vim manifest.json  # Change to "version": "3.2.0"

# 2. Update README with release notes
vim README.md

# 3. Commit
git add manifest.json README.md
git commit -m "Release v3.2.0: Description"
git push origin main

# 4. Tag and push
git tag v3.2.0
git push origin v3.2.0

# GitHub Actions automatically creates the release!
```

See [GitHub Actions Setup](GITHUB_ACTIONS_SETUP.md#-creating-releases) for details.

---

## 🐛 Troubleshooting

Common issues and solutions:

| Issue | Solution |
|-------|----------|
| ESLint errors | Run `npm run lint:fix` |
| Icon validation fails | Check dimensions with `identify icon*.png` |
| Version mismatch | Ensure `manifest.json` matches git tag |
| Package too large | Exclude unnecessary files in workflow |

Full troubleshooting guide: [GITHUB_ACTIONS_SETUP.md](GITHUB_ACTIONS_SETUP.md#-troubleshooting)

---

## 📖 Additional Resources

- [Chrome Extension Docs](https://developer.chrome.com/docs/extensions/mv3/)
- [Manifest V3 Migration](https://developer.chrome.com/docs/extensions/mv3/intro/)
- [ESLint Rules](https://eslint.org/docs/rules/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Semantic Versioning](https://semver.org/)

---

**Last Updated:** 2026-06-24
