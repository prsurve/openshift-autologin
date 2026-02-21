// ── Tab switching ─────────────────────────────────────
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");
  });
});

// ── Load and render clusters ──────────────────────────
function loadClusters() {
  chrome.storage.local.get("clusters", ({ clusters = [] }) => {
    const list = document.getElementById("cluster-list");
    list.innerHTML = "";

    if (clusters.length === 0) {
      list.innerHTML = `<div class="no-clusters">No clusters yet.<br>Click below to add one!</div>`;
      return;
    }

    clusters.forEach((cluster, index) => {
      const div = document.createElement("div");
      div.className = "cluster-item";
      div.innerHTML = `
        <div style="min-width:0">
          <div class="cluster-name">${escapeHtml(cluster.name)}</div>
          <div class="cluster-url">${escapeHtml(cluster.url)}</div>
        </div>
        <div class="cluster-actions">
          <button class="login-btn" data-index="${index}">Login</button>
          <button class="delete-btn" data-index="${index}" title="Remove cluster">✕</button>
        </div>
      `;
      list.appendChild(div);
    });

    // Login buttons
    document.querySelectorAll(".login-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const cluster = clusters[parseInt(btn.dataset.index)];
        btn.disabled = true;
        btn.textContent = "...";
        loginToCluster(cluster, btn);
      });
    });

    // Delete buttons
    document.querySelectorAll(".delete-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const index = parseInt(btn.dataset.index);
        clusters.splice(index, 1);
        chrome.storage.local.set({ clusters }, loadClusters);
      });
    });
  });
}

// ── Login to cluster ──────────────────────────────────
function loginToCluster(cluster, btn) {
  showStatus("info", `Opening ${cluster.name}...`);

  chrome.storage.local.get("settings", ({ settings = {} }) => {
    const openNewTab = settings.newTab !== false; // default true

    if (openNewTab) {
      // Open in new tab
      chrome.tabs.create({ url: cluster.url }, (tab) => {
        waitForTabAndLogin(tab.id, cluster, btn);
      });
    } else {
      // Open in current tab
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        chrome.tabs.update(tab.id, { url: cluster.url }, (updatedTab) => {
          waitForTabAndLogin(updatedTab.id, cluster, btn);
        });
      });
    }
  });
}

function waitForTabAndLogin(tabId, cluster, btn) {
  let settled = false;
  let lastUrl = "";
  let stabilizeTimer = null;

  const listener = (id, info, tab) => {
    if (id !== tabId) return;

    // Track URL changes — OAuth causes multiple redirects
    if (tab.url && tab.url !== lastUrl) {
      lastUrl = tab.url;
      // Reset stabilize timer on every URL change
      if (stabilizeTimer) clearTimeout(stabilizeTimer);
    }

    if (info.status !== "complete") return;

    // Wait a bit after "complete" to let any JS redirects settle
    if (stabilizeTimer) clearTimeout(stabilizeTimer);
    stabilizeTimer = setTimeout(() => {
      // Check if the page has moved on to a new URL since we started
      chrome.tabs.get(tabId, (currentTab) => {
        if (chrome.runtime.lastError) return;

        const currentUrl = currentTab.url || "";

        // If we landed back on the console (login succeeded via SSO), done
        if (currentUrl.includes(extractDomain(cluster.url)) && !isLoginPage(currentUrl)) {
          if (!settled) {
            settled = true;
            chrome.tabs.onUpdated.removeListener(listener);
            showStatus("success", `✅ Logged into ${cluster.name}!`);
            if (btn) { btn.disabled = false; btn.textContent = "Login"; }
          }
          return;
        }

        // Inject login script into whatever page we're on (OAuth or console login)
        if (!settled) {
          chrome.scripting.executeScript({
            target: { tabId },
            func: performLogin,
            args: [cluster.user, cluster.password]
          }).then((results) => {
            const result = results && results[0] && results[0].result;
            if (result === "no_form") {
              // No login form found — page is still redirecting, keep waiting
              return;
            }
            if (result === "ok" || result === "submitted") {
              // Form was submitted — now watch for the final redirect to console
              watchForSuccess(tabId, cluster, btn, listener);
              settled = true;
              chrome.tabs.onUpdated.removeListener(listener);
            }
          }).catch(() => {
            // Script injection failed (e.g. chrome:// page), keep waiting
          });
        }
      });
    }, 800);
  };

  chrome.tabs.onUpdated.addListener(listener);

  // Timeout after 30 seconds
  setTimeout(() => {
    if (!settled) {
      chrome.tabs.onUpdated.removeListener(listener);
      showStatus("error", "❌ Login timed out. Check credentials or cluster URL.");
      if (btn) { btn.disabled = false; btn.textContent = "Login"; }
    }
  }, 30000);
}

// ── Watch for successful redirect back to console ─────
function watchForSuccess(tabId, cluster, btn, oldListener) {
  const domain = extractDomain(cluster.url);
  const successListener = (id, info, tab) => {
    if (id !== tabId || info.status !== "complete") return;
    const url = tab.url || "";
    if (url.includes(domain) && !isLoginPage(url)) {
      chrome.tabs.onUpdated.removeListener(successListener);
      showStatus("success", `✅ Logged into ${cluster.name}!`);
      if (btn) { btn.disabled = false; btn.textContent = "Login"; }
    }
    // If redirected to an error page
    if (url.includes("login") && url.includes("error")) {
      chrome.tabs.onUpdated.removeListener(successListener);
      showStatus("error", `❌ Login failed — wrong credentials?`);
      if (btn) { btn.disabled = false; btn.textContent = "Login"; }
    }
  };
  chrome.tabs.onUpdated.addListener(successListener);

  // Timeout
  setTimeout(() => {
    chrome.tabs.onUpdated.removeListener(successListener);
  }, 20000);
}

function extractDomain(url) {
  try { return new URL(url).hostname; } catch { return url; }
}

function isLoginPage(url) {
  return url.includes("/login") || url.includes("oauth") || url.includes("inputUsername");
}

// ── Injected login script (runs inside the OAuth/login tab) ──
function performLogin(username, password) {
  return new Promise((resolve) => {
    const waitFor = (selector, timeout = 8000) => new Promise((res, rej) => {
      const start = Date.now();
      const iv = setInterval(() => {
        const el = document.querySelector(selector);
        if (el) { clearInterval(iv); res(el); }
        if (Date.now() - start > timeout) { clearInterval(iv); rej(new Error(`Timeout: ${selector}`)); }
      }, 200);
    });

    (async () => {
      try {
        // ── Step 1: Handle IDP selection page ──
        // OpenShift OAuth may show a list of identity providers first
        // Look for htpasswd / Local / any login provider link or button
        const idpSelectors = [
          "a[href*='htpasswd']",
          "a[href*='local']",
          "a[href*='idp']",
          ".idp-link",
          ".pf-c-button"
        ];

        let idpClicked = false;
        for (const sel of idpSelectors) {
          const els = [...document.querySelectorAll(sel)];
          const idpEl = els.find(el => {
            const txt = el.textContent.toLowerCase();
            return txt.includes("htpasswd") || txt.includes("local") ||
                   txt.includes("ldap") || txt.includes("login");
          });
          if (idpEl) {
            idpEl.click();
            idpClicked = true;
            break;
          }
        }

        // ── Step 2: Wait for login form ──
        // After IDP click, page may navigate — wait for fields
        let userField, passField;
        try {
          userField = await waitFor("#inputUsername", idpClicked ? 6000 : 3000);
          passField = document.querySelector("#inputPassword");
        } catch {
          // No login form visible yet (still redirecting or IDP page has no form)
          resolve("no_form");
          return;
        }

        if (!userField || !passField) {
          resolve("no_form");
          return;
        }

        // ── Step 3: Fill credentials ──
        const setFieldValue = (field, value) => {
          field.focus();
          // Use native input value setter to bypass React/Angular onChange detection
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, "value"
          ).set;
          nativeInputValueSetter.call(field, value);
          field.dispatchEvent(new Event("input",  { bubbles: true }));
          field.dispatchEvent(new Event("change", { bubbles: true }));
          field.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
        };

        setFieldValue(userField, username);
        await new Promise(r => setTimeout(r, 200));
        setFieldValue(passField, password);
        await new Promise(r => setTimeout(r, 200));

        // ── Step 4: Submit ──
        const submitBtn = document.querySelector("button[type='submit']") ||
                          document.querySelector("input[type='submit']") ||
                          document.querySelector(".pf-c-button[type='submit']");

        if (submitBtn) {
          submitBtn.click();
          resolve("submitted");
        } else {
          // Try pressing Enter on password field
          passField.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
          resolve("submitted");
        }

      } catch (e) {
        resolve("no_form"); // Don't reject — let the tab watcher retry
      }
    })();
  });
}

// ── Status message ────────────────────────────────────
function showStatus(type, message) {
  const el = document.getElementById("status");
  el.className = `status ${type}`;
  el.textContent = message;
  if (type === "success") setTimeout(() => { el.style.display = "none"; }, 3000);
}

function escapeHtml(str) {
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ── Add cluster form ──────────────────────────────────
document.getElementById("add-btn").addEventListener("click", () => {
  document.getElementById("add-form").style.display = "block";
  document.getElementById("add-btn").style.display  = "none";
  document.getElementById("f-name").focus();
});

document.getElementById("cancel-btn").addEventListener("click", () => {
  document.getElementById("add-form").style.display = "none";
  document.getElementById("add-btn").style.display  = "block";
});

document.getElementById("save-btn").addEventListener("click", () => {
  const name     = document.getElementById("f-name").value.trim();
  const url      = document.getElementById("f-url").value.trim();
  const user     = document.getElementById("f-user").value.trim();
  const password = document.getElementById("f-password").value;

  if (!name || !url || !user || !password) {
    showStatus("error", "❌ All fields are required");
    return;
  }
  if (!url.startsWith("http")) {
    showStatus("error", "❌ URL must start with https://");
    return;
  }

  chrome.storage.local.get("clusters", ({ clusters = [] }) => {
    clusters.push({ name, url, user, password });
    chrome.storage.local.set({ clusters }, () => {
      document.getElementById("add-form").style.display = "none";
      document.getElementById("add-btn").style.display  = "block";
      ["f-name","f-url","f-user","f-password"].forEach(id => document.getElementById(id).value = "");
      loadClusters();
      showStatus("success", `✅ ${name} added!`);
    });
  });
});

// ── Settings ──────────────────────────────────────────
function loadSettings() {
  chrome.storage.local.get("settings", ({ settings = {} }) => {
    document.getElementById("toggle-auto").checked    = settings.autoLogin  || false;
    document.getElementById("toggle-confirm").checked = settings.confirm    !== false; // default true
    document.getElementById("toggle-newtab").checked  = settings.newTab     !== false; // default true
  });
}

function saveSetting(key, value) {
  chrome.storage.local.get("settings", ({ settings = {} }) => {
    settings[key] = value;
    chrome.storage.local.set({ settings });
  });
}

document.getElementById("toggle-auto").addEventListener("change",    e => saveSetting("autoLogin", e.target.checked));
document.getElementById("toggle-confirm").addEventListener("change",  e => saveSetting("confirm",   e.target.checked));
document.getElementById("toggle-newtab").addEventListener("change",   e => saveSetting("newTab",    e.target.checked));

// ── Init ──────────────────────────────────────────────
loadClusters();
loadSettings();

// ════════════════════════════════════════════════════════
// IMPORT / EXPORT
// ════════════════════════════════════════════════════════

// ── Format tab switching ──────────────────────────────
document.querySelectorAll(".format-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".format-tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".format-example").forEach(e => e.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`fmt-${tab.dataset.fmt}`).classList.add("active");
  });
});

// ── Drag and drop ─────────────────────────────────────
const dropZone  = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");

dropZone.addEventListener("click", () => fileInput.click());

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  const file = e.dataTransfer.files[0];
  if (file) processFile(file);
});

fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) processFile(fileInput.files[0]);
});

document.getElementById("browse-btn").addEventListener("click", () => fileInput.click());

// ── Parse file by extension ───────────────────────────
function processFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const content = e.target.result;
    const ext = file.name.split(".").pop().toLowerCase();
    let clusters = [];
    let error = null;

    try {
      if (ext === "json") {
        clusters = parseJSON(content);
      } else if (ext === "yaml" || ext === "yml") {
        clusters = parseYAML(content);
      } else if (ext === "env" || ext === "txt") {
        clusters = parseEnv(content);
      } else {
        // Try all parsers
        try       { clusters = parseJSON(content); }
        catch (_) {
          try     { clusters = parseYAML(content); }
          catch   { clusters = parseEnv(content);  }
        }
      }
    } catch (err) {
      error = err.message;
    }

    if (error || clusters.length === 0) {
      showImportStatus("error", `❌ Could not parse file: ${error || "No valid clusters found"}`);
      return;
    }

    showPreview(clusters);
  };
  reader.readAsText(file);
}

// ── JSON parser ───────────────────────────────────────
function parseJSON(content) {
  const data = JSON.parse(content);
  const arr = Array.isArray(data) ? data : (data.clusters || Object.values(data));

  return arr.map(c => ({
    name:     c.name     || c.cluster_name  || c.clusterName  || "Unknown",
    url:      c.url      || c.console_url   || c.consoleUrl   || "",
    user:     c.user     || c.username      || c.user_name    || "",
    password: c.password || c.pass         || c.pwd          || "",
  })).filter(c => c.url && c.user && c.password);
}

// ── YAML parser (no library needed — simple line-by-line) ─
function parseYAML(content) {
  const clusters = [];
  let current = null;
  let inClustersList = false;

  for (let line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Detect list item start
    if (trimmed.startsWith("- name:") || (trimmed === "-" && line.match(/^\s*-\s*$/))) {
      if (current && current.url && current.user && current.password) clusters.push(current);
      current = {};
      inClustersList = true;
      const val = trimmed.replace(/^-\s*name:\s*/, "").replace(/['"]/g, "").trim();
      if (val) current.name = val;
      continue;
    }

    if (!inClustersList && trimmed.startsWith("clusters:")) { inClustersList = true; continue; }

    if (current) {
      const match = trimmed.match(/^(\w+):\s*(.+)$/);
      if (match) {
        const key = match[1].toLowerCase();
        const val = match[2].replace(/['"]/g, "").trim();
        if (key === "name")     current.name     = val;
        if (key === "url")      current.url      = val;
        if (key === "user" || key === "username") current.user = val;
        if (key === "password" || key === "pass" || key === "pwd") current.password = val;
      }
    }
  }
  if (current && current.url && current.user && current.password) clusters.push(current);

  if (clusters.length === 0) throw new Error("No clusters found in YAML");
  return clusters;
}

// ── .env parser ───────────────────────────────────────
function parseEnv(content) {
  const vars = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim().toUpperCase();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    vars[key] = val;
  }

  const clusters = [];
  const prefixes = new Set();

  // Find all prefixes that have at least URL + USER + PASSWORD
  for (const key of Object.keys(vars)) {
    const suffix = ["_URL", "_USER", "_PASSWORD", "_NAME"].find(s => key.endsWith(s));
    if (suffix) prefixes.add(key.slice(0, key.length - suffix.length));
  }

  for (const prefix of prefixes) {
    const url  = vars[`${prefix}_URL`];
    const user = vars[`${prefix}_USER`];
    const pass = vars[`${prefix}_PASSWORD`];
    if (url && user && pass) {
      clusters.push({
        name:     vars[`${prefix}_NAME`] || prefix.charAt(0) + prefix.slice(1).toLowerCase(),
        url,
        user,
        password: pass,
      });
    }
  }

  if (clusters.length === 0) throw new Error("No valid cluster entries found in .env");
  return clusters;
}

// ── Show preview before importing ────────────────────
let pendingClusters = [];

function showPreview(clusters) {
  pendingClusters = clusters;
  const list = document.getElementById("preview-list");
  list.style.display = "block";
  list.innerHTML = `
    <div style="font-size:11px;color:#888;margin-bottom:6px;">
      Found <b style="color:#eee;">${clusters.length}</b> cluster(s) — review before importing:
    </div>
  `;

  clusters.forEach(c => {
    const item = document.createElement("div");
    item.className = "preview-item";
    const warn = !c.url || !c.user || !c.password;
    item.innerHTML = `
      <div class="preview-dot ${warn ? 'warn' : ''}"></div>
      <div style="min-width:0">
        <div style="font-weight:bold;font-size:12px;">${escapeHtml(c.name)}</div>
        <div style="font-size:10px;color:#888;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(c.url)}</div>
      </div>
      <div style="font-size:10px;color:#666;margin-left:auto;flex-shrink:0;">${escapeHtml(c.user)}</div>
    `;
    list.appendChild(item);
  });

  // Confirm button
  const existing = document.getElementById("confirm-import-btn");
  if (existing) existing.remove();

  const confirmBtn = document.createElement("button");
  confirmBtn.id = "confirm-import-btn";
  confirmBtn.className = "confirm-import-btn";
  confirmBtn.textContent = `✅ Import ${clusters.length} Cluster(s)`;
  confirmBtn.addEventListener("click", confirmImport);
  list.appendChild(confirmBtn);

  showImportStatus("info", `📋 ${clusters.length} cluster(s) parsed. Click Import to save.`);
}

// ── Confirm and save clusters ─────────────────────────
function confirmImport() {
  if (!pendingClusters.length) return;

  chrome.storage.local.get("clusters", ({ clusters = [] }) => {
    const existing = new Set(clusters.map(c => c.url));
    let added = 0, skipped = 0;

    for (const c of pendingClusters) {
      if (existing.has(c.url)) { skipped++; continue; }
      clusters.push(c);
      added++;
    }

    chrome.storage.local.set({ clusters }, () => {
      document.getElementById("preview-list").style.display = "none";
      pendingClusters = [];
      loadClusters(); // Refresh clusters tab
      const msg = skipped > 0
        ? `✅ Imported ${added} cluster(s). Skipped ${skipped} duplicate(s).`
        : `✅ Imported ${added} cluster(s) successfully!`;
      showImportStatus("success", msg);
    });
  });
}

// ── Export clusters to JSON ───────────────────────────
document.getElementById("export-btn").addEventListener("click", () => {
  chrome.storage.local.get("clusters", ({ clusters = [] }) => {
    if (clusters.length === 0) {
      showImportStatus("error", "❌ No clusters to export.");
      return;
    }

    // Export without passwords for safety — user can add them back
    const exportData = clusters.map(({ name, url, user, password }) => ({
      name, url, user, password
    }));

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "openshift-clusters.json";
    a.click();
    showImportStatus("success", `💾 Exported ${clusters.length} cluster(s).`);
  });
});

// ── Import status ─────────────────────────────────────
function showImportStatus(type, message) {
  const el = document.getElementById("import-status");
  el.className = `status ${type}`;
  el.textContent = message;
  if (type === "success") setTimeout(() => { el.style.display = "none"; }, 4000);
}
