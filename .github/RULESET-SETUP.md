# GitHub Ruleset Setup Guide

This guide will help you configure tag protection rules that allow GitHub Actions to create/delete release tags.

## 📋 Quick Import

### Step 1: Import the Ruleset

1. Go to your repository settings:
   ```
   https://github.com/prsurve/openshift-autologin/settings/rules
   ```

2. Click **"New ruleset"** → **"Import a ruleset"**

3. Upload the file: `.github/tag-protection-ruleset.json`

4. The ruleset will be imported with the name **"Release Tag Protection"**

---

### Step 2: Add Bypass Permissions for GitHub Actions

After importing, you need to allow GitHub Actions to bypass the tag restrictions:

1. Click on the **"Release Tag Protection"** ruleset you just imported

2. Scroll to the **"Bypass list"** section

3. Click **"Add bypass"**

4. Select one of these options:
   - **Option A (Recommended)**: Select **"GitHub Apps"** → Find and select **"GitHub Actions"**
   - **Option B**: Select **"Repository roles"** → Choose **"Maintain"** or **"Admin"**

5. Set bypass mode to **"Always"**

6. Click **"Save changes"**

---

## 🎯 What This Ruleset Does

- ✅ **Protects all `v*` tags** from unauthorized deletion/modification
- ✅ **Allows GitHub Actions** to create/delete tags (after you add bypass)
- ✅ **Maintains security** while enabling automated releases
- ❌ **Blocks manual tag deletion** (unless you have admin/maintain role)

---

## 🧪 Test the Configuration

After setup, test the workflow:

```bash
# Create and push a test tag
git tag v2.3-test -m "Test release"
git push origin v2.3-test
```

The workflow should:
1. Automatically trigger on tag push
2. Package the extension
3. Create a GitHub release with the zip file

---

## 🔧 Manual Configuration (Alternative)

If import doesn't work, create manually:

1. Go to: https://github.com/prsurve/openshift-autologin/settings/rules
2. Click **"New ruleset"** → **"New tag ruleset"**
3. Configure:
   - **Name**: Release Tag Protection
   - **Enforcement status**: Active
   - **Target tags**: `v*`
   - **Rules**:
     - ☑️ Restrict creations
     - ☑️ Restrict updates
     - ☑️ Restrict deletions
   - **Bypass list**: Add GitHub Actions
4. Click **"Create"**

---

## 🛠️ Troubleshooting

### Issue: "Cannot create ref due to creations being restricted"

**Solution**: Make sure you added GitHub Actions to the bypass list in Step 2 above.

### Issue: "Cannot delete this tag"

**Solution**: This is expected for protected tags. Either:
- Delete the release first via GitHub web UI
- Or use a different tag name for testing

### Issue: Manual workflow triggers fail

**Solution**: With tag protection enabled:
- Create the tag manually first: `git tag v2.3 && git push origin v2.3`
- Then the workflow can create the release from the existing tag
- Or ensure GitHub Actions has bypass permissions

---

## 📖 Related Files

- **Workflow file**: `.github/workflows/release.yml`
- **Ruleset config**: `.github/tag-protection-ruleset.json`

---

## ✅ Verification Checklist

After setup, verify:

- [ ] Ruleset imported and active
- [ ] GitHub Actions added to bypass list
- [ ] Test tag push triggers workflow successfully
- [ ] Release is created automatically
- [ ] Zip file is attached to release
- [ ] Manual workflow trigger works (optional)
