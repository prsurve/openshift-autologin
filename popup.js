// ── Detect cluster role from name, URL, or explicit role field ──
function detectRole(cluster) {
  // If the imported file already has a role field (set by the download script), use it directly
  const roleMap = {
    "hub":         { key: "hub",         label: "Active Hub",   icon: "🟣", desc: "Active ACM Hub — manages all spoke clusters" },
    "hub-passive": { key: "hub-passive", label: "Passive Hub",  icon: "🔵", desc: "Passive ACM Hub (Disaster Recovery standby)" },
    "primary":     { key: "primary",     label: "Primary C1",   icon: "🟢", desc: "Primary managed cluster (C1)" },
    "secondary":   { key: "secondary",   label: "Secondary C2", icon: "🟡", desc: "Secondary managed cluster (C2)" },
    "unknown":     { key: "unknown",     label: "Cluster",      icon: "⚪", desc: "Role not detected" },
  };
  if (cluster.role && roleMap[cluster.role]) return roleMap[cluster.role];

  const name = (cluster.name || "").toLowerCase();
  const url  = (cluster.url  || "").toLowerCase();
  const combined = name + " " + url;

  // Hub / ACM patterns
  if (/hub[_-]?1|hub[_-]?one|passive|hub_1/.test(combined))
    return { key: "hub-passive", label: "Passive Hub", icon: "🔵", desc: "Passive ACM Hub (Disaster Recovery standby)" };

  if (/hub/.test(combined))
    return { key: "hub", label: "Active Hub", icon: "🟣", desc: "Active ACM Hub — manages all spoke clusters" };

  // Managed cluster patterns
  if (/c1|primary|vmware.?one|cluster.?1|spoke.?1/.test(combined))
    return { key: "primary", label: "Primary C1", icon: "🟢", desc: "Primary managed cluster (C1)" };

  if (/c2|secondary|vmware.?two|cluster.?2|spoke.?2/.test(combined))
    return { key: "secondary", label: "Secondary C2", icon: "🟡", desc: "Secondary managed cluster (C2)" };

  // Fallback: try to guess from URL segment count / patterns
  if (/spoke|managed|worker/.test(combined))
    return { key: "primary", label: "Spoke", icon: "🟢", desc: "Managed spoke cluster" };

  return { key: "unknown", label: "Cluster", icon: "⚪", desc: "Role not detected — check cluster name or URL" };
}

// ── Tab switching ─────────────────────────────────────
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");
  });
});

// ── Group clusters by explicit "group" field (Jenkins job ID) ─
// Clusters with the same group value form one RDR group.
// Clusters with no group field are rendered individually.
function groupClusters(clusters) {
  const groups   = {};   // keyed by group value
  const ungrouped = [];  // clusters with no group field

  clusters.forEach((cluster, index) => {
    const g = (cluster.group || "").trim();
    if (!g) {
      ungrouped.push({ cluster, index });
    } else {
      if (!groups[g]) groups[g] = { groupId: g, clusters: [] };
      groups[g].clusters.push({ cluster, index });
    }
  });

  // Build final list: named groups first, then ungrouped singletons
  const result = Object.values(groups);
  ungrouped.forEach(item => result.push({ groupId: null, clusters: [item] }));
  return result;
}

// ── Render a single cluster card ──────────────────────
function renderClusterCard(cluster, index, clusters) {
  const div = document.createElement("div");
  div.className = "cluster-item";
  div.setAttribute("draggable", "true");
  div.dataset.index = index;
  const role = detectRole(cluster);
  div.innerHTML = `
    <span class="drag-handle" style="cursor:grab;color:#666;margin-right:8px;font-size:12px;" title="Drag to reorder">⋮⋮</span>
    <input type="checkbox" class="cluster-checkbox" data-index="${index}" />
    <div style="min-width:0;flex:1;">
      <div class="cluster-name">${escapeHtml(cluster.name)}</div>
      <div class="cluster-meta">
        <div class="cluster-url">${escapeHtml(cluster.url)}</div>
        <div class="tooltip-wrap">
          <span class="role-badge ${role.key}">${role.icon} ${role.label}</span>
          <div class="tooltip-box">
            <div style="font-weight:bold;margin-bottom:4px;">${role.icon} ${role.label}</div>
            <div style="color:#aaa;">${role.desc}</div>
            <div style="margin-top:6px;color:#666;font-size:10px;">${escapeHtml(cluster.url)}</div>
          </div>
        </div>
      </div>
    </div>
    <div class="cluster-actions">
      <button class="login-btn" data-index="${index}">Login</button>
      <button class="delete-btn" data-index="${index}" title="Remove cluster">✕</button>
    </div>
  `;

  // Checkbox event
  div.querySelector(".cluster-checkbox").addEventListener("change", updateBulkActionsBar);

  div.querySelector(".login-btn").addEventListener("click", (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "...";
    loginToCluster(cluster, btn);
  });

  div.querySelector(".delete-btn").addEventListener("click", () => {
    clusters.splice(index, 1);
    chrome.storage.local.set({ clusters }, loadClusters);
  });

  // Drag and drop events
  div.addEventListener("dragstart", handleDragStart);
  div.addEventListener("dragover", handleDragOver);
  div.addEventListener("drop", handleDrop);
  div.addEventListener("dragend", handleDragEnd);

  return div;
}

// ── Load and render clusters with grouping ────────────
function loadClusters() {
  chrome.storage.local.get("clusters", ({ clusters = [] }) => {
    const list = document.getElementById("cluster-list");
    list.innerHTML = "";

    if (clusters.length === 0) {
      list.innerHTML = `<div class="no-clusters">No clusters yet.<br>Click below to add one!</div>`;
      return;
    }

    const groups = groupClusters(clusters);

    groups.forEach(group => {
      // Single cluster — no group wrapper needed
      if (group.clusters.length === 1) {
        const { cluster, index } = group.clusters[0];
        list.appendChild(renderClusterCard(cluster, index, clusters));
        return;
      }

      // Multiple clusters sharing same base domain → render as RDR group
      const groupDiv = document.createElement("div");
      groupDiv.className = "cluster-group";
      groupDiv.setAttribute("draggable", "true");
      groupDiv.dataset.groupIndex = groups.indexOf(group);

      // Group label = Jenkins job ID
      const groupLabel = group.groupId || "RDR Group";
      const rolesSummary = group.clusters.map(({cluster}) => detectRole(cluster).icon).join(" ");

      // Header — click to expand/collapse, Login All button
      const header = document.createElement("div");
      header.className = "group-header";
      header.innerHTML = `
        <div class="group-header-left">
          <span class="drag-handle" style="cursor:grab;color:#4a7ab5;margin-right:6px;font-size:14px;" title="Drag to reorder">⋮⋮</span>
          <span class="group-chevron">▶</span>
          <div>
            <div class="group-name">📦 ${escapeHtml(groupLabel)}</div>
            <div class="group-meta">${group.clusters.length} clusters &nbsp;${rolesSummary}</div>
          </div>
        </div>
        <div class="group-actions">
          <button class="login-all-btn" title="Login to all clusters in this group">⚡ Login All</button>
          <span class="group-count">${group.clusters.length}</span>
        </div>
      `;

      // Cluster cards container (collapsed by default)
      const body = document.createElement("div");
      body.className = "group-body collapsed";

      group.clusters.forEach(({ cluster, index }) => {
        body.appendChild(renderClusterCard(cluster, index, clusters));
      });

      // Toggle expand/collapse on header click
      header.addEventListener("click", (e) => {
        if (e.target.closest(".login-all-btn")) return; // don't toggle when clicking Login All
        const collapsed = body.classList.toggle("collapsed");
        header.querySelector(".group-chevron").textContent = collapsed ? "▶" : "▼";
      });

      // Login All — login to every cluster in the group
      header.querySelector(".login-all-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        const btn = e.currentTarget;

        // Prevent duplicate clicks
        if (btn.dataset.logging === "true") return;
        btn.dataset.logging = "true";

        btn.disabled = true;
        btn.textContent = "⏳ Logging in...";

        showStatus("info", `Opening ${group.clusters.length} clusters...`);

        // Get tab opening settings
        chrome.storage.local.get("settings", ({ settings = {} }) => {
          const openInBackground = settings.backgroundTabs !== false; // default true
          const sequential = settings.sequentialTabs === true; // default false (parallel)

          // Open all tabs immediately (before popup closes)
          // Must create all tabs synchronously or the popup will close after the first tab
          if (sequential) {
            // Sequential: open one after another with delay
            group.clusters.forEach(({ cluster }, idx) => {
              setTimeout(() => {
                chrome.tabs.create({ url: cluster.url, active: !openInBackground }, (tab) => {
                  waitForTabAndLogin(tab.id, cluster, null);
                });
              }, idx * 1000); // 1 second between each
            });
          } else {
            // Parallel: open all at once
            group.clusters.forEach(({ cluster }) => {
              chrome.tabs.create({ url: cluster.url, active: !openInBackground }, (tab) => {
                waitForTabAndLogin(tab.id, cluster, null);
              });
            });
          }

          // Show success message
          showStatus("success", `✅ Opening all ${group.clusters.length} clusters!`);

          // Reset after delay
          setTimeout(() => {
            btn.dataset.logging = "false";
          }, 2000);
        });
      });

      // Drag and drop events for groups
      groupDiv.addEventListener("dragstart", handleGroupDragStart);
      groupDiv.addEventListener("dragover", handleGroupDragOver);
      groupDiv.addEventListener("drop", handleGroupDrop);
      groupDiv.addEventListener("dragend", handleGroupDragEnd);

      groupDiv.appendChild(header);
      groupDiv.appendChild(body);
      list.appendChild(groupDiv);
    });
  });
}

// ── Login to cluster ──────────────────────────────────
function loginToCluster(cluster, btn, forceNewTab = false) {
  showStatus("info", `Opening ${cluster.name}...`);

  chrome.storage.local.get("settings", ({ settings = {} }) => {
    const openNewTab = forceNewTab || (settings.newTab !== false); // default true, or force if specified

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
  let certErrorShown = false;
  let certJustAccepted = false;

  const listener = (id, info, tab) => {
    if (id !== tabId) return;

    // Track URL changes — OAuth causes multiple redirects
    if (tab.url && tab.url !== lastUrl) {
      lastUrl = tab.url;
      // Reset stabilize timer on every URL change
      if (stabilizeTimer) clearTimeout(stabilizeTimer);
      console.log(`[Auto-Login] URL changed to: ${tab.url}`);
    }

    if (info.status !== "complete") return;

    // Wait a bit after "complete" to let any JS redirects settle
    if (stabilizeTimer) clearTimeout(stabilizeTimer);

    stabilizeTimer = setTimeout(() => {
      // Check if the page has moved on to a new URL since we started
      chrome.tabs.get(tabId, (currentTab) => {
        if (chrome.runtime.lastError) return;

        const currentUrl = currentTab.url || "";
        const currentTitle = currentTab.title || "";

        console.log(`[Auto-Login] Status check - URL: ${currentUrl}, Title: ${currentTitle}, certErrorShown: ${certErrorShown}, settled: ${settled}`);

        // ── Detect SSL certificate errors ──
        const isCertError = isCertificateErrorPage(currentUrl, currentTitle);

        if (isCertError) {
          if (!certErrorShown) {
            certErrorShown = true;
            console.log(`[Auto-Login] Certificate error detected! Waiting for user to proceed...`);
            showStatus("info", `🔒 Certificate warning detected. Click "Advanced" → "Proceed" in the tab, then auto-login will continue.`);
            if (btn) {
              btn.textContent = "Waiting...";
            }
          }
          // Don't settle - keep waiting for user to bypass the certificate warning
          return;
        }

        // If we had a cert error but now we're past it
        if (certErrorShown && !isCertError && currentUrl.startsWith("https://")) {
          console.log(`[Auto-Login] Certificate accepted! URL is now valid HTTPS: ${currentUrl}`);
          certErrorShown = false;
          certJustAccepted = true;
          showStatus("info", `✅ Certificate accepted. Waiting for page to load...`);
          if (btn) {
            btn.textContent = "Loading...";
          }

          // Force a retry after 2 seconds in case no more page updates come
          setTimeout(() => {
            if (!settled && certJustAccepted) {
              console.log(`[Auto-Login] Forcing login attempt after cert acceptance timeout...`);
              chrome.tabs.get(tabId, (tab) => {
                if (chrome.runtime.lastError || !tab) return;

                // Manually trigger login injection
                if (tab.url && tab.url.startsWith("https://")) {
                  certJustAccepted = false;
                  if (btn) btn.textContent = "Logging in...";

                  chrome.scripting.executeScript({
                    target: { tabId },
                    func: performLogin,
                    args: [cluster.user, cluster.password]
                  }).then((results) => {
                    const result = results && results[0] && results[0].result;
                    console.log(`[Auto-Login] Forced script result: ${result}`);
                    if (result === "ok" || result === "submitted") {
                      watchForSuccess(tabId, cluster, btn);
                      settled = true;
                      chrome.tabs.onUpdated.removeListener(listener);
                    }
                  }).catch((err) => {
                    console.log(`[Auto-Login] Forced script injection failed: ${err.message || err}`);
                  });
                }
              });
            }
          }, 2000);

          // Don't inject script yet - wait for next page update cycle or timeout
          return;
        }

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
        if (!settled && !isCertError && currentUrl.startsWith("https://")) {
          // If we just recovered from cert error, clear the flag
          if (certJustAccepted) {
            console.log(`[Auto-Login] Page loaded after cert acceptance, now attempting login...`);
            certJustAccepted = false;
            if (btn) {
              btn.textContent = "Logging in...";
            }
          }
          console.log(`[Auto-Login] Attempting to inject login script into ${currentUrl}...`);
          chrome.scripting.executeScript({
            target: { tabId },
            func: performLogin,
            args: [cluster.user, cluster.password]
          }).then((results) => {
            const result = results && results[0] && results[0].result;
            console.log(`[Auto-Login] Script result: ${result}`);
            if (result === "no_form") {
              // No login form found — page is still redirecting, keep waiting
              console.log(`[Auto-Login] No form found yet, will retry on next page update...`);
              return;
            }
            if (result === "ok" || result === "submitted") {
              // Form was submitted — now watch for the final redirect to console
              console.log(`[Auto-Login] Login form submitted successfully!`);
              watchForSuccess(tabId, cluster, btn);
              settled = true;
              chrome.tabs.onUpdated.removeListener(listener);
            }
          }).catch((err) => {
            // Script injection failed (e.g. chrome:// page), keep waiting
            console.log(`[Auto-Login] Script injection failed: ${err.message || err}`);
          });
        } else if (!settled && isCertError) {
          console.log(`[Auto-Login] Skipping login injection - still on cert error page`);
        } else if (!settled && !currentUrl.startsWith("https://")) {
          console.log(`[Auto-Login] Skipping login injection - URL not HTTPS yet: ${currentUrl}`);
        }
      });
    }, 800);
  };

  chrome.tabs.onUpdated.addListener(listener);

  // Timeout after 45 seconds (increased to account for cert warnings)
  setTimeout(() => {
    if (!settled) {
      chrome.tabs.onUpdated.removeListener(listener);
      console.log(`[Auto-Login] Timeout reached. certErrorShown: ${certErrorShown}, certJustAccepted: ${certJustAccepted}`);

      if (certErrorShown) {
        showStatus("error", "❌ Timed out waiting for certificate acceptance. Please click 'Proceed' in the tab.");
      } else {
        showStatus("error", "❌ Login timed out. Check credentials, cluster URL, or try again.");
      }

      if (btn) { btn.disabled = false; btn.textContent = "Login"; }
    }
  }, 45000);
}

// ── Watch for successful redirect back to console ─────
function watchForSuccess(tabId, cluster, btn) {
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

// ── Detect SSL certificate error pages ────────────────
function isCertificateErrorPage(url, title) {
  // Chrome error pages - these are the definitive indicators
  if (url.startsWith("chrome-error://")) return true;
  if (url.startsWith("about:neterror")) return true;

  // If we have a regular HTTPS URL, it's not an error page
  // (even if the title mentions certificate/privacy, the user has clicked "Proceed")
  if (url.startsWith("https://") || url.startsWith("http://")) return false;

  // Check page title for certificate/privacy errors (only if URL is suspicious)
  const lowerTitle = (title || "").toLowerCase();
  const errorKeywords = [
    "privacy error",
    "not private",
    "your connection is not private"
  ];

  return errorKeywords.some(keyword => lowerTitle.includes(keyword));
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
// Save form state to preserve data when switching tabs or popup closes
function saveFormState() {
  const formState = {
    isOpen: document.getElementById("add-form").style.display === "block",
    name: document.getElementById("f-name").value,
    url: document.getElementById("f-url").value,
    user: document.getElementById("f-user").value,
    password: document.getElementById("f-password").value,
    role: document.getElementById("f-role").value,
    group: document.getElementById("f-group").value,
  };
  chrome.storage.local.set({ formState });
}

// Restore form state when popup opens
function restoreFormState() {
  chrome.storage.local.get("formState", ({ formState }) => {
    if (!formState) return;

    // Restore field values
    if (formState.name) document.getElementById("f-name").value = formState.name;
    if (formState.url) document.getElementById("f-url").value = formState.url;
    if (formState.user) document.getElementById("f-user").value = formState.user;
    if (formState.password) document.getElementById("f-password").value = formState.password;
    if (formState.role) document.getElementById("f-role").value = formState.role;
    if (formState.group) document.getElementById("f-group").value = formState.group;

    // Restore form visibility
    if (formState.isOpen) {
      document.getElementById("add-form").style.display = "block";
      document.getElementById("add-btn").style.display = "none";
    }
  });
}

// Clear form state from storage
function clearFormState() {
  chrome.storage.local.remove("formState");
}

// Auto-save form state on input changes
function setupFormAutosave() {
  ["f-name", "f-url", "f-user", "f-password", "f-role", "f-group"].forEach(id => {
    const field = document.getElementById(id);
    field.addEventListener("input", saveFormState);
    field.addEventListener("change", saveFormState);
  });
}

document.getElementById("add-btn").addEventListener("click", () => {
  document.getElementById("add-form").style.display = "block";
  document.getElementById("add-btn").style.display  = "none";

  // Set default username to "kubeadmin" if field is empty
  const userField = document.getElementById("f-user");
  if (!userField.value.trim()) {
    userField.value = "kubeadmin";
  }

  document.getElementById("f-name").focus();
  saveFormState(); // Save that form is now open
});

document.getElementById("cancel-btn").addEventListener("click", () => {
  document.getElementById("add-form").style.display = "none";
  document.getElementById("add-btn").style.display  = "block";
  // Clear form fields
  ["f-name","f-url","f-user","f-password","f-role","f-group"].forEach(id => {
    const el = document.getElementById(id);
    if (el.tagName === 'SELECT') el.selectedIndex = 0;
    else el.value = "";
  });
  clearFormState(); // Clear saved state
});

// ── Test Connection Button ────────────────────────────
document.getElementById("test-connection-btn").addEventListener("click", () => {
  const url = document.getElementById("f-url").value.trim();

  if (!url) {
    showStatus("error", "❌ Please enter a Console URL first");
    return;
  }

  if (!url.startsWith("http")) {
    showStatus("error", "❌ URL must start with https:// or http://");
    return;
  }

  showStatus("info", "🔗 Opening cluster URL in new tab. Accept the certificate if prompted, then close the tab and save your cluster.");

  // Open URL in new tab so user can accept the certificate
  chrome.tabs.create({ url: url, active: true });
});

document.getElementById("save-btn").addEventListener("click", () => {
  const name     = document.getElementById("f-name").value.trim();
  const url      = document.getElementById("f-url").value.trim();
  const user     = document.getElementById("f-user").value.trim();
  const password = document.getElementById("f-password").value;
  const role     = document.getElementById("f-role").value.trim();
  const group    = document.getElementById("f-group").value.trim();

  if (!name || !url || !user || !password) {
    showStatus("error", "❌ All fields are required");
    return;
  }
  if (!url.startsWith("http")) {
    showStatus("error", "❌ URL must start with https://");
    return;
  }

  chrome.storage.local.get("clusters", ({ clusters = [] }) => {
    const newCluster = { name, url, user, password };
    if (role) newCluster.role = role;
    if (group) newCluster.group = group;

    clusters.push(newCluster);
    chrome.storage.local.set({ clusters }, () => {
      document.getElementById("add-form").style.display = "none";
      document.getElementById("add-btn").style.display  = "block";
      ["f-name","f-url","f-user","f-password","f-role","f-group"].forEach(id => {
        const el = document.getElementById(id);
        if (el.tagName === 'SELECT') el.selectedIndex = 0;
        else el.value = "";
      });
      clearFormState(); // Clear saved state after successful save
      loadClusters();
      showStatus("success", `✅ ${name} added!`);
    });
  });
});

// ── Settings ──────────────────────────────────────────
function loadSettings() {
  chrome.storage.local.get("settings", ({ settings = {} }) => {
    document.getElementById("toggle-auto").checked         = settings.autoLogin       || false;
    document.getElementById("toggle-confirm").checked      = settings.confirm         !== false; // default true
    document.getElementById("toggle-newtab").checked       = settings.newTab          !== false; // default true
    document.getElementById("toggle-background").checked   = settings.backgroundTabs  !== false; // default true
    document.getElementById("toggle-sequential").checked   = settings.sequentialTabs  || false;  // default false
  });
}

function saveSetting(key, value) {
  chrome.storage.local.get("settings", ({ settings = {} }) => {
    settings[key] = value;
    chrome.storage.local.set({ settings });
  });
}

document.getElementById("toggle-auto").addEventListener("change",        e => saveSetting("autoLogin",      e.target.checked));
document.getElementById("toggle-confirm").addEventListener("change",    e => saveSetting("confirm",        e.target.checked));
document.getElementById("toggle-newtab").addEventListener("change",     e => saveSetting("newTab",         e.target.checked));
document.getElementById("toggle-background").addEventListener("change", e => saveSetting("backgroundTabs", e.target.checked));
document.getElementById("toggle-sequential").addEventListener("change", e => saveSetting("sequentialTabs", e.target.checked));

// ── Search / Filter ───────────────────────────────────
document.getElementById("search-clusters").addEventListener("input", (e) => {
  const query = e.target.value.toLowerCase();
  const items = document.querySelectorAll(".cluster-item, .cluster-group");

  items.forEach(item => {
    if (item.classList.contains("cluster-group")) {
      // For groups, check if any cluster in the group matches
      const groupName = item.querySelector(".group-name")?.textContent.toLowerCase() || "";
      const clusterCards = item.querySelectorAll(".cluster-item");
      let hasMatch = groupName.includes(query);

      clusterCards.forEach(card => {
        const name = card.querySelector(".cluster-name")?.textContent.toLowerCase() || "";
        const url = card.querySelector(".cluster-url")?.textContent.toLowerCase() || "";
        if (name.includes(query) || url.includes(query)) hasMatch = true;
      });

      item.style.display = hasMatch ? "" : "none";
    } else {
      // For individual cluster items
      const name = item.querySelector(".cluster-name")?.textContent.toLowerCase() || "";
      const url = item.querySelector(".cluster-url")?.textContent.toLowerCase() || "";
      item.style.display = (name.includes(query) || url.includes(query)) ? "" : "none";
    }
  });
});

// ── Bulk Actions ──────────────────────────────────────
function updateBulkActionsBar() {
  const checkboxes = document.querySelectorAll(".cluster-checkbox:checked");
  const bar = document.getElementById("bulk-delete-bar");
  const count = document.getElementById("selected-count");

  if (checkboxes.length > 0) {
    bar.style.display = "block";
    count.textContent = checkboxes.length;
  } else {
    bar.style.display = "none";
  }
}

document.getElementById("bulk-delete-btn").addEventListener("click", () => {
  const checkboxes = document.querySelectorAll(".cluster-checkbox:checked");
  if (checkboxes.length === 0) return;

  if (!confirm(`Delete ${checkboxes.length} cluster(s)? This cannot be undone.`)) return;

  chrome.storage.local.get("clusters", ({ clusters = [] }) => {
    const indices = Array.from(checkboxes).map(cb => parseInt(cb.dataset.index)).sort((a, b) => b - a);
    indices.forEach(i => clusters.splice(i, 1));
    chrome.storage.local.set({ clusters }, () => {
      loadClusters();
      showStatus("success", `✅ Deleted ${indices.length} cluster(s)`);
    });
  });
});

// ── Drag and Drop Reordering ──────────────────────────
let draggedElement = null;
let draggedIndex = null;

function handleDragStart(e) {
  e.stopPropagation(); // Prevent group from also dragging
  draggedElement = e.currentTarget;
  draggedIndex = parseInt(draggedElement.dataset.index);
  draggedElement.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";

  const target = e.currentTarget;
  if (target !== draggedElement && target.classList.contains("cluster-item")) {
    target.classList.add("drag-over");
  }
}

function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();

  const target = e.currentTarget;
  target.classList.remove("drag-over");

  if (target === draggedElement || !target.classList.contains("cluster-item")) return;

  const targetIndex = parseInt(target.dataset.index);

  chrome.storage.local.get("clusters", ({ clusters = [] }) => {
    const [movedCluster] = clusters.splice(draggedIndex, 1);
    clusters.splice(targetIndex, 0, movedCluster);
    chrome.storage.local.set({ clusters }, loadClusters);
  });
}

function handleDragEnd(e) {
  e.currentTarget.classList.remove("dragging");
  document.querySelectorAll(".cluster-item").forEach(el => el.classList.remove("drag-over"));
}

// ── Drag and Drop for Groups ──────────────────────────
let draggedGroup = null;

function handleGroupDragStart(e) {
  // Only allow dragging from the header, not from cluster items inside
  if (e.target.closest(".cluster-item")) {
    e.preventDefault();
    return;
  }

  draggedGroup = e.currentTarget;
  draggedGroup.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
}

function handleGroupDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";

  const target = e.currentTarget;
  if (target !== draggedGroup && target.classList.contains("cluster-group")) {
    target.classList.add("drag-over");
  }
}

function handleGroupDrop(e) {
  e.preventDefault();
  e.stopPropagation();

  const target = e.currentTarget;
  target.classList.remove("drag-over");

  if (target === draggedGroup || !target.classList.contains("cluster-group")) return;

  // Get all groups in current display order
  const allGroups = Array.from(document.querySelectorAll(".cluster-group"));
  const draggedIndex = allGroups.indexOf(draggedGroup);
  const targetIndex = allGroups.indexOf(target);

  if (draggedIndex === -1 || targetIndex === -1) return;

  // Reorder in DOM
  if (draggedIndex < targetIndex) {
    target.parentNode.insertBefore(draggedGroup, target.nextSibling);
  } else {
    target.parentNode.insertBefore(draggedGroup, target);
  }

  // Update storage order - we need to rebuild the clusters array based on new group order
  chrome.storage.local.get("clusters", ({ clusters = [] }) => {
    const newGroups = Array.from(document.querySelectorAll(".cluster-group, .cluster-item:not(.cluster-group .cluster-item)"));
    const newClusters = [];

    newGroups.forEach(element => {
      if (element.classList.contains("cluster-group")) {
        // It's a group - add all its clusters
        const clusterItems = element.querySelectorAll(".cluster-item");
        clusterItems.forEach(item => {
          const idx = parseInt(item.dataset.index);
          if (!isNaN(idx) && clusters[idx]) {
            newClusters.push(clusters[idx]);
          }
        });
      } else {
        // It's a standalone cluster
        const idx = parseInt(element.dataset.index);
        if (!isNaN(idx) && clusters[idx]) {
          newClusters.push(clusters[idx]);
        }
      }
    });

    chrome.storage.local.set({ clusters: newClusters });
  });
}

function handleGroupDragEnd(e) {
  e.currentTarget.classList.remove("dragging");
  document.querySelectorAll(".cluster-group").forEach(el => el.classList.remove("drag-over"));
}

// ── Init ──────────────────────────────────────────────
loadClusters();
loadSettings();
restoreFormState(); // Restore form data if user was adding a cluster
setupFormAutosave(); // Auto-save form changes

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
    role:     c.role     || "",
    group:    c.group    || "",   // RDR group — Jenkins job ID
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
        if (key === "role")     current.role     = val;
        if (key === "group")    current.group    = val;
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

      // ── Bug fix: switch to clusters tab and re-render so user sees results immediately
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
      document.querySelector('.tab[data-tab="clusters"]').classList.add("active");
      document.getElementById("tab-clusters").classList.add("active");

      loadClusters(); // Re-render cluster list

      const msg = skipped > 0
        ? `✅ Imported ${added} cluster(s). Skipped ${skipped} duplicate(s).`
        : `✅ Imported ${added} cluster(s) successfully!`;
      showStatus("success", msg); // Show in clusters tab status
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

    // Export all fields including role and group
    const exportData = clusters.map(({ name, url, user, password, role, group }) => {
      const cluster = { name, url, user, password };
      if (role) cluster.role = role;
      if (group) cluster.group = group;
      return cluster;
    });

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
