# Workflow Permissions Reference

This document explains the permissions used in each workflow.

## 🔑 Token Permissions

All workflows use the automatic `GITHUB_TOKEN` with specific permissions.

### Why Explicit Permissions?

Since April 2023, GitHub requires explicit permissions in workflows for security.

---

## 📋 Workflow Permissions

### `validate.yml` - Extension Validation

```yaml
permissions:
  contents: read
```

**Why:**
- Only needs to read repository files
- Validates code without modifying anything
- Most restrictive/secure

**What it can do:**
- ✅ Checkout code
- ✅ Read files
- ✅ Run validation scripts

**What it cannot do:**
- ❌ Create releases
- ❌ Comment on PRs
- ❌ Push changes

---

### `pr-validation.yml` - PR Validation

```yaml
permissions:
  contents: read
  pull-requests: write
  issues: write
```

**Why:**
- Needs to read code for validation
- Needs to comment on PRs (requires both `pull-requests` and `issues`)
- PRs are technically "issues" in GitHub's API

**What it can do:**
- ✅ Checkout code
- ✅ Comment on PRs
- ✅ Update PR metadata
- ✅ Add labels (if needed)

**What it cannot do:**
- ❌ Create releases
- ❌ Push to branches

**Note:** Both `pull-requests: write` AND `issues: write` are needed because:
- `pull-requests: write` - PR-specific operations
- `issues: write` - Comment creation (PRs are issues internally)

---

### `release.yml` - Tag-Based Release

```yaml
permissions:
  contents: write
```

**Why:**
- Creates GitHub releases
- Creates/pushes git tags
- Uploads release artifacts

**What it can do:**
- ✅ Read repository
- ✅ Create releases
- ✅ Create tags
- ✅ Upload assets

**What it cannot do:**
- ❌ Comment on PRs
- ❌ Modify issues

---

### `manual-release.yml` - Manual Release

```yaml
permissions:
  contents: write
```

**Why:**
- Same as `release.yml`
- Creates releases from any branch
- User-triggered via workflow_dispatch

**What it can do:**
- ✅ Create releases from any branch
- ✅ Create tags
- ✅ Upload artifacts
- ✅ Mark as pre-release

---

### `release-on-merge.yml` - PR Merge Release

```yaml
permissions:
  contents: write
```

**Why:**
- Automatically creates release when PR merges
- Needs write access to create releases

**What it can do:**
- ✅ Create releases after PR merge
- ✅ Extract PR description for changelog
- ✅ Create tags

---

## 🔒 Security Notes

### Principle of Least Privilege

Each workflow only has the minimum permissions needed:

- **Validation** → `contents: read` (most restrictive)
- **PR Comments** → + `pull-requests: write`, `issues: write`
- **Releases** → + `contents: write`

### Fork Safety

When workflows run on forked PRs:
- External contributors' workflows run with restricted permissions
- `GITHUB_TOKEN` has read-only access for fork PRs
- This prevents malicious forks from modifying your repo

### Default Permissions

If you don't specify permissions, GitHub uses repository defaults.

**Check your defaults:**
Settings → Actions → General → Workflow permissions

**Recommended:**
- ✅ "Read repository contents and packages permissions"
- Then grant write explicitly where needed

---

## ⚠️ Troubleshooting

### Error: "Resource not accessible by integration" (403)

**Symptom:**
```
HttpError: Resource not accessible by integration
status: 403
```

**Cause:** Missing permissions

**Fix:** Add required permissions
```yaml
permissions:
  pull-requests: write
  issues: write
```

---

### Error: Can't create release

**Symptom:**
```
Error: Resource not accessible
```

**Cause:** Missing `contents: write`

**Fix:**
```yaml
permissions:
  contents: write
```

---

### Error: Can't push to repository

**Symptom:**
```
Permission denied (publickey)
```

**Cause:** Either SSH key issue OR missing permissions

**Fix:**
```yaml
permissions:
  contents: write
```

---

## 📚 References

- [GitHub Token Permissions](https://docs.github.com/en/actions/security-guides/automatic-token-authentication#permissions-for-the-github_token)
- [Workflow Permissions](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#permissions)
- [Security Hardening](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions)

---

**Last Updated:** 2026-06-24
