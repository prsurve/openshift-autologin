# 🔴 OpenShift Auto-Login

> A powerful Chrome extension to manage and auto-login to multiple OpenShift clusters. Supports batch login, RDR grouping, drag-and-drop organization, and more.

**Perfect for:** QE teams, OpenShift administrators, and anyone managing multiple clusters across environments.

![Version](https://img.shields.io/badge/version-2.1-red)
![Manifest](https://img.shields.io/badge/manifest-v3-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Platform](https://img.shields.io/badge/platform-Chrome-yellow)

**New in v2.1:**
- 🔒 Smart SSL certificate warning detection and handling
- 🔗 Test Connection button to pre-accept certificates
- 💾 Form state persistence across tab switches
- 🔄 Enhanced OAuth login page detection and domain matching
- ⏱️ Extended timeout (45s) for manual certificate acceptance
- 🐛 Default username "kubeadmin" auto-filled on new clusters

**v2.0 Features:**
- ⚡ Login All — batch login to grouped clusters
- 🔍 Search & filter clusters in real-time
- ⋮⋮ Drag-and-drop reordering for clusters and groups
- ☑️ Bulk delete with checkboxes
- 🔙 Background tab opening for Login All
- ⏱️ Sequential vs parallel login strategies

---

## 🚀 Quick Start

1. **Install** the extension (see [Installation](#-installation))
2. **Add your first cluster**: Click 🔴 icon → **+ Add Cluster**
3. **Login**: Click **Login** next to any cluster
4. **Import multiple clusters**: Go to **📂 Import** tab → drag JSON/YAML file

For RDR setups with grouped clusters, use the `group` field to enable **⚡ Login All**.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🖥 **Multi-cluster** | Manage any number of OpenShift clusters in one place |
| 🔐 **One-click login** | Click Login — credentials are filled and submitted automatically |
| ⚡ **Login All** | Open and login to all clusters in a group with a single click |
| 📦 **RDR Grouping** | Auto-groups clusters by Jenkins job ID or custom group field |
| 🤖 **Auto-detect** | Detects OpenShift login pages and offers to fill credentials |
| 🔀 **OAuth aware** | Handles full OAuth/IDP redirect chains transparently |
| 🔒 **SSL Certificate Handling** | Detects certificate warnings and waits for manual acceptance |
| 🔗 **Test Connection** | Pre-accept certificates before saving clusters |
| 💾 **Form Auto-save** | Preserves cluster details when switching tabs or closing popup |
| 🏷 **Role badges** | Identifies Hub, Passive Hub, C1, C2 clusters with colour-coded badges |
| 🔍 **Search & Filter** | Real-time search across cluster names and URLs |
| ⋮⋮ **Drag & Drop** | Reorder clusters and groups by dragging them |
| ☑️ **Bulk Actions** | Select and delete multiple clusters at once |
| 📂 **File import** | Load clusters from JSON or YAML files — drag and drop |
| 💾 **Export** | Back up your cluster list as a JSON file (includes roles & groups) |
| ⚙️ **Configurable** | Toggle auto-login, confirmation prompts, tab behavior, and more |

---

## 🚀 Installation

This extension is not on the Chrome Web Store — install it via **Developer Mode**:

1. Clone or download this repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/openshift-autologin.git
   ```

2. Open Chrome and go to:
   ```
   chrome://extensions/
   ```

3. Enable **Developer mode** (toggle in the top-right corner).

4. Click **Load unpacked** and select the `openshift-autologin/` folder.

5. The 🔴 icon appears in your Chrome toolbar.

> **Tip:** Click the puzzle piece 🧩 icon and pin **OpenShift Auto-Login** to keep it visible.

---

## 🖥 Usage

### Manual Login

1. Click the 🔴 toolbar icon
2. Go to the **Clusters** tab
3. Click **Login** next to any cluster
4. The extension opens the console URL and fills your credentials automatically

### Login to All Clusters in a Group

When you have multiple clusters grouped together (by `group` field):
1. Click the **⚡ Login All** button on the group header
2. All clusters in the group open and login automatically
3. Configure tab opening behavior in Settings (background/foreground, parallel/sequential)

### Adding a Cluster

1. Click **+ Add Cluster**
2. Fill in the required fields:
   - **Cluster Name**: e.g. "Dev" or "Prod Hub"
   - **Console URL**: Full OpenShift console URL
   - **Username**: Defaults to "kubeadmin" — change if needed
   - **Password**: Cluster login password
3. Optional fields:
   - **Role**: Select from Active Hub, Passive Hub, Primary C1, Secondary C2 (or leave for auto-detect)
   - **Group / Jenkins Job ID**: Clusters with the same group value are grouped together
4. **(New in v2.1)** **Test Connection**: If your cluster uses a self-signed certificate:
   - Click **🔗 Test Connection (Accept Certificate)**
   - A new tab opens to the cluster URL
   - Click "Advanced" → "Proceed to [site] (unsafe)"
   - Close the tab and return to save your cluster
   - This prevents certificate warnings during auto-login
5. Click **Save Cluster**

> **Tip:** The form auto-saves your input as you type. If you switch tabs or the popup closes, your partially-entered data will be restored when you reopen it.

### Search & Filter

Type in the search box at the top to filter clusters by name or URL. The search works across both individual clusters and groups.

### Reordering Clusters

Click and drag the **⋮⋮** handle to reorder:
- **Individual clusters**: Drag to rearrange them in your list
- **Groups**: Drag entire groups to reorder them

### Bulk Delete

1. Check the boxes next to clusters you want to delete
2. Scroll to the bottom and click **🗑️ Delete X Selected**
3. Confirm the deletion

### Auto-Detect Mode

When enabled, the extension watches every page you visit. If it recognises an OpenShift login page that matches one of your saved clusters it will:
- Show a **confirmation banner** at the top of the page *(recommended)*, or
- **Fill and submit silently** with no interaction needed

Configure this in the **⚙️ Settings** tab.

---

## 🏷 Cluster Role Badges

Each cluster card displays a colour-coded role badge. The extension detects the role from the `role` field in imported files, or falls back to pattern matching on the cluster name and URL.

| Badge | Role | Detected when name/URL contains |
|---|---|---|
| 🟣 **Active Hub** | `hub` | `hub`, `active`, `acm` |
| 🔵 **Passive Hub** | `hub-passive` | `hub_1`, `hub-1`, `passive` |
| 🟢 **Primary C1** | `primary` | `c1`, `primary`, `vmware_one` |
| 🟡 **Secondary C2** | `secondary` | `c2`, `secondary`, `vmware_two` |
| ⚪ **Cluster** | `unknown` | No match found |

Hover over any badge to see a tooltip with a full description and the cluster URL.

> **For the most accurate role detection**, include a `role` field in your import file — see [File Formats](#-supported-import-file-formats) below.

---

## 📂 Supported Import File Formats

Click the **📂 Import** tab, then drag and drop a file onto the drop zone — or click **Browse File**.

### JSON *(recommended)*

```json
[
  {
    "name": "mycluster-hub",
    "url": "https://console-openshift-console.apps.mycluster-hub.example.com",
    "user": "kubeadmin",
    "password": "xxxxx-xxxxx-xxxxx",
    "role": "hub",
    "group": "jenkins-job-12345"
  },
  {
    "name": "mycluster-c1",
    "url": "https://console-openshift-console.apps.mycluster-c1.example.com",
    "user": "kubeadmin",
    "password": "xxxxx-xxxxx-xxxxx",
    "role": "primary",
    "group": "jenkins-job-12345"
  },
  {
    "name": "mycluster-c2",
    "url": "https://console-openshift-console.apps.mycluster-c2.example.com",
    "user": "kubeadmin",
    "password": "xxxxx-xxxxx-xxxxx",
    "role": "secondary",
    "group": "jenkins-job-12345"
  }
]
```

### YAML

```yaml
clusters:
  - name: "mycluster-hub"
    url: "https://console-openshift-console.apps.mycluster-hub.example.com"
    user: "kubeadmin"
    password: "xxxxx-xxxxx-xxxxx"
    role: "hub"
    group: "jenkins-job-12345"

  - name: "mycluster-c1"
    url: "https://console-openshift-console.apps.mycluster-c1.example.com"
    user: "kubeadmin"
    password: "xxxxx-xxxxx-xxxxx"
    role: "primary"
    group: "jenkins-job-12345"

  - name: "mycluster-c2"
    url: "https://console-openshift-console.apps.mycluster-c2.example.com"
    user: "kubeadmin"
    password: "xxxxx-xxxxx-xxxxx"
    role: "secondary"
    group: "jenkins-job-12345"
```

### Field Reference

| Field | Required | Description | Example |
|---|---|---|---|
| `name` | ✅ Yes | Display name for the cluster | `"Production Hub"` |
| `url` | ✅ Yes | Full OpenShift console URL | `"https://console-openshift-console.apps..."` |
| `user` | ✅ Yes | Login username | `"kubeadmin"` |
| `password` | ✅ Yes | Login password | `"xxxxx-xxxxx-xxxxx"` |
| `role` | ⚪ Optional | Cluster role (see valid values below) | `"hub"` |
| `group` | ⚪ Optional | Group identifier (clusters with same value are grouped) | `"jenkins-job-12345"` |

### Valid `role` values

| Value | Meaning |
|---|---|
| `hub` | Active ACM Hub |
| `hub-passive` | Passive ACM Hub (DR standby) |
| `primary` | Primary managed cluster (C1) |
| `secondary` | Secondary managed cluster (C2) |
| `unknown` | Role not specified |

> **Note:** Both `role` and `group` fields are optional. If `role` is omitted, the extension will auto-detect based on the cluster name and URL. If `group` is omitted, clusters are displayed individually.

### RDR Cluster Grouping

Clusters sharing the same `group` value are rendered as a collapsible group with:
- **Group header** showing the group name (Jenkins job ID) and cluster count
- **⚡ Login All** button to open and login to all clusters in the group
- **Expandable/collapsible** list of clusters (click chevron to expand)
- **Drag handle (⋮⋮)** to reorder entire groups

This is particularly useful for RDR (Regional Disaster Recovery) setups where you have multiple related clusters (Hub, C1, C2) that you want to login to together.

---

## ⚙️ Settings

All settings are available in the **⚙️ Settings** tab:

| Setting | Default | Description |
|---|---|---|
| 🤖 **Auto-detect & Login** | Off | Automatically triggers when an OpenShift login page is detected |
| 💬 **Show confirmation prompt** | On | Shows a banner and asks before filling credentials |
| 🆕 **Open in new tab** | On | Opens the cluster console in a new tab when logging in manually |
| 🔙 **Open tabs in background** | On | Keep current tab active when opening multiple clusters (Login All) |
| ⏱️ **Sequential login (1s delay)** | Off | Open clusters one by one with 1 second delay instead of all at once |

### Recommended Settings

For best experience when using **Login All**:
- ✅ **Open tabs in background**: ON — prevents disruption to your current tab
- ✅ **Sequential login**: OFF — faster parallel opening (unless you have resource constraints)

For auto-detection:
- ✅ **Show confirmation prompt**: ON — prevents unwanted automatic logins

---

## 🎨 UI Features

### Search & Filter
- **Real-time search** across cluster names and URLs
- Works with both individual clusters and groups
- Clear search to show all clusters

### Drag & Drop Reordering
- **Individual clusters**: Drag the **⋮⋮** handle to reorder
- **Groups**: Drag entire groups to reorganize your layout
- Order persists automatically

### Bulk Actions
- **Select multiple**: Check boxes next to clusters
- **Delete in bulk**: Scroll to bottom → **🗑️ Delete X Selected**
- See selection count in real-time

### Expandable Groups
- Click **▶** chevron to expand/collapse groups
- **⚡ Login All** button opens all clusters in group
- Visual role summary shows all cluster types in group

---

## 🔀 How OAuth Redirect Handling Works

OpenShift login involves multiple redirects across subdomains:

```
https://console-openshift-console.apps.mycluster.example.com
  → https://oauth-openshift.apps.mycluster.example.com/oauth/authorize
    → https://oauth-openshift.apps.mycluster.example.com/login?idp=htpasswd
      ↑ credentials are filled here
        → back to console ✓
```

The extension handles this transparently by:

- **Tracking the full redirect chain** — waits for the page to fully settle before injecting credentials, so it never fires too early
- **Domain matching** **(Enhanced in v2.1)** — recognises both `console-openshift-console.apps.*` and `oauth-openshift.apps.*` as the same cluster by comparing the shared base domain. Improved algorithm matches OAuth pages more reliably
- **IDP selection** — automatically clicks through `htpasswd`, `Local`, or any provider selection screen before the login form appears
- **Native input filling** — uses the browser's native value setter to bypass React/Angular controlled inputs that silently ignore direct `.value` assignments
- **Login page detection** **(Enhanced in v2.1)** — better recognition of OAuth URLs, IDP selection pages, and page titles
- **Retry logic** **(New in v2.1)** — up to 5 retry attempts over 5 seconds for slow-loading OAuth pages
- **Certificate handling** **(New in v2.1)** — detects SSL warnings, waits for manual acceptance, then auto-resumes login

---

## 🔒 SSL Certificate Handling

**New in v2.1:** The extension now intelligently handles self-signed and untrusted SSL certificates.

### How It Works

Chrome extensions **cannot bypass SSL certificate warnings automatically** due to browser security restrictions. However, v2.1 includes smart detection and guidance:

1. **Automatic Detection**: When the extension encounters "Your connection is not private" (ERR_CERT_AUTHORITY_INVALID), it detects this and displays a helpful status message
2. **Visual Feedback**: You'll see: `🔒 Certificate warning detected. Click "Advanced" → "Proceed" in the tab, then auto-login will continue.`
3. **Automatic Continuation**: Once you click "Proceed", the extension automatically resumes the login process
4. **Extended Timeout**: Login timeout increased to 45 seconds to accommodate manual certificate acceptance

### Best Practice: Pre-Accept Certificates

To avoid certificate prompts during auto-login:

**Option 1: Test Connection Button (Recommended)**
1. When adding a cluster, enter the Console URL
2. Click **🔗 Test Connection (Accept Certificate)**
3. A new tab opens — click "Advanced" → "Proceed to [site] (unsafe)"
4. Close the tab and save your cluster
5. Future logins to this cluster won't show certificate warnings

**Option 2: Manual Pre-Visit**
1. Before adding a cluster, manually visit its URL in a browser tab
2. Accept the certificate warning once
3. Chrome remembers your choice
4. Add the cluster — auto-login now works seamlessly

**Option 3: Use HTTP (Not Recommended for Production)**
- If your cluster supports `http://` URLs, these won't trigger certificate warnings
- Only suitable for development/test environments

### Troubleshooting Certificate Issues

**Login stuck at certificate warning page:**
- Make sure you click both "Advanced" AND "Proceed to [site]" buttons
- Wait for the page to fully load after accepting
- Check browser console logs for detailed status messages

**Certificate warning reappears:**
- Chrome may forget the exception if you clear browsing data
- Re-accept the certificate using Test Connection or manual visit

**Auto-login times out:**
- Ensure you're clicking "Proceed" within 45 seconds
- Check that the cluster URL in your saved configuration is correct

---

## 📁 File Structure

```
openshift-autologin/
├── manifest.json      # Chrome extension manifest (v3)
├── popup.html         # Extension popup UI
├── popup.js           # Cluster management, import/export, login, role detection
├── content.js         # Injected script — auto-detect and credential filling
├── background.js      # Service worker — initialises default settings
├── icon16.png         # Toolbar icon (16×16)
├── icon32.png         # Toolbar icon (32×32)
├── icon48.png         # Extensions page icon (48×48)
└── icon128.png        # Large icon (128×128)
```

---

## 🔧 Troubleshooting

### SSL Certificate Warnings

**Login stuck at "Your connection is not private":**
- This is expected for self-signed certificates — Chrome requires manual acceptance
- Click "Advanced" → "Proceed to [site] (unsafe)"
- The extension will automatically continue login after acceptance
- See [SSL Certificate Handling](#-ssl-certificate-handling) for detailed solutions

**Certificate warning appears every time:**
- Use the **🔗 Test Connection** button before saving the cluster
- This pre-accepts the certificate so future logins are seamless
- Alternatively, manually visit the cluster URL once to accept the certificate

### Auto-Login Issues

**Auto-login popup doesn't appear on OAuth page:**
- Check that **Auto-detect & Login** is enabled in **⚙️ Settings**
- Ensure the cluster's console URL is saved correctly (matches the domain)
- Open browser DevTools → Console tab and look for `[Auto-Login Content]` log messages
- Verify the cluster URL in your saved configuration matches the OAuth page domain

**Login times out:**
- Default timeout is 45 seconds (increased in v2.1 for certificate acceptance)
- Check credentials are correct
- Ensure cluster URL is accessible
- Look for certificate warnings that need manual acceptance

### Form and Data Issues

**Form clears when switching tabs:**
- This was fixed in v2.1 — form data now auto-saves as you type
- If it still happens, reload the extension at `chrome://extensions/`

**Lost cluster data while adding:**
- Form state is automatically saved in v2.1
- Reopen the popup — your partially-entered data should be restored
- Click Cancel to clear the saved form state

### Login All Issues

**Login All opens only one cluster:**
- Make sure all tabs are created synchronously. This issue was fixed in v2.0 — update to the latest version

**Too many tabs opening at once:**
- Go to **⚙️ Settings** → Enable **⏱️ Sequential login (1s delay)**
- This opens clusters one by one instead of all at once

### UI and Organization

**Drag and drop isn't working:**
- Ensure you're clicking the **⋮⋮** drag handle, not other parts of the card
- For groups, drag from the group header, not individual cluster cards inside

**Search isn't showing any results:**
- Check your spelling — search is case-insensitive but must match exactly
- Clear the search box to reset and show all clusters

**Bulk delete button doesn't appear:**
- Select at least one cluster using the checkboxes
- The delete button appears at the bottom only when items are selected

**Groups aren't appearing:**
- Ensure multiple clusters have the exact same `group` value
- Groups only appear when 2+ clusters share a group identifier

### Import/Export Issues

**Import file isn't being recognized:**
- Ensure the file has the correct extension (`.json`, `.yaml`, `.yml`, `.env`, `.txt`)
- Verify the file structure matches the examples in [Supported Import File Formats](#-supported-import-file-formats)
- Check for JSON syntax errors (missing commas, quotes, etc.)

### Settings

**Tabs open in foreground instead of background:**
- Go to **⚙️ Settings** → Enable **🔙 Open tabs in background**

**Auto-login not working:**
- Verify **🤖 Auto-detect & Login** is enabled in Settings
- Check browser console for `[Auto-Login Content]` debug messages
- Ensure the page URL matches a saved cluster's domain

## 🔒 Security Notes

- Credentials are stored in **Chrome local storage** (`chrome.storage.local`) on your machine only — nothing is transmitted to any external server
- Credentials are never written to logs or exposed in page source
- The extension only activates on pages that match the OpenShift login page signature
- For shared or production environments, consider using a dedicated read-only service account
- Where possible, prefer **SSO / OIDC** over username and password authentication
- **Export files contain passwords in plain text** — store them securely

---

## 🛠 Development

To modify the extension and test your changes:

1. Edit the source files
2. Go to `chrome://extensions/`
3. Click **↻ Reload** on the OpenShift Auto-Login card

### Key files and functions

| File | Key Functions |
|---|---|
| `popup.js` | `loginToCluster()`, `waitForTabAndLogin()`, `performLogin()`, `isCertificateErrorPage()`, `detectRole()`, `groupClusters()`, `renderClusterCard()`, `handleDragStart/Drop()`, `handleGroupDragStart/Drop()`, `saveFormState()`, `restoreFormState()`, import/export parsers |
| `popup.html` | UI layout, role badge tooltips, search input, bulk delete bar, drag handles, test connection button |
| `content.js` | Auto-detect logic, domain matching, confirmation banner, credential filling, `matchCluster()` |
| `background.js` | Sets default settings on first install |

### New functions in v2.1

| Function | Purpose |
|---|---|
| `isCertificateErrorPage()` | Detects SSL certificate warning pages by URL and title |
| `saveFormState()` | Persists form data to chrome.storage.local when adding clusters |
| `restoreFormState()` | Restores saved form data when popup reopens |
| `clearFormState()` | Removes saved form data after save/cancel |
| `setupFormAutosave()` | Attaches input/change listeners for real-time form saving |
| Enhanced `matchCluster()` | Improved domain matching for oauth-openshift URLs |
| Enhanced `isOpenShiftLoginPage()` | Better OAuth and IDP page detection |
| Certificate handling in `waitForTabAndLogin()` | Tracks cert errors, waits for acceptance, auto-resumes login |

### Functions added in v2.0

| Function | Purpose |
|---|---|
| `groupClusters()` | Groups clusters by `group` field for RDR setups |
| `updateBulkActionsBar()` | Shows/hides bulk delete button based on selections |
| `handleGroupDragStart/Drop()` | Drag-and-drop reordering for cluster groups |
| Search event listener | Real-time filtering of clusters and groups |

---

## ❓ FAQ

### How does Login All work?
Click **⚡ Login All** on a group header to open all clusters in that group simultaneously. The extension opens each cluster's console in a new tab and automatically fills credentials.

### What's the difference between parallel and sequential login?
- **Parallel** (default): All tabs open at once — fastest but uses more resources
- **Sequential**: Opens one tab per second — slower but easier on system resources

### Can I login to clusters that aren't grouped?
Yes! Individual clusters have their own **Login** button. Groups are optional.

### How do I create a group?
Add the same `group` value to multiple clusters in your import file, or manually enter a group name when adding clusters.

### What happens if I delete a cluster?
It's removed from local storage permanently. Export your clusters regularly to back them up.

### Can I use this with SSO/OAuth?
Yes! The extension handles full OAuth redirect chains, including identity provider selection.

### Why does the extension need manual certificate acceptance?
Chrome's security model prevents extensions from bypassing SSL certificate warnings. This is a browser restriction, not a limitation of the extension. Use the **Test Connection** button to pre-accept certificates before saving clusters.

### What happens if I close the popup while adding a cluster?
**New in v2.1:** Your form data is automatically saved! Reopen the popup and your partially-entered cluster details will be restored. Click Cancel to clear the saved data.

### Does auto-login work on oauth-openshift URLs?
**Improved in v2.1:** Yes! The extension now better detects OAuth login pages and matches them to saved clusters by domain. Enable **Auto-detect & Login** in Settings to use this feature.

### What's the default username when adding a cluster?
**New in v2.1:** The username field defaults to "kubeadmin" when you click Add Cluster. You can change it to any username you need.

## 🎯 Tips & Tricks

### Organizing Your Clusters

1. **Use meaningful names**: Instead of "Cluster 1", use "Prod Hub" or "Staging C1"
2. **Group related clusters**: Use the same `group` value for RDR cluster sets
3. **Leverage role detection**: Add explicit `role` fields for accurate badge colors
4. **Reorder strategically**: Drag frequently-used clusters to the top

### Working with Self-Signed Certificates (v2.1)

1. **Pre-accept certificates first**: Before adding clusters, use **Test Connection** to accept certificates
2. **One-time acceptance**: Chrome remembers certificate exceptions, so you only need to accept once
3. **Watch for status messages**: The extension shows `🔒 Certificate warning detected` when it encounters cert errors
4. **Extended timeout**: You have 45 seconds to manually accept certificates before timeout
5. **Manual pre-visit**: Alternatively, visit cluster URLs manually in a tab before adding them

### Form Data Management (v2.1)

1. **Auto-save is active**: Form data saves as you type — no need to worry about losing progress
2. **Switch tabs freely**: Your partially-entered cluster details persist across tab switches
3. **Resume later**: Close the popup and reopen — your form will be restored
4. **Clear when done**: Click Cancel or Save to clear the auto-saved form state
5. **Default username**: "kubeadmin" auto-fills — just change it if you need a different user

### Performance Optimization

When logging into many clusters at once:
- **Background tabs** (ON) + **Sequential** (OFF) = Fastest, but resource-intensive
- **Background tabs** (ON) + **Sequential** (ON) = Slower, but easier on system resources
- **Foreground tabs** (OFF) = Not recommended for multiple clusters

### Bulk Operations

- Use **Search** to filter, then select all matching clusters for bulk delete
- Export regularly to back up your cluster configurations
- Check all boxes before deleting to see the total count

### Working with RDR Setups

For Regional Disaster Recovery environments with Hub + C1 + C2:
1. Use the same `group` value for all related clusters (e.g., `"jenkins-job-12345"`)
2. Set explicit `role` values: `"hub"`, `"primary"`, `"secondary"`
3. Use **Login All** to open all clusters in the RDR group with one click
4. Enable **Background tabs** to avoid disrupting your current work

### Auto-Login Best Practices (v2.1)

1. **Enable selectively**: Turn on auto-login only for trusted environments
2. **Use confirmation**: Keep **Show confirmation prompt** ON for safety
3. **Check console logs**: Open DevTools → Console to see detailed auto-login debug messages
4. **Domain matching**: The extension matches oauth-openshift URLs to console URLs automatically
5. **Retry logic**: Login pages have 5 retry attempts over 5 seconds for slow-loading OAuth pages

## 🤝 Contributing

Contributions are welcome! Ideas for future improvements:

**Completed in v2.1:**
- [x] SSL certificate warning detection and handling
- [x] Form state persistence across popup sessions
- [x] Enhanced OAuth login page detection
- [x] Better domain matching for OAuth redirects

**Future ideas:**
- [ ] Chrome Web Store publication
- [ ] Token-based login (Bearer token / kubeconfig import)
- [ ] Per-cluster IDP provider configuration
- [ ] Keyboard shortcut to trigger login on the current tab
- [ ] Firefox / WebExtensions support
- [ ] Import from kubeconfig files
- [ ] Export to other formats (.env, CSV)
- [ ] Automatic certificate acceptance via certificate API (if Chrome adds extension support)

Please open an issue or pull request on GitHub.

---

## 📄 License

MIT — see [LICENSE](LICENSE) for details.

---

## 📸 Screenshots

### Main Interface
- **Clusters Tab**: Grouped clusters with role badges, search, and Login All
- **Import Tab**: Drag-and-drop file import with format examples
- **Settings Tab**: Configure all login behaviors

### Key UI Elements
- **⋮⋮ Drag Handle**: Click and drag to reorder clusters or groups
- **☑️ Checkboxes**: Select multiple clusters for bulk delete
- **🔍 Search Box**: Real-time filtering by name or URL
- **⚡ Login All**: One-click batch login for grouped clusters
- **🏷️ Role Badges**: Color-coded cluster roles with tooltips

## 🙏 Acknowledgements

Built for QE teams managing multiple OpenShift clusters. Inspired by the Red Hat OpenShift web console.

---

**Made with ❤️ for OpenShift administrators and QE engineers**
