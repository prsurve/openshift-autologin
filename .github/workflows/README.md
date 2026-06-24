# GitHub Actions Workflows

This directory contains automated CI/CD workflows for the OpenShift Auto-Login extension.

## 🔄 Workflows

### [`validate.yml`](./validate.yml)
**Main validation workflow** - Runs on every push and PR

**Checks:**
1. ✅ **Manifest Validation** - JSON syntax, required fields, version format, icon paths
2. 🖼️ **Icon Dimensions** - Validates all icon files are correct size
3. 🔍 **JavaScript Linting** - ESLint code quality checks
4. 📦 **Build Validation** - File structure, size limits, package creation
5. 🔒 **Security Scanning** - Secrets detection, permission audit, XSS checks

**Outputs:**
- Extension package artifact (`extension.zip`)
- Validation summary in workflow run

---

### [`pr-validation.yml`](./pr-validation.yml)
**Pull request checks** - Runs on PR events

**Checks:**
- PR title format (conventional commits)
- Version bump detection
- Full validation suite
- Automated PR comment with results

---

### [`release.yml`](./release.yml)
**Release automation** - Triggers on version tags (`v*`)

**Process:**
1. Extracts version from tag (e.g., `v3.1.0`)
2. Verifies tag matches `manifest.json` version
3. Creates release package
4. Generates changelog from commits
5. Creates GitHub Release with artifacts

**To create a release:**
```bash
# 1. Update version in manifest.json
vim manifest.json  # Set "version": "3.2.0"

# 2. Commit changes
git add manifest.json README.md
git commit -m "Release v3.2.0: Add new features"

# 3. Create and push tag
git tag v3.2.0
git push origin main
git push origin v3.2.0
```

---

## 📖 Documentation

See [**WORKFLOWS.md**](../../docs/WORKFLOWS.md) for complete documentation including:
- Detailed workflow descriptions
- Local validation commands
- Troubleshooting guide
- Best practices
- Customization options

---

## 🚦 Workflow Status

Check workflow runs: [Actions Tab](../../actions)

Add status badges to README:
```markdown
![Validation](https://github.com/prsurve/openshift-autologin/workflows/Extension%20Validation/badge.svg)
```

---

## 🛠️ Local Development

Run validation locally before pushing:

```bash
# Install dependencies
npm install

# Lint JavaScript
npm run lint

# Validate manifest
npm run validate:manifest

# Create package
npm run package
```

---

**Questions?** See [WORKFLOWS.md](../WORKFLOWS.md) for full documentation.
