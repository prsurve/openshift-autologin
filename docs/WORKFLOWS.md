# GitHub Actions Workflows Reference

> **Note:** For a quick start guide, see [GitHub Actions Setup](GITHUB_ACTIONS_SETUP.md)

This document provides detailed technical reference for the automated validation and release workflows for the OpenShift Auto-Login Chrome extension.

## 📋 Available Workflows

### 1. Extension Validation (`validate.yml`)

**Triggers:**
- Push to `main` or `ci` branches
- Pull requests to `main` branch

**What it does:**

#### ✅ Manifest Validation
- Validates `manifest.json` syntax (valid JSON)
- Checks required fields: `manifest_version`, `name`, `version`, `description`
- Ensures manifest version is 3 (Manifest V3)
- Validates semantic versioning format (e.g., `3.1.0`)
- Verifies all icon files referenced in manifest exist

#### 🖼️ Icon Validation
- Checks icon file dimensions:
  - `icon16.png` → 16×16 pixels
  - `icon32.png` → 32×32 pixels
  - `icon48.png` → 48×48 pixels
  - `icon128.png` → 128×128 pixels

#### 🔍 JavaScript Linting
- Runs ESLint on all `.js` files
- Checks for syntax errors and code quality issues
- Enforces coding standards:
  - No undefined variables
  - Semicolons required
  - Single quotes preferred
  - Chrome API globals recognized
- Allows up to 50 warnings (errors still fail)

#### 📦 Build Validation
- Verifies required files exist:
  - `manifest.json`
  - `popup.html`, `popup.js`
  - `content.js`
  - `background.js`
- Checks file sizes (max 5MB per file)
- Creates distribution package (`extension.zip`)
- Validates total package size (< 100MB for Chrome Web Store)

#### 🔒 Security Scanning

**Hardcoded Secrets Detection:**
- Scans for potential hardcoded passwords, API keys, tokens
- Warns if suspicious patterns found

**Permission Audit:**
- Lists all Chrome extension permissions
- Warns about sensitive permissions:
  - `cookies`
  - `browsingData`
  - `history`
  - `management`
  - `webRequest`

**XSS Vulnerability Scan:**
- Checks for dangerous patterns:
  - `innerHTML` usage (warns to sanitize)
  - `document.write` (potential XSS)
  - `eval()` (fails build - security risk)

**Artifacts:**
- Uploads `extension.zip` package (30 day retention)
- Creates workflow summary with validation results

---

### 2. PR Validation (`pr-validation.yml`)

**Triggers:**
- Pull request opened, synchronized, or reopened

**What it does:**
- Checks PR title format (conventional commits recommended)
- Detects version bumps in `manifest.json`
- Runs full validation suite
- Posts automated comment on PR with results

**PR Title Format (recommended):**
```
feat: add new feature
fix: resolve bug
docs: update documentation
style: formatting changes
refactor: code restructure
test: add tests
chore: maintenance tasks
ci: workflow changes
```

---

### 3. Release Automation (`release.yml`)

**Triggers:**
- Git tag push matching `v*` (e.g., `v3.1.0`)

**What it does:**
- Extracts version from tag
- Verifies tag version matches `manifest.json` version
- Creates release package: `openshift-autologin-v{version}.zip`
- Generates changelog from commits since last tag
- Creates GitHub Release with:
  - Packaged extension zip
  - Auto-generated changelog
  - Release notes

**How to create a release:**

1. Update version in `manifest.json`:
   ```json
   "version": "3.2.0"
   ```

2. Update README.md with release notes

3. Commit changes:
   ```bash
   git add manifest.json README.md
   git commit -m "Release v3.2.0: Feature description"
   ```

4. Create and push tag:
   ```bash
   git tag v3.2.0
   git push origin main
   git push origin v3.2.0
   ```

5. GitHub Actions automatically creates the release

---

## 🚀 Quick Start

### First Time Setup

1. **No setup required!** Workflows run automatically on:
   - Every push to `main` or `ci` branches
   - Every pull request to `main`
   - Every version tag push

2. **View workflow runs:**
   - Go to: `https://github.com/prsurve/openshift-autologin/actions`
   - Check status of recent runs
   - Download artifacts (extension packages)

### Running Validation Locally

You can run similar checks locally before pushing:

#### Validate Manifest
```bash
# Check JSON syntax
jq empty manifest.json

# Extract version
jq -r '.version' manifest.json
```

#### Run ESLint
```bash
# Install dependencies
npm install

# Run linting
npx eslint *.js
```

#### Check Icon Sizes
```bash
# Requires ImageMagick
brew install imagemagick

# Check dimensions
identify icon16.png icon32.png icon48.png icon128.png
```

#### Create Package
```bash
zip -r extension.zip \
  manifest.json \
  popup.html popup.js \
  content.js \
  background.js \
  icon*.png \
  README.md
```

---

## 📊 Workflow Status Badges

Add these badges to README.md:

```markdown
![Validation](https://github.com/prsurve/openshift-autologin/workflows/Extension%20Validation/badge.svg)
![Release](https://github.com/prsurve/openshift-autologin/workflows/Create%20Release/badge.svg)
```

---

## 🔧 Customization

### Adjust ESLint Rules

Edit [`.eslintrc.json`](.eslintrc.json):

```json
{
  "rules": {
    "no-unused-vars": "error",  // Change from "warn" to "error"
    "semi": ["error", "always"]
  }
}
```

### Change Security Scan Sensitivity

Edit `.github/workflows/validate.yml`:

```yaml
# Fail on innerHTML instead of warn
if grep -rn "innerHTML\s*=" *.js 2>/dev/null; then
  echo "❌ Found innerHTML usage"
  exit 1  # Add this line
fi
```

### Modify File Size Limits

```yaml
# Change from 5MB to 10MB
MAX_SIZE_MB=10
```

---

## 🐛 Troubleshooting

### Workflow Fails on Icon Validation

**Symptom:** `❌ icon16.png has wrong dimensions`

**Solution:**
- Resize icons to exact dimensions:
  ```bash
  # Using ImageMagick
  convert icon.png -resize 16x16 icon16.png
  convert icon.png -resize 32x32 icon32.png
  convert icon.png -resize 48x48 icon48.png
  convert icon.png -resize 128x128 icon128.png
  ```

### ESLint Errors

**Symptom:** `❌ ESLint found errors`

**Solution:**
- Fix errors locally first:
  ```bash
  npx eslint *.js --fix
  ```
- Or adjust rules in `.eslintrc.json`

### Version Mismatch on Release

**Symptom:** `❌ Version mismatch! manifest.json: 3.1.0 Git tag: v3.2.0`

**Solution:**
- Ensure `manifest.json` version matches tag:
  ```bash
  # Update manifest
  jq '.version = "3.2.0"' manifest.json > tmp.json
  mv tmp.json manifest.json

  # Commit and re-tag
  git add manifest.json
  git commit --amend --no-edit
  git tag -f v3.2.0
  git push origin main --force-with-lease
  git push origin v3.2.0 --force
  ```

### Package Too Large

**Symptom:** `❌ Package too large for Chrome Web Store: 105MB`

**Solution:**
- Check what's being included:
  ```bash
  unzip -l extension.zip
  ```
- Exclude large files in `validate.yml`:
  ```yaml
  zip -r extension.zip ... -x "*.git*" "node_modules/*" "large-file.bin"
  ```

---

## 📈 Best Practices

### Before Creating PR
1. Run ESLint locally: `npx eslint *.js`
2. Test extension in Chrome (Load unpacked)
3. Update README if adding features
4. Follow conventional commit format in PR title

### Before Release
1. Bump version in `manifest.json`
2. Update README with version notes
3. Test full extension functionality
4. Create tag matching manifest version

### Security
1. Never commit credentials or API keys
2. Review security warnings from workflow
3. Keep permissions minimal
4. Sanitize all dynamic HTML content

---

## 📚 Additional Resources

- [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/mv3/intro/)
- [ESLint Rules](https://eslint.org/docs/rules/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Semantic Versioning](https://semver.org/)

---

**Last Updated:** 2026-06-24
**Workflows Version:** 1.0.0
