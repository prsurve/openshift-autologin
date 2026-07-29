# Release Notes

## v3.2.2 - Cluster Name Detection Fix

**Bug Fix:**
- 🐛 **Cluster Name Detection** - "Save Cluster" modal now correctly extracts the actual cluster name from OpenShift console URLs instead of always showing "console-openshift-console"
  - Works with standard URLs (e.g., `apps.mycluster.example.com` → `mycluster`)
  - Works with nested/HCP URLs (e.g., `apps.hcp-cluster.apps.basedomain.example.com` → `hcp-cluster`)

---

## v3.2.1 - Kubeconfig Auto-Fetch & Management

**New Features:**
- 📥 **Kubeconfig Auto-Fetch** - Automatically downloads and saves kubeconfig files during Jenkins import
- 🔗 **Dual Kubeconfig Access** - Download kubeconfig locally OR open it directly in browser from external servers
- 💾 **Persistent Storage** - Kubeconfig files saved to Chrome storage for offline access
- 🎯 **Smart Path Detection** - Automatically detects Jenkins artifacts and external URLs (HTTP/HTTPS)
- ✅ **Content Validation** - Validates kubeconfig content before saving (checks for apiVersion/kind: Config)

**Export/Import:**
- Exports now include `kubeconfigUrl` for sharing cluster configs with kubeconfig access
- Imports preserve kubeconfig URLs from shared links and JSON files

**UI Enhancements:**
- 📥 Download button on cluster cards when kubeconfig content is available
- 🔗 Open URL button to view kubeconfig in browser from external servers
- Both buttons shown when both content and URL are available

**Technical:**
- Added HTTP protocol support to manifest host_permissions for external file servers
- CORS-free fetching via background service worker
- Hybrid storage approach with content validation
- Optional feature - gracefully degrades if kubeconfig not found

---

For full documentation, see [README.md](README.md)
