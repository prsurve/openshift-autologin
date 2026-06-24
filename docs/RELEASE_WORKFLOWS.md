# Release Workflow Options

You now have **3 different ways** to create releases. Choose the one that fits your workflow best.

## 📊 Comparison

| Workflow | Trigger | Best For | Safety |
|----------|---------|----------|--------|
| **Tag-based** (default) | Push git tag `v*` | Production releases, stable workflow | ✅ High - explicit tags |
| **Manual** | GitHub Actions UI | Testing, beta releases, any branch | ✅ High - manual approval |
| **PR Merge** | PR with "release" label merged | Automated release on merge | ⚠️ Medium - auto on merge |

---

## 1️⃣ Tag-Based Release (Default)

**File:** `.github/workflows/release.yml`

### ✅ Pros
- Industry standard approach
- Clear version history in git
- Prevents accidental releases
- Works offline (create tag locally)

### ❌ Cons
- Requires command-line git knowledge
- Two-step process (commit + tag)

### How to Use
```bash
# 1. Update manifest.json version
vim manifest.json  # Set "version": "3.2.0"

# 2. Commit changes
git add manifest.json
git commit -m "Release v3.2.0: Description"
git push origin main

# 3. Create and push tag
git tag v3.2.0
git push origin v3.2.0

# ✨ Release created automatically!
```

### When to Use
- ✅ Production releases
- ✅ Stable version control
- ✅ Team environments
- ✅ When you want explicit release points

---

## 2️⃣ Manual Release (New!)

**File:** `.github/workflows/manual-release.yml`

### ✅ Pros
- Create release from **any branch** (including PRs!)
- No git tags needed
- Can create pre-releases
- Great for testing
- Works from GitHub UI (no command line)

### ❌ Cons
- Manual process (not automated)
- Must remember to trigger it

### How to Use

**From GitHub UI:**
1. Go to: **Actions** → **Manual Release**
2. Click **Run workflow**
3. Select branch (can be a PR branch!)
4. Enter version (e.g., `3.2.0` or `3.2.0-beta.1`)
5. Check "pre-release" if testing
6. Click **Run workflow**

**From CLI:**
```bash
# From any branch (including PR branches!)
gh workflow run manual-release.yml \
  --field version=3.2.0-beta.1 \
  --field prerelease=true
```

### When to Use
- ✅ Testing releases from feature branches
- ✅ Beta/RC releases
- ✅ Quick releases without tags
- ✅ When you want to test before merging to main

---

## 3️⃣ Release on PR Merge (New!)

**File:** `.github/workflows/release-on-merge.yml`

### ✅ Pros
- Fully automated - no manual steps
- Release created automatically when PR merges
- Uses PR description as changelog
- Great for continuous delivery

### ❌ Cons
- Less explicit (happens automatically)
- Requires PR labels or title format
- Can't skip a release easily

### How to Use

**Option A: PR Title (Automatic)**
```
Release v3.2.0: Enhanced error handling
```
Any PR with title starting with "Release" triggers release on merge.

**Option B: PR Label (Recommended)**
1. Create PR as normal
2. Add label: `release`
3. When merged → automatic release!

**Skipping a Release:**
- Don't use "Release" in title
- Don't add "release" label
- Close PR without merging

### When to Use
- ✅ Continuous delivery workflow
- ✅ Automated release pipeline
- ✅ When you want releases on every merge
- ✅ Teams that prefer PR-based workflow

---

## 🎯 Recommended Workflow

### For Most Teams (Recommended)
Use **Tag-Based** (default) for production + **Manual** for testing:

```bash
# Testing: Manual release from feature branch
gh workflow run manual-release.yml \
  --field version=3.2.0-beta.1 \
  --field prerelease=true

# Production: Tag-based release
git tag v3.2.0
git push origin v3.2.0
```

### For Continuous Delivery
Use **PR Merge** for automation:
1. Label PR with `release`
2. Merge PR
3. Release created automatically

### For Solo Developers
Use **Manual** workflow for flexibility:
- Release from any branch
- No git tag management
- Quick and easy from GitHub UI

---

## 🔧 Configuration

### Disable Tag-Based Releases
If you only want manual/PR-based releases, disable the tag workflow:

```bash
# Rename to disable
mv .github/workflows/release.yml .github/workflows/release.yml.disabled
```

### Disable Auto-Release on PR Merge
If you only want manual control:

```bash
# Rename to disable
mv .github/workflows/release-on-merge.yml .github/workflows/release-on-merge.yml.disabled
```

### Create "release" Label
For PR-based releases, create the label:

```bash
# Via CLI
gh label create release --color "0e8a16" --description "Trigger release on merge"

# Or manually in GitHub UI:
# Settings → Labels → New label
# Name: release
# Color: green
```

---

## 📋 Workflow Details

### All Three Workflows Include:
- ✅ Version validation
- ✅ Package creation (`.zip`)
- ✅ Changelog generation
- ✅ GitHub Release creation
- ✅ Artifact upload

### Safety Checks:
- **Tag-based:** Fails if tag/manifest version mismatch
- **Manual:** Warns but continues on version mismatch
- **PR Merge:** Skips if tag already exists

---

## 🎨 Examples

### Example 1: Beta Testing
```bash
# Create beta release from feature branch
git checkout feature/new-ui
gh workflow run manual-release.yml \
  --field version=3.2.0-beta.1 \
  --field prerelease=true
```

### Example 2: Automated Release Pipeline
```bash
# 1. Create PR with release label
gh pr create --label release --title "Add dark mode"

# 2. Get approval and merge
gh pr merge --merge

# 3. Release created automatically! 🚀
```

### Example 3: Stable Release (Traditional)
```bash
# Update version
vim manifest.json

# Commit and tag
git commit -am "Release v3.2.0"
git tag v3.2.0
git push origin main v3.2.0

# Release created automatically! 🚀
```

---

## 🔍 Comparison Matrix

|  | Tag-Based | Manual | PR Merge |
|---|-----------|--------|----------|
| **Automation** | Semi-auto | Manual | Fully auto |
| **Safety** | High | High | Medium |
| **Flexibility** | Medium | Very High | Low |
| **From PRs** | ❌ No | ✅ Yes | ✅ Yes |
| **Pre-releases** | ❌ No | ✅ Yes | ❌ No |
| **Any branch** | ❌ No | ✅ Yes | ❌ No |
| **Git knowledge** | Required | Optional | Optional |
| **Team size** | Any | Solo/small | Any |
| **CI/CD** | Good | Good | Best |

---

## 📚 Next Steps

1. **Choose your primary workflow** (tag-based is already enabled)
2. **Test manual releases** if you want PR branch releases
3. **Enable PR-merge** if you want full automation
4. **Update your docs** to reflect chosen workflow

See [QUICK_REFERENCE.md](QUICK_REFERENCE.md) for command examples.

---

**Last Updated:** 2026-06-24
