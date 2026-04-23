# OpenShift Auto-Login v2.3.4 Release Notes

**Release Date:** April 24, 2026  
**Version:** 2.3.4  
**Branch:** fix_client_login_issue

---

## 🎯 What's New

### HCP Cluster Protection
This release introduces critical protection against credential misuse when accessing HCP (Hosted Control Plane) clusters.

**The Problem:**
- When accessing an unsaved HCP cluster (e.g., `f10-c1`), the extension would fall back to matching a similar base cluster (e.g., `f10`)
- This caused the wrong credentials to be used, resulting in authentication failures
- The authentication error would then disable auto-login for the wrong cluster

**The Solution:**
- Smart OAuth redirect_uri parsing identifies the exact cluster being accessed
- Apps domain matching ensures correct cluster identification for nested domains
- Auto-login is blocked entirely when the target cluster isn't saved, preventing credential misuse
- Helpful warning banner guides users to add the missing cluster

---

## ✨ Features

### 👁️ Password Show/Hide (Continued from v2.3.3)
- **Toggle Visibility** - Eye icon button on each cluster card to view saved credentials
- **Add/Edit Forms** - Password visibility toggle in cluster forms
- **Credentials Modal** - Dedicated modal to view and copy username/password
- **Quick Copy** - Copy credentials with visual confirmation feedback

### 🛡️ Smart Credential Matching
- **OAuth redirect_uri Analysis** - Extracts cluster identity from OAuth callback URLs
- **Apps Domain Extraction** - Correctly parses nested domains like `apps.f10-c1.apps.f10l040.fusion.tadn.ibm.com`
- **Exact Cluster Matching** - Matches clusters by their complete apps domain, not just hostname
- **Maximum Specificity Priority** - Matched cluster from redirect_uri gets highest priority (30000) to always win

### ⚠️ Missing Cluster Detection
- **Visual Warning Banner** - Orange banner appears when accessing unsaved cluster
- **Cluster Name Extraction** - Automatically extracts readable cluster name from apps domain
- **Clear Guidance** - Banner directs users to add the cluster in the extension popup
- **Session-Based Blocking** - Prevents retry loops by blocking auto-login for the entire session

### 🔒 Fallback Prevention
- **No Partial Matches** - Won't use `f10` credentials for `f10-c1` access attempts
- **Explicit Blocking** - Sets `os-autologin-blocked-missing-cluster` sessionStorage flag
- **Safe by Default** - Better to show manual login than use wrong credentials

### 📊 Enhanced Debug Logging
- **All Clusters Dump** - Logs all saved clusters with their URLs and apps domains
- **Match Status** - Shows which cluster matched and why (or why not)
- **Apps Domain Visibility** - Clear logging of extracted apps domains for troubleshooting
- **Step-by-Step Tracking** - Detailed logging through the entire matching process

---

## 🔧 Technical Changes

### Modified Files
- **content.js** - Added redirect_uri parsing, apps domain matching, missing cluster detection
- **manifest.json** - Updated version to 2.3.4
- **popup.js** - Updated version in all export functions
- **README.md** - Added v2.3.4 features and updated version badge

### New Functions
- `showMissingClusterBanner(appsDomain)` - Displays warning banner for unsaved clusters

### Key Code Changes
```javascript
// Extract apps domain from redirect_uri
const redirectParts = redirectHost.split(".");
const redirectAppsIndex = redirectParts.findIndex(p => p === "apps");
const redirectAppsDomain = redirectAppsIndex >= 0 ? 
  redirectParts.slice(redirectAppsIndex).join(".") : null;

// Match by apps domain, not hostname
const matchingCluster = clusters.find(c => {
  const clusterAppsDomain = /* extract from c.url */;
  return clusterAppsDomain === redirectAppsDomain;
});

// Block auto-login if cluster not found
if (!matchingCluster) {
  sessionStorage.setItem("os-autologin-blocked-missing-cluster", redirectAppsDomain);
}
```

---

## 🐛 Bug Fixes

### Fixed: Wrong Cluster Disabled on HCP Login Failure
**Issue:** When attempting to access an unsaved HCP cluster (e.g., `f10-c1`), the extension would:
1. Extract correct redirect_uri: `console-openshift-console.apps.f10-c1.apps.f10l040.fusion.tadn.ibm.com`
2. Fail to find matching cluster in storage
3. Fall back to apps domain matching, incorrectly matching base `f10` cluster
4. Use `f10` credentials for `f10-c1` login
5. Authentication fails (wrong credentials)
6. Disable auto-login for `f10` instead of `f10-c1`

**Root Cause:** Previous code compared full hostname (`console-openshift-console.apps.f10-c1...`) against cluster URL hostname, which would be API server hostname (`api.f10-c1...`), so the match failed.

**Fix:** Now extracts and compares apps domains (`apps.f10-c1.apps.f10l040.fusion.tadn.ibm.com`) which are consistent across console URLs, API URLs, and OAuth URLs.

**Result:** 
- ✅ Correct cluster identified from redirect_uri
- ✅ Missing cluster detection prevents wrong credential usage
- ✅ Helpful banner guides user to add the cluster
- ✅ No incorrect cluster disabling

---

## 📦 Installation

### Chrome Web Store
Extension is available for manual installation.

### Manual Installation
1. Download or clone this repository
2. Open Chrome → Extensions → Developer mode ON
3. Click "Load unpacked" → Select extension directory
4. Extension icon appears in toolbar

---

## 🚀 Usage

### Adding HCP Clusters
When you see the warning banner "Cluster Not Found":
1. Click the extension icon
2. Click "+ Add Cluster"
3. Enter cluster details:
   - **Name:** e.g., `f10-c1`
   - **URL:** e.g., `https://console-openshift-console.apps.f10-c1.apps.f10l040.fusion.tadn.ibm.com`
   - **Username:** your username
   - **Password:** your password
4. Save and auto-login will work on next visit

### Viewing Debug Logs
To troubleshoot cluster matching:
1. Open browser DevTools (F12)
2. Navigate to Console tab
3. Look for `[Auto-Login Content]` messages
4. Check "All clusters:" dump to verify your clusters
5. Verify "Redirect apps domain:" matches a saved cluster

---

## 🔄 Upgrade Notes

### From v2.3.3
- No breaking changes
- Automatic upgrade - just reload extension
- Existing clusters work without modification
- New protection applies immediately

### Recommended Actions
1. Review your saved clusters
2. Identify any HCP clusters you access
3. Ensure HCP clusters are saved separately from base clusters
4. Example: If you access both `f10` and `f10-c1`, save both

---

## 🧪 Testing Scenarios

### Scenario 1: Access Saved HCP Cluster
- Navigate to `https://console-openshift-console.apps.f10-c1.apps.f10l040.fusion.tadn.ibm.com`
- **Expected:** Auto-login with f10-c1 credentials
- **Result:** ✅ Logged in successfully

### Scenario 2: Access Unsaved HCP Cluster
- Navigate to `https://console-openshift-console.apps.f10-c2.apps.f10l040.fusion.tadn.ibm.com`
- **Expected:** Warning banner, no auto-login attempt
- **Result:** ✅ Shows "Cluster Not Found: f10-c2" banner

### Scenario 3: Multiple HCP Clusters
- Have `f10`, `f10-c1`, `f10-c2` all saved
- Access each cluster
- **Expected:** Each uses its own credentials
- **Result:** ✅ Correct credentials for each cluster

---

## 🎓 Background: HCP Clusters

**What are HCP Clusters?**
Hosted Control Plane (HCP) clusters are OpenShift clusters where the control plane runs separately from the data plane. Multiple HCP clusters can share the same base infrastructure.

**Domain Structure:**
- Base cluster: `apps.f10l040.fusion.tadn.ibm.com`
- HCP cluster 1: `apps.f10-c1.apps.f10l040.fusion.tadn.ibm.com`
- HCP cluster 2: `apps.f10-c2.apps.f10l040.fusion.tadn.ibm.com`

**OAuth Behavior:**
When logging into HCP clusters, the OAuth redirect URL contains the full nested domain:
```
redirect_uri=https://console-openshift-console.apps.f10-c1.apps.f10l040.fusion.tadn.ibm.com/auth/callback
```

This extension now correctly parses this redirect_uri to identify the target cluster.

---

## 🙏 Credits

- **Developed by:** prsurve
- **AI Assistance:** Claude Sonnet 4.5
- **Testing:** QE team with HCP clusters
- **Issue Reporter:** User experiencing f10/f10-c1 mismatch

---

## 📝 Known Limitations

1. **Cluster Must Be Saved:** HCP clusters must be explicitly added to the extension
2. **Manual Add Required:** No automatic detection of HCP cluster relationships
3. **Session-Based Block:** Warning banner persists until page refresh or navigation

---

## 🔮 Future Enhancements

Potential improvements for future releases:
- Auto-detect HCP clusters from base cluster
- Suggest adding HCP cluster with pre-filled base credentials
- Cluster relationship mapping (base ↔ HCP)
- Import all HCP clusters from ACM/Hub cluster
- Persistent block list for known missing clusters

---

## 📧 Support

- **Issues:** https://github.com/anthropics/claude-code/issues
- **Feedback:** Report via extension popup → Help
- **Documentation:** See README.md

---

## 📜 License

MIT License - See LICENSE file for details

---

**Thank you for using OpenShift Auto-Login!** 🚀
