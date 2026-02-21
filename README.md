# 🔴 OpenShift Auto-Login

> A Chrome extension to auto-login to multiple OpenShift clusters — manually with one click or automatically when a login page is detected.

![Version](https://img.shields.io/badge/version-1.0-red)
![Manifest](https://img.shields.io/badge/manifest-v3-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Platform](https://img.shields.io/badge/platform-Chrome-yellow)

---

## ✨ Features

- 🖥 **Multi-cluster support** — manage Dev, Staging, Prod and any number of clusters
- 🔐 **One-click login** — click Login next to any cluster and credentials are filled automatically
- 🤖 **Auto-detect mode** — detects OpenShift login pages and offers to auto-fill credentials
- 🔀 **OAuth redirect handling** — works even when the console redirects to an OAuth/IDP server
- 📂 **Import from file** — load clusters from JSON, YAML, or `.env` files
- 💾 **Export** — backup your clusters as a JSON file
- ⚙️ **Configurable** — control auto-login, confirmation prompts, and tab behaviour
- 🎨 **Custom OpenShift-style icon** — looks right at home in your toolbar

---

## 📸 Screenshots

| Clusters Tab | Import Tab | Settings Tab |
|---|---|---|
| Manage and login to clusters | Import from JSON/YAML/.env | Configure auto-login behaviour |

---

## 🚀 Installation

Since this extension is not on the Chrome Web Store, install it in **Developer Mode**:

1. **Download** this repository as a ZIP and unzip it, or clone it:
   ```bash
   git clone https://github.com/prsurve/openshift-autologin.git
   ```

2. Open Chrome and navigate to:
   ```
   chrome://extensions/
   ```

3. Enable **Developer mode** using the toggle in the top-right corner.

4. Click **Load unpacked** and select the `openshift-autologin` folder.

5. The 🔴 OpenShift icon will appear in your Chrome toolbar.

> **Tip:** Pin the extension by clicking the puzzle piece icon in the toolbar and pinning OpenShift Auto-Login.

---

## 🖥 Usage

### Adding Clusters Manually

1. Click the 🔴 extension icon in the toolbar
2. In the **Clusters** tab, click **+ Add Cluster**
3. Fill in:
   - **Cluster Name** — e.g. `Dev`, `Staging`, `Prod`
   - **Console URL** — e.g. `https://console-openshift-console.apps.dev.example.com`
   - **Username** and **Password**
4. Click **Save Cluster**
5. Click **Login** next to any cluster to open and auto-login

### Importing Clusters from a File

1. Click the **📂 Import** tab
2. Drag and drop a file onto the drop zone, or click **Browse File**
3. Review the parsed clusters in the preview list
4. Click **✅ Import** to save them

### Auto-Detect Mode

When enabled, the extension watches every page you visit. If it detects an OpenShift login page matching one of your saved clusters, it will either:
- Show a **confirmation banner** at the top of the page (recommended), or
- **Auto-fill silently** without any prompt

Enable this in the **⚙️ Settings** tab.

---

## 📂 Supported Import File Formats

### JSON
```json
[
  {
    "name": "Dev",
    "url": "https://console-openshift-console.apps.dev.example.com",
    "user": "admin",
    "password": "yourpassword"
  },
  {
    "name": "Prod",
    "url": "https://console-openshift-console.apps.prod.example.com",
    "user": "admin",
    "password": "yourpassword"
  }
]
```

### YAML
```yaml
clusters:
  - name: Dev
    url: https://console-openshift-console.apps.dev.example.com
    user: admin
    password: yourpassword

  - name: Prod
    url: https://console-openshift-console.apps.prod.example.com
    user: admin
    password: yourpassword
```

### .env
```env
DEV_NAME=Dev
DEV_URL=https://console-openshift-console.apps.dev.example.com
DEV_USER=admin
DEV_PASSWORD=yourpassword

PROD_NAME=Prod
PROD_URL=https://console-openshift-console.apps.prod.example.com
PROD_USER=admin
PROD_PASSWORD=yourpassword
```

> **Note:** The `.env` format is compatible with the companion [Python tray app](#-companion-python-tray-app).

---

## ⚙️ Settings

| Setting | Default | Description |
|---|---|---|
| 🤖 Auto-detect & Login | Off | Watches pages and triggers login automatically |
| 💬 Show confirmation prompt | On | Shows a banner before auto-filling (recommended) |
| 🆕 Open in new tab | On | Opens the cluster URL in a new tab |

---

## 🔀 How OAuth Redirect Handling Works

OpenShift consoles typically redirect login through an OAuth server on a different subdomain:

```
https://console-openshift-console.apps.dev.example.com
  → https://oauth-openshift.apps.dev.example.com/oauth/authorize
    → https://oauth-openshift.apps.dev.example.com/login?idp=...
      → (credentials filled here)
        → back to console
```

The extension handles this by:
1. **Tab redirect tracking** — monitors URL changes across the full redirect chain instead of firing on the first page load
2. **Domain matching** — matches clusters by shared `apps.*` base domain so OAuth URLs are correctly identified
3. **IDP selection** — automatically clicks through `htpasswd`, `Local`, or other identity provider selection screens
4. **Native input filling** — uses the browser's native value setter to bypass React/Angular controlled input fields that ignore direct `.value` assignment

---

## 📁 File Structure

```
openshift-autologin/
├── manifest.json      # Chrome extension manifest (v3)
├── popup.html         # Extension popup UI
├── popup.js           # Popup logic — cluster management, import/export, login
├── content.js         # Content script — auto-detect on login pages
├── background.js      # Service worker — sets default settings on install
├── icon16.png         # Toolbar icon (16×16)
├── icon32.png         # Toolbar icon (32×32)
├── icon48.png         # Extension page icon (48×48)
└── icon128.png        # Chrome Web Store icon (128×128)
```

---

## 🔒 Security Notes

- All credentials are stored in **Chrome's local storage** (`chrome.storage.local`) on your machine only — nothing is sent to any server
- Credentials are **never logged** or exposed in the page source
- The extension only activates on pages that look like OpenShift login pages
- It is recommended to use a dedicated service account with minimal permissions if using this for automated or shared workflows
- Consider using **SSO/OIDC** for production clusters instead of username/password

---

## 🐍 Companion Python Tray App

This extension was developed alongside a Python system tray app that provides the same functionality outside the browser using Selenium.

**Requirements:**
```bash
pip install pystray pillow selenium python-dotenv webdriver-manager
```

**Setup:**
1. Launch Chrome with remote debugging:
   ```bash
   # macOS / Linux
   google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug

   # Windows
   chrome.exe --remote-debugging-port=9222 --user-data-dir="C:\chrome-debug"
   ```

2. Create a `.env` file (same format as the import file above)

3. Run:
   ```bash
   python openshift_tray.py
   ```

4. Right-click the tray icon → **Login → cluster name**

---

## 🛠 Development

To modify and reload the extension:

1. Make your changes to the source files
2. Go to `chrome://extensions/`
3. Click the **↻ Reload** button on the extension card

### Key files to know

- **`popup.js`** — all UI logic including `loginToCluster()`, `waitForTabAndLogin()`, `performLogin()`, and the import/export parsers
- **`content.js`** — injected into every HTTPS page; handles auto-detect, domain matching, and the confirmation banner
- **`background.js`** — minimal service worker that sets default settings on first install

---

## 🤝 Contributing

Contributions are welcome! Some ideas for improvement:

- [ ] Chrome Web Store publication
- [ ] Support for token-based login (Bearer token / kubeconfig)
- [ ] Import directly from a `kubeconfig` file
- [ ] Per-cluster IDP configuration
- [ ] Keyboard shortcut to trigger login
- [ ] Firefox support (WebExtensions API compatible)

Please open an issue or pull request on GitHub.

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgements

Built for teams managing multiple OpenShift clusters who are tired of typing passwords. Inspired by the OpenShift web console and the Red Hat ecosystem.
