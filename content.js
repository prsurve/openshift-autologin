// content.js — injected into every page
// Detects OpenShift login page and auto-fills credentials if enabled

(function () {

  // ── Check if this is an OpenShift login page ──────────
  // Works on both the console login page AND the OAuth server page
  function isOpenShiftLoginPage() {
    // Check for login form fields
    const hasUser   = !!document.querySelector("#inputUsername");
    const hasPass   = !!document.querySelector("#inputPassword");
    const hasSubmit = !!document.querySelector("button[type='submit'], input[type='submit']");

    // Check for IDP selection page
    const isIdpPage = !!document.querySelector(".idp-link, [class*='idp'], a[href*='oauth']");

    // Check URL patterns for OpenShift OAuth pages
    const url = window.location.href;
    const isOAuthUrl = url.includes("oauth-openshift") ||
                       url.includes("/oauth/") ||
                       (url.includes("/login") && url.includes("openshift"));

    // Check page title
    const title = document.title.toLowerCase();
    const hasOSTitle = title.includes("openshift") && (title.includes("login") || title.includes("log in"));

    console.log("[Auto-Login Content] Detection details:", {
      hasUser, hasPass, hasSubmit, isIdpPage, isOAuthUrl, hasOSTitle,
      url, title
    });

    return (hasUser && hasPass && hasSubmit) || isIdpPage || (isOAuthUrl && (hasUser || isIdpPage)) || hasOSTitle;
  }

  // ── Native value setter (bypasses React/Angular) ──────
  function setFieldValue(field, value) {
    field.focus();
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, "value"
    ).set;
    nativeSetter.call(field, value);
    field.dispatchEvent(new Event("input",  { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    field.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
  }

  // ── Fill credentials and submit ───────────────────────
  function fillCredentials(user, password) {
    const userField = document.querySelector("#inputUsername");
    const passField = document.querySelector("#inputPassword");
    const submitBtn = document.querySelector("button[type='submit']") ||
                      document.querySelector("input[type='submit']");

    if (!userField || !passField) return false;

    setFieldValue(userField, user);
    setFieldValue(passField, password);

    if (submitBtn) submitBtn.click();
    return true;
  }

  // ── Capture manual login credentials ──────────────────
  let captureRetries = 0;
  function captureManualLogin() {
    const userField = document.querySelector("#inputUsername");
    const passField = document.querySelector("#inputPassword");
    const submitBtn = document.querySelector("button[type='submit']") ||
                      document.querySelector("input[type='submit']");

    if (!userField || !passField || !submitBtn) {
      captureRetries++;
      if (captureRetries < 20) { // Max 10 seconds (20 * 500ms)
        console.log("[Auto-Login Content] Capture: Form fields not found, retry", captureRetries);
        setTimeout(captureManualLogin, 500);
      } else {
        console.log("[Auto-Login Content] Capture: Gave up after", captureRetries, "retries");
      }
      return;
    }

    console.log("[Auto-Login Content] Setting up credential capture listeners");

    // Intercept form submission to capture credentials
    const captureCredentials = () => {
      const username = userField.value.trim();
      const password = passField.value;

      if (username && password) {
        // Use chrome.storage.local instead of sessionStorage to persist across OAuth redirects
        chrome.storage.local.set({
          "os-captured-username": username,
          "os-captured-password": password,
          "os-captured-url": window.location.origin,
          "os-captured-timestamp": Date.now()
        }, () => {
          console.log("[Auto-Login Content] ✅ Captured login credentials:", {
            username,
            url: window.location.origin
          });

          // Re-enable auto-login for this cluster immediately upon manual login attempt
          // This ensures auto-login works again after user fixes their credentials
          chrome.storage.local.get("clusters", ({ clusters = [] }) => {
            // Use the same matching logic to find the cluster
            const matchedCluster = matchCluster(clusters);
            if (matchedCluster && matchedCluster.autoLoginDisabled) {
              const clusterIndex = clusters.findIndex(c => c.url === matchedCluster.url);
              if (clusterIndex !== -1) {
                const clusterName = clusters[clusterIndex].name;
                delete clusters[clusterIndex].autoLoginDisabled;
                chrome.storage.local.set({ clusters }, () => {
                  console.log(`[Auto-Login Content] ✅ Re-enabled auto-login for ${clusterName} - manual login detected`);
                  // Show success toast after a short delay (wait for page to redirect)
                  setTimeout(() => showSuccessToast(clusterName), 1500);
                });
              }
            }
          });
        });
      }
    };

    // Listen to submit button click
    submitBtn.addEventListener("click", captureCredentials);

    // Also listen to form submit event
    const form = submitBtn.closest("form");
    if (form) {
      form.addEventListener("submit", captureCredentials);
    }

    // Also listen to Enter key on password field
    passField.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        captureCredentials();
      }
    });
  }

  // ── Handle IDP selection screen then fill ─────────────
  function handleIdpAndFill(user, password) {
    // Look for IDP provider links/buttons (htpasswd, Local, LDAP etc.)
    const allEls = [...document.querySelectorAll("a, button")];
    const idpBtn = allEls.find(el => {
      const txt  = (el.textContent || "").toLowerCase();
      const href = (el.getAttribute("href") || "").toLowerCase();
      return txt.includes("htpasswd") || txt.includes("local") ||
             href.includes("htpasswd") || href.includes("idp") ||
             el.classList.contains("idp-link");
    });

    if (idpBtn) {
      idpBtn.click();
      // Poll until login form appears after IDP navigation
      let attempts = 0;
      const iv = setInterval(() => {
        attempts++;
        const hasForm = document.querySelector("#inputUsername") && document.querySelector("#inputPassword");
        if (hasForm) {
          clearInterval(iv);
          setTimeout(() => fillCredentials(user, password), 300);
        }
        if (attempts > 40) clearInterval(iv); // give up after ~12s
      }, 300);
    } else {
      // Already on the login form directly
      fillCredentials(user, password);
    }
  }

  // ── Show error banner for failed login ────────────────
  function showErrorBanner(clusterName) {
    // Remove any existing banners first
    const existingBanner = document.getElementById("os-autologin-error-banner");
    if (existingBanner) existingBanner.remove();

    const banner = document.createElement("div");
    banner.id = "os-autologin-error-banner";
    banner.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0;
      background: #2e1a1a; color: #ffcccc;
      padding: 12px 20px;
      display: flex; align-items: center; justify-content: space-between;
      font-family: Arial, sans-serif; font-size: 13px;
      border-bottom: 3px solid #ff4444;
      z-index: 999999; box-shadow: 0 2px 10px rgba(0,0,0,0.5);
      animation: slideDown 0.3s ease-out;
    `;

    banner.innerHTML = `
      <style>
        @keyframes slideDown {
          from { transform: translateY(-100%); }
          to { transform: translateY(0); }
        }
      </style>
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="font-size:24px;">⚠️</div>
        <div>
          <div style="font-weight:bold;color:#ff6666;">Auto-Login Failed: <span style="color:#ffaaaa;">${clusterName}</span></div>
          <div style="font-size:11px;color:#cc9999;">Saved password is incorrect. Auto-login disabled for this cluster.</div>
        </div>
      </div>
      <button id="os-error-dismiss" style="
        background:#ff4444;color:white;border:none;border-radius:6px;
        padding:7px 16px;cursor:pointer;font-size:12px;font-weight:bold;">
        ✕ Dismiss
      </button>
    `;

    document.body.prepend(banner);

    document.getElementById("os-error-dismiss").addEventListener("click", () => banner.remove());

    // Auto-dismiss after 10 seconds
    setTimeout(() => { if (banner.parentNode) banner.remove(); }, 10000);
  }

  // ── Show success toast for re-enabled auto-login ───────
  function showSuccessToast(clusterName) {
    const toast = document.createElement("div");
    toast.style.cssText = `
      position: fixed; top: 20px; right: 20px;
      background: #1a3a1a; color: #6bffb4;
      padding: 12px 20px;
      border-radius: 8px;
      font-family: Arial, sans-serif; font-size: 13px;
      border: 2px solid #6bffb4;
      z-index: 999999; box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      font-weight: bold;
      animation: slideInRight 0.3s ease-out;
    `;

    toast.innerHTML = `
      <style>
        @keyframes slideInRight {
          from { transform: translateX(400px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      </style>
      ✅ Auto-login re-enabled for "${clusterName}"
    `;

    document.body.appendChild(toast);

    // Fade out and remove
    setTimeout(() => {
      toast.style.transition = "opacity 0.5s";
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 500);
    }, 3000);
  }

  // ── Show confirmation banner ──────────────────────────
  function showConfirmBanner(clusterName, user, password) {
    if (document.getElementById("os-autologin-banner")) return;

    const banner = document.createElement("div");
    banner.id = "os-autologin-banner";
    banner.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0;
      background: #1a1a2e; color: #eee;
      padding: 12px 20px;
      display: flex; align-items: center; justify-content: space-between;
      font-family: Arial, sans-serif; font-size: 13px;
      border-bottom: 3px solid #EE0000;
      z-index: 999999; box-shadow: 0 2px 10px rgba(0,0,0,0.5);
    `;

    banner.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;">
        <img src="${chrome.runtime.getURL('icon48.png')}" width="28" height="28" style="border-radius:50%;" />
        <div>
          <div style="font-weight:bold;">OpenShift Auto-Login: <span style="color:#EE0000;">${clusterName}</span></div>
          <div style="font-size:11px;color:#888;">User: ${user}</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;">
        <button id="os-login-yes" style="
          background:#EE0000;color:white;border:none;border-radius:6px;
          padding:7px 16px;cursor:pointer;font-weight:bold;font-size:12px;">
          ✅ Login
        </button>
        <button id="os-login-no" style="
          background:#333;color:#eee;border:none;border-radius:6px;
          padding:7px 16px;cursor:pointer;font-size:12px;">
          ✕ Dismiss
        </button>
      </div>
    `;

    document.body.prepend(banner);

    document.getElementById("os-login-yes").addEventListener("click", () => {
      handleIdpAndFill(user, password);
      banner.remove();
    });
    document.getElementById("os-login-no").addEventListener("click", () => banner.remove());

    // Auto-dismiss after 15 seconds
    setTimeout(() => { if (banner.parentNode) banner.remove(); }, 15000);
  }

  // ── Match current page to a saved cluster ─────────────
  // Matches by shared apps domain so OAuth redirects are detected
  // e.g. console-openshift-console.apps.dev.example.com
  //  and oauth-openshift.apps.dev.example.com  → same cluster
  // IMPORTANT: Returns the MOST SPECIFIC match to handle nested domains correctly
  function matchCluster(clusters) {
    const currentHost = window.location.hostname;
    const currentUrl = window.location.href;
    const currentParts = currentHost.split(".");
    const currentAppsCount = currentParts.filter(p => p === "apps").length;

    console.log("[Auto-Login Content] Matching against", clusters.length, "clusters");
    console.log("[Auto-Login Content] Current hostname:", currentHost);
    console.log("[Auto-Login Content] Current URL:", currentUrl);
    console.log("[Auto-Login Content] Number of 'apps' segments in current URL:", currentAppsCount);

    // Check sessionStorage for the source cluster URL (set when user clicks Login)
    let sourceClusterUrl = sessionStorage.getItem("os-autologin-source");
    console.log("[Auto-Login Content] Source cluster from session:", sourceClusterUrl);

    // CRITICAL: On OAuth pages, extract the redirect_uri parameter to determine source cluster
    // This is essential when multiple clusters share the same OAuth server
    if ((currentHost.startsWith("oauth-") || currentUrl.includes("/oauth/")) && !sourceClusterUrl) {
      try {
        const url = new URL(currentUrl);
        // Check for redirect_uri in URL params
        let redirectUri = url.searchParams.get("redirect_uri");

        // If not found, check inside the 'then' parameter (which contains the full OAuth authorize URL)
        if (!redirectUri) {
          const then = url.searchParams.get("then");
          if (then) {
            // Parse the 'then' parameter which is a relative URL like /oauth/authorize?...
            const thenParams = new URLSearchParams(then.includes("?") ? then.split("?")[1] : "");
            redirectUri = thenParams.get("redirect_uri");
          }
        }

        if (redirectUri) {
          // Decode the redirect_uri (it's usually URL-encoded)
          const decodedRedirectUri = decodeURIComponent(redirectUri);
          console.log("[Auto-Login Content] Found redirect_uri from OAuth URL:", decodedRedirectUri);

          // Extract the console hostname from redirect_uri
          const redirectHost = new URL(decodedRedirectUri).hostname;
          console.log("[Auto-Login Content] Redirect hostname:", redirectHost);

          // Find cluster that matches this redirect hostname
          const matchingCluster = clusters.find(c => {
            try {
              return new URL(c.url).hostname === redirectHost;
            } catch { return false; }
          });

          if (matchingCluster) {
            sourceClusterUrl = matchingCluster.url;
            sessionStorage.setItem("os-autologin-source", sourceClusterUrl);
            console.log("[Auto-Login Content] Stored source cluster from OAuth redirect_uri:", sourceClusterUrl);
          }
        }
      } catch (e) {
        console.log("[Auto-Login Content] Could not parse OAuth redirect_uri:", e);
      }
    }

    // Collect all potential matches with their specificity score
    const matches = [];

    clusters.forEach(c => {
      try {
        const clusterHost = new URL(c.url).hostname;

        // If we have a source cluster URL and this matches, give it highest priority
        if (sourceClusterUrl && c.url === sourceClusterUrl) {
          console.log("[Auto-Login Content] Source cluster match (from session) for", c.name);
          matches.push({ cluster: c, specificity: 20000 });
          return;
        }

        // Direct hostname match (exact match)
        if (currentHost === clusterHost) {
          console.log("[Auto-Login Content] Exact hostname match for", c.name);
          matches.push({ cluster: c, specificity: 10000 });
          return;
        }

        // Direct URL prefix match
        if (currentUrl.startsWith(c.url)) {
          console.log("[Auto-Login Content] Direct URL prefix match for", c.name);
          matches.push({ cluster: c, specificity: 9000 + c.url.length });
          return;
        }

        const clusterParts = clusterHost.split(".");
        const currentParts = currentHost.split(".");

        // Count number of "apps" segments in both domains
        const clusterAppsCount = clusterParts.filter(p => p === "apps").length;
        const currentAppsCount = currentParts.filter(p => p === "apps").length;

        // Check if current page is an OAuth redirect page
        const isOAuthPage = currentHost.startsWith("oauth-") || currentHost.includes("-oauth") || currentUrl.includes("/oauth/");

        // For nested apps domains, we need to match on the ENTIRE cluster identifier
        // e.g., console.apps.farm2-dr1-c3.apps.se350-farm-cluster2...
        // The unique identifier is everything from FIRST "apps" onward
        // This ensures console.apps.X.apps.Y only matches oauth.apps.X.apps.Y
        if (clusterHost.includes(".apps.") && currentHost.includes(".apps.")) {
          // Extract full apps domain from first occurrence
          const clusterAppsIndex = clusterParts.findIndex(p => p === "apps");
          const currentAppsIndex = currentParts.findIndex(p => p === "apps");

          if (clusterAppsIndex >= 0 && currentAppsIndex >= 0) {
            // Full domain from first "apps" to end
            const clusterAppsDomain = clusterParts.slice(clusterAppsIndex).join(".");
            const currentAppsDomain = currentParts.slice(currentAppsIndex).join(".");

            // STRICT MATCH: Apps domains must be exactly equal AND same number of "apps" segments
            // IMPORTANT: On OAuth pages without sessionStorage, SKIP this rule for simpler domains
            // This prevents oauth.apps.Y from matching console.apps.Y when we have console.apps.X.apps.Y clusters
            if (clusterAppsDomain === currentAppsDomain && clusterAppsCount === currentAppsCount) {
              // If we're on an OAuth page and don't have sessionStorage, we need to be more careful
              // Skip this match if there are other clusters with MORE "apps" segments that could have redirected here
              if (isOAuthPage && !sourceClusterUrl && currentAppsCount === 1) {
                const hasNestedClusters = clusters.some(otherCluster => {
                  try {
                    const otherHost = new URL(otherCluster.url).hostname;
                    const otherParts = otherHost.split(".");
                    const otherAppsCount = otherParts.filter(p => p === "apps").length;
                    const otherLastAppsIndex = otherParts.lastIndexOf("apps");
                    const otherLastAppsDomain = otherParts.slice(otherLastAppsIndex).join(".");
                    return otherAppsCount > 1 && otherLastAppsDomain === currentAppsDomain;
                  } catch { return false; }
                });

                if (hasNestedClusters) {
                  console.log("[Auto-Login Content] Skipping Apps domain match for", c.name, "because nested clusters exist for this OAuth domain");
                  // Fall through to OAuth matching logic below
                } else {
                  console.log("[Auto-Login Content] Apps domain match for", c.name, ":", clusterAppsDomain);
                  const hostnameMatch = currentHost === clusterHost ? 2000 : 0;
                  matches.push({ cluster: c, specificity: 5000 + clusterAppsDomain.length + (clusterAppsCount * 100) + hostnameMatch });
                  return;
                }
              } else {
                console.log("[Auto-Login Content] Apps domain match for", c.name, ":", clusterAppsDomain);
                // Higher specificity for longer (more specific) domains
                // Extra bonus for clusters with more "apps" segments (more specific)
                // HUGE bonus for exact hostname match (console-openshift-console matches exactly)
                const hostnameMatch = currentHost === clusterHost ? 2000 : 0;
                matches.push({ cluster: c, specificity: 5000 + clusterAppsDomain.length + (clusterAppsCount * 100) + hostnameMatch });
                return;
              }
            }

            // OAuth redirect handling for nested domains
            // When console.apps.X.apps.Y redirects, it may go to oauth.apps.Y (losing the nested part)
            // In this case, we should ONLY match if we don't have a source cluster from session
            if (!sourceClusterUrl && (currentHost.startsWith("oauth-") || currentHost.includes("oauth"))) {
              // For nested apps domains, extract the LAST apps domain portion
              const clusterLastAppsIndex = clusterParts.lastIndexOf("apps");
              const currentLastAppsIndex = currentParts.lastIndexOf("apps");

              if (clusterLastAppsIndex >= 0 && currentLastAppsIndex >= 0) {
                const clusterLastAppsDomain = clusterParts.slice(clusterLastAppsIndex).join(".");
                const currentLastAppsDomain = currentParts.slice(currentLastAppsIndex).join(".");

                if (clusterLastAppsDomain === currentLastAppsDomain) {
                  console.log("[Auto-Login Content] OAuth nested apps domain match for", c.name, ":", clusterLastAppsDomain);
                  // PREFER more nested clusters (more apps segments = more specific)
                  // When user has both apps.Y and apps.X.apps.Y, prefer the nested one
                  // Give bonus for MORE apps segments instead of penalty
                  matches.push({ cluster: c, specificity: 4000 + clusterLastAppsDomain.length + (clusterAppsCount * 200) });
                  return;
                }
              }
            }
          }
        }

      } catch (err) {
        console.log("[Auto-Login Content] Error matching cluster", c.name, ":", err);
      }
    });

    // Return the most specific match (highest specificity score)
    if (matches.length === 0) {
      console.log("[Auto-Login Content] No matches found");
      return null;
    }

    matches.sort((a, b) => b.specificity - a.specificity);
    const bestMatch = matches[0];

    console.log("[Auto-Login Content] Best match:", bestMatch.cluster.name, "with specificity:", bestMatch.specificity);
    console.log("[Auto-Login Content] Best match URL:", bestMatch.cluster.url);
    if (matches.length > 1) {
      console.log("[Auto-Login Content] Other potential matches:", matches.slice(1).map(m => `${m.cluster.name} (${m.specificity}) - ${m.cluster.url}`));
    }

    return bestMatch.cluster;
  }

  // ── Main auto-detect logic ────────────────────────────
  function run() {
    console.log("[Auto-Login Content] Running detection...");
    console.log("[Auto-Login Content] Current URL:", window.location.href);

    const isLoginPage = isOpenShiftLoginPage();
    console.log("[Auto-Login Content] Is login page:", isLoginPage);

    if (!isLoginPage) {
      console.log("[Auto-Login Content] Not a login page, skipping");
      return;
    }

    // Set up credential capture for manual login
    captureManualLogin();

    chrome.storage.local.get(["clusters", "settings"], ({ clusters = [], settings = {} }) => {
      console.log("[Auto-Login Content] Settings:", settings);
      console.log("[Auto-Login Content] Auto-login enabled:", settings.autoLogin);

      if (!settings.autoLogin) {
        console.log("[Auto-Login Content] Auto-login is disabled in settings");
        return;
      }

      // Before matching, check if we're on a console URL (not OAuth) and store it
      // This helps track the source cluster before OAuth redirects strip nested domains
      const currentUrl = window.location.href;
      const currentHost = window.location.hostname;

      // If we're on a console page (not OAuth), try to find exact match and store it
      if (currentHost.includes("console-openshift-console") && !sessionStorage.getItem("os-autologin-source")) {
        const exactMatch = clusters.find(c => {
          try {
            return currentUrl.startsWith(c.url) || currentHost === new URL(c.url).hostname;
          } catch { return false; }
        });

        if (exactMatch) {
          sessionStorage.setItem("os-autologin-source", exactMatch.url);
          console.log("[Auto-Login Content] Stored source cluster for OAuth tracking:", exactMatch.url);
        }
      }

      const cluster = matchCluster(clusters);
      console.log("[Auto-Login Content] Matched cluster:", cluster);

      if (!cluster) {
        console.log("[Auto-Login Content] No matching cluster found for this URL");
        console.log("[Auto-Login Content] Available clusters:", clusters.map(c => c.url));
        return;
      }

      console.log("[Auto-Login Content] Match found! Cluster:", cluster.name);

      // Check if we're on an authentication error page (login failed)
      if (currentUrl.includes("reason=authentication_error") || currentUrl.includes("error=login_failed")) {
        console.log("[Auto-Login Content] ⚠️ Authentication error detected - login failed for", cluster.name);
        console.log("[Auto-Login Content] Disabling auto-login for this cluster to prevent retry loop");

        // Show error banner to notify user
        showErrorBanner(cluster.name);

        // Find this cluster in storage and disable auto-login
        chrome.storage.local.get("clusters", ({ clusters = [] }) => {
          const clusterIndex = clusters.findIndex(c => c.url === cluster.url);
          if (clusterIndex !== -1) {
            clusters[clusterIndex].autoLoginDisabled = true;
            chrome.storage.local.set({ clusters }, () => {
              console.log(`[Auto-Login Content] ❌ Auto-login disabled for ${cluster.name} due to authentication error`);
              console.log(`[Auto-Login Content] Please update credentials and login manually to re-enable`);
            });
          }
        });
        return;
      }

      // Check if auto-login is disabled for this cluster (e.g., due to previous login failure)
      if (cluster.autoLoginDisabled) {
        console.log("[Auto-Login Content] Auto-login is disabled for this cluster due to previous login failure");
        console.log("[Auto-Login Content] Please update credentials and login manually to re-enable auto-login");
        return;
      }

      if (settings.confirm !== false) {
        console.log("[Auto-Login Content] Showing confirmation banner");
        showConfirmBanner(cluster.name, cluster.user, cluster.password);
      } else {
        console.log("[Auto-Login Content] Auto-filling without confirmation");
        handleIdpAndFill(cluster.user, cluster.password);
      }
    });
  }

  // Run after page settles, with retry logic
  let attempts = 0;
  const maxAttempts = 5;

  function tryRun() {
    attempts++;
    console.log(`[Auto-Login Content] Attempt ${attempts}/${maxAttempts}`);

    // Check if we already ran successfully (banner exists)
    if (document.getElementById("os-autologin-banner")) {
      console.log("[Auto-Login Content] Banner already shown, stopping");
      return;
    }

    run();

    // Retry if login form hasn't appeared yet
    if (attempts < maxAttempts && !isOpenShiftLoginPage()) {
      console.log("[Auto-Login Content] Login form not found yet, retrying in 1s...");
      setTimeout(tryRun, 1000);
    }
  }

  // Start after initial page load
  setTimeout(tryRun, 800);

  // ═══════════════════════════════════════════════════════
  // SAVE CLUSTER FROM CONSOLE PAGE
  // ═══════════════════════════════════════════════════════

  // Detect if we're on an OpenShift console page (not login page)
  function isOpenShiftConsolePage() {
    const url = window.location.href;
    const hostname = window.location.hostname;
    const title = document.title.toLowerCase();

    // Check for console patterns
    const isConsoleHostname = hostname.includes("console-openshift-console") ||
                               hostname.includes("console.apps");

    const isConsoleUrl = url.includes("/k8s/") ||
                          url.includes("/dashboards/") ||
                          url.includes("/overview/") ||
                          url.includes("/project/");

    const isConsoleTitle = title.includes("openshift") && !title.includes("login");

    const hasConsoleUI = !!document.querySelector('[class*="pf-c-page"], [class*="co-m-"], [class*="oc-"]');

    return (isConsoleHostname || isConsoleUrl || (isConsoleTitle && hasConsoleUI));
  }

  // Show banner to save cluster
  function showSaveClusterBanner() {
    if (document.getElementById("os-save-cluster-banner")) return;

    const banner = document.createElement("div");
    banner.id = "os-save-cluster-banner";
    banner.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0;
      background: #1a1a2e; color: #eee;
      padding: 12px 20px;
      display: flex; align-items: center; justify-content: space-between;
      font-family: Arial, sans-serif; font-size: 13px;
      border-bottom: 3px solid #EE0000;
      z-index: 999999; box-shadow: 0 2px 10px rgba(0,0,0,0.5);
    `;

    banner.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;">
        <img src="${chrome.runtime.getURL('icon48.png')}" width="28" height="28" style="border-radius:50%;" />
        <div>
          <div style="font-weight:bold;">This cluster is not saved in OpenShift Auto-Login</div>
          <div style="font-size:11px;color:#888;">Click to add and enable auto-login</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;">
        <button id="os-save-add" style="
          background:#EE0000;color:white;border:none;border-radius:6px;
          padding:7px 16px;cursor:pointer;font-weight:bold;font-size:12px;">
          ➕ Add Cluster
        </button>
        <button id="os-save-dismiss" style="
          background:#333;color:#eee;border:none;border-radius:6px;
          padding:7px 16px;cursor:pointer;font-size:12px;">
          ✕ Dismiss
        </button>
      </div>
    `;

    document.body.prepend(banner);

    document.getElementById("os-save-add").addEventListener("click", () => {
      banner.remove();
      showSaveClusterForm();
    });

    document.getElementById("os-save-dismiss").addEventListener("click", () => {
      banner.remove();
      sessionStorage.setItem("os-save-dismissed", "true");
    });

    // Auto-dismiss after 20 seconds
    setTimeout(() => { if (banner.parentNode) banner.remove(); }, 20000);
  }

  // Show form to save cluster
  function showSaveClusterForm() {
    if (document.getElementById("os-save-cluster-form")) return;

    const overlay = document.createElement("div");
    overlay.id = "os-save-cluster-form";
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.8); z-index: 9999999;
      display: flex; align-items: center; justify-content: center;
      font-family: Arial, sans-serif;
    `;

    const currentUrl = window.location.origin;
    const suggestedName = window.location.hostname.split('.')[0];

    // Get captured credentials and existing groups
    chrome.storage.local.get([
      "clusters",
      "os-captured-username",
      "os-captured-password",
      "os-captured-timestamp"
    ], (data) => {
      const clusters = data.clusters || [];

      // Check if captured credentials are recent (within last 2 minutes)
      const capturedAge = Date.now() - (data["os-captured-timestamp"] || 0);
      const isRecent = capturedAge < 120000; // 2 minutes

      const capturedUsername = isRecent ? (data["os-captured-username"] || "") : "";
      const capturedPassword = isRecent ? (data["os-captured-password"] || "") : "";

      console.log("[Auto-Login Content] Pre-filling form:", {
        hasUsername: !!capturedUsername,
        hasPassword: !!capturedPassword,
        age: Math.round(capturedAge / 1000) + "s",
        username: capturedUsername
      });

      const preFilledNote = (capturedUsername && capturedPassword) ?
        `<div style="background:#1a3a1a;border:1px solid #2a4a2a;border-radius:6px;padding:8px;margin-bottom:16px;">
          <div style="font-size:11px;color:#6bffb4;">✅ Pre-filled with login credentials</div>
        </div>` : '';
      const existingGroups = [...new Set(clusters.filter(c => c.group).map(c => c.group))].sort();

      let groupOptions = '<option value="">No Group</option>';
      existingGroups.forEach(group => {
        groupOptions += `<option value="${group}">${group}</option>`;
      });
      groupOptions += '<option value="__new__">➕ Create New Group...</option>';

      overlay.innerHTML = `
        <div style="
          background: #1a1a2e; border-radius: 12px; padding: 24px;
          width: 450px; max-width: 90%; box-shadow: 0 4px 20px rgba(0,0,0,0.5);
          border: 2px solid #EE0000; max-height: 90vh; overflow-y: auto;
        ">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
            <img src="${chrome.runtime.getURL('icon48.png')}" width="40" height="40" style="border-radius:50%;" />
            <div>
              <div style="font-size:18px;font-weight:bold;color:#eee;">Add Cluster</div>
              <div style="font-size:11px;color:#888;">Save credentials for auto-login</div>
            </div>
          </div>

          ${preFilledNote}

          <div style="margin-bottom:16px;">
            <label style="display:block;font-size:12px;color:#aaa;margin-bottom:6px;">Cluster Name</label>
            <input id="os-save-name" type="text" value="${suggestedName}"
              style="width:100%;background:#0d0d1a;border:1px solid #333;border-radius:6px;
                     padding:10px;color:#eee;font-size:13px;box-sizing:border-box;" />
          </div>

          <div style="margin-bottom:16px;">
            <label style="display:block;font-size:12px;color:#aaa;margin-bottom:6px;">Console URL</label>
            <input id="os-save-url" type="text" value="${currentUrl}" readonly
              style="width:100%;background:#0d0d1a;border:1px solid #333;border-radius:6px;
                     padding:10px;color:#888;font-size:13px;box-sizing:border-box;" />
          </div>

          <div style="margin-bottom:16px;">
            <label style="display:block;font-size:12px;color:#aaa;margin-bottom:6px;">Username</label>
            <input id="os-save-user" type="text" placeholder="Enter username" value="${capturedUsername}"
              style="width:100%;background:#0d0d1a;border:1px solid #333;border-radius:6px;
                     padding:10px;color:#eee;font-size:13px;box-sizing:border-box;" />
          </div>

          <div style="margin-bottom:16px;">
            <label style="display:block;font-size:12px;color:#aaa;margin-bottom:6px;">Password</label>
            <input id="os-save-password" type="password" placeholder="Enter password" value="${capturedPassword}"
              style="width:100%;background:#0d0d1a;border:1px solid #333;border-radius:6px;
                     padding:10px;color:#eee;font-size:13px;box-sizing:border-box;" />
          </div>

          <div style="margin-bottom:16px;">
            <label style="display:block;font-size:12px;color:#aaa;margin-bottom:6px;">Group (Optional)</label>
            <select id="os-save-group"
              style="width:100%;background:#0d0d1a;border:1px solid #333;border-radius:6px;
                     padding:10px;color:#eee;font-size:13px;box-sizing:border-box;cursor:pointer;">
              ${groupOptions}
            </select>
            <input id="os-save-new-group" type="text" placeholder="Enter new group name"
              style="width:100%;background:#0d0d1a;border:1px solid #333;border-radius:6px;
                     padding:10px;color:#eee;font-size:13px;box-sizing:border-box;margin-top:8px;display:none;" />
          </div>

          <div style="margin-bottom:20px;">
            <label style="display:block;font-size:12px;color:#aaa;margin-bottom:6px;">Role (Optional)</label>
            <input id="os-save-role" type="text" placeholder="e.g., admin, developer, viewer"
              style="width:100%;background:#0d0d1a;border:1px solid #333;border-radius:6px;
                     padding:10px;color:#eee;font-size:13px;box-sizing:border-box;" />
          </div>

          <div style="display:flex;gap:10px;">
            <button id="os-save-confirm" style="
              flex:1;background:#EE0000;color:white;border:none;border-radius:6px;
              padding:12px;cursor:pointer;font-weight:bold;font-size:14px;">
              ✅ Save Cluster
            </button>
            <button id="os-save-cancel" style="
              flex:1;background:#333;color:#eee;border:none;border-radius:6px;
              padding:12px;cursor:pointer;font-size:14px;">
              ✕ Cancel
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      // Handle group selection
      const groupSelect = document.getElementById("os-save-group");
      const newGroupInput = document.getElementById("os-save-new-group");

      groupSelect.addEventListener("change", () => {
        if (groupSelect.value === "__new__") {
          newGroupInput.style.display = "block";
          newGroupInput.focus();
        } else {
          newGroupInput.style.display = "none";
        }
      });

      // Focus on appropriate field - cluster name if credentials pre-filled, username otherwise
      setTimeout(() => {
        if (capturedUsername && capturedPassword) {
          document.getElementById("os-save-name").focus();
        } else {
          document.getElementById("os-save-user").focus();
        }
      }, 100);

      // Handle save
      document.getElementById("os-save-confirm").addEventListener("click", () => {
        const name = document.getElementById("os-save-name").value.trim();
        const url = document.getElementById("os-save-url").value.trim();
        const user = document.getElementById("os-save-user").value.trim();
        const password = document.getElementById("os-save-password").value;
        const role = document.getElementById("os-save-role").value.trim();

        let group = groupSelect.value;
        if (group === "__new__") {
          group = newGroupInput.value.trim();
        } else if (group === "") {
          group = undefined;
        }

        if (!name || !user || !password) {
          alert("Please fill in all required fields (Name, Username, Password)");
          return;
        }

        chrome.storage.local.get("clusters", ({ clusters = [] }) => {
          const newCluster = { name, url, user, password };
          if (group) newCluster.group = group;
          if (role) newCluster.role = role;

          clusters.push(newCluster);
          chrome.storage.local.set({ clusters }, () => {
            // Clear captured credentials from session
            chrome.storage.local.remove([
              "os-captured-username",
              "os-captured-password",
              "os-captured-url",
              "os-captured-timestamp"
            ]);

            overlay.remove();
            showSaveSuccessBanner(name);
          });
        });
      });

      // Handle cancel
      document.getElementById("os-save-cancel").addEventListener("click", () => {
        // Clear captured credentials from session
        sessionStorage.removeItem("os-captured-username");
        sessionStorage.removeItem("os-captured-password");
        sessionStorage.removeItem("os-captured-url");

        overlay.remove();
      });

      // Handle enter key
      ["os-save-name", "os-save-user", "os-save-password", "os-save-role"].forEach(id => {
        document.getElementById(id).addEventListener("keypress", (e) => {
          if (e.key === "Enter") {
            document.getElementById("os-save-confirm").click();
          }
        });
      });

      // Close on overlay click (not form click)
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
          // Clear captured credentials from session
          sessionStorage.removeItem("os-captured-username");
          sessionStorage.removeItem("os-captured-password");
          sessionStorage.removeItem("os-captured-url");

          overlay.remove();
        }
      });
    });
  }

  // Show success banner after saving
  function showSaveSuccessBanner(clusterName) {
    const banner = document.createElement("div");
    banner.style.cssText = `
      position: fixed; top: 20px; right: 20px;
      background: #1a3a3a; color: #6bffb4;
      padding: 16px 20px;
      border-radius: 8px;
      font-family: Arial, sans-serif; font-size: 14px;
      border: 2px solid #6bffb4;
      z-index: 9999999; box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      font-weight: bold;
    `;

    banner.innerHTML = `✅ Cluster "${clusterName}" saved successfully!`;
    document.body.appendChild(banner);

    setTimeout(() => {
      banner.style.transition = "opacity 0.5s";
      banner.style.opacity = "0";
      setTimeout(() => banner.remove(), 500);
    }, 3000);
  }

  // Check if we should show the save banner
  function checkAndShowSaveBanner() {
    // Don't show if already dismissed in this session
    if (sessionStorage.getItem("os-save-dismissed") === "true") return;

    // Don't show on login pages
    if (isOpenShiftLoginPage()) return;

    // Check if we're on a console page
    if (!isOpenShiftConsolePage()) return;

    const currentUrl = window.location.origin;

    chrome.storage.local.get("clusters", ({ clusters = [] }) => {
      // Check if this cluster is already saved
      const exists = clusters.some(c => {
        try {
          return new URL(c.url).origin === currentUrl;
        } catch {
          return false;
        }
      });

      if (!exists) {
        showSaveClusterBanner();
      }
    });
  }

  // Check after successful login (when credentials were captured and we're back on console)
  function checkAfterLogin() {
    // Only check on console pages
    if (!isOpenShiftConsolePage()) return;

    chrome.storage.local.get([
      "clusters",
      "os-captured-username",
      "os-captured-password",
      "os-captured-timestamp"
    ], (data) => {
      const capturedUsername = data["os-captured-username"];
      const capturedPassword = data["os-captured-password"];
      const capturedTimestamp = data["os-captured-timestamp"] || 0;

      // Check if credentials are recent (within last 2 minutes)
      const age = Date.now() - capturedTimestamp;
      const isRecent = age < 120000; // 2 minutes

      console.log("[Auto-Login Content] Checking after login:", {
        hasCredentials: !!capturedUsername && !!capturedPassword,
        age: Math.round(age / 1000) + "s",
        isRecent
      });

      // If we captured credentials recently and we're now on a console page
      if (capturedUsername && capturedPassword && isRecent) {
        const currentUrl = window.location.origin;
        const clusters = data.clusters || [];

        // Check if this cluster is already saved
        const exists = clusters.some(c => {
          try {
            return new URL(c.url).origin === currentUrl;
          } catch {
            return false;
          }
        });

        if (!exists && sessionStorage.getItem("os-save-dismissed") !== "true") {
          // Auto-show the save form with pre-filled credentials
          console.log("[Auto-Login Content] Auto-showing save form with captured credentials");
          setTimeout(() => showSaveClusterForm(), 1000);
        } else {
          // Cluster already exists - check if we need to re-enable auto-login
          const matchingClusterIndex = clusters.findIndex(c => {
            try {
              return new URL(c.url).origin === currentUrl;
            } catch {
              return false;
            }
          });

          if (matchingClusterIndex !== -1 && clusters[matchingClusterIndex].autoLoginDisabled) {
            // Re-enable auto-login after successful manual login
            delete clusters[matchingClusterIndex].autoLoginDisabled;
            chrome.storage.local.set({ clusters }, () => {
              console.log(`[Auto-Login Content] ✅ Re-enabled auto-login for ${clusters[matchingClusterIndex].name} after successful manual login`);
            });
          }

          // Clear captured credentials
          console.log("[Auto-Login Content] Cluster exists or dismissed, clearing captured credentials");
          chrome.storage.local.remove([
            "os-captured-username",
            "os-captured-password",
            "os-captured-url",
            "os-captured-timestamp"
          ]);
        }
      } else if (capturedUsername && !isRecent) {
        // Credentials are too old, clear them
        console.log("[Auto-Login Content] Captured credentials expired, clearing");
        chrome.storage.local.remove([
          "os-captured-username",
          "os-captured-password",
          "os-captured-url",
          "os-captured-timestamp"
        ]);
      }
    });
  }

  // Run check after page loads
  setTimeout(() => {
    checkAfterLogin(); // Check if we just logged in manually
    checkAndShowSaveBanner(); // Check if we should show the save banner
  }, 2000);

})();
