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
  function matchCluster(clusters) {
    const currentHost = window.location.hostname;
    const currentUrl = window.location.href;

    console.log("[Auto-Login Content] Matching against", clusters.length, "clusters");

    const match = clusters.find(c => {
      try {
        const clusterHost = new URL(c.url).hostname;

        // Direct prefix match
        if (currentUrl.startsWith(c.url)) {
          console.log("[Auto-Login Content] Direct URL match for", c.name);
          return true;
        }

        // Match by shared base domain (everything after first subdomain segment)
        // console-openshift-console.apps.dev.ex.com → apps.dev.ex.com
        // oauth-openshift.apps.dev.ex.com → apps.dev.ex.com
        const clusterParts = clusterHost.split(".");
        const currentParts = currentHost.split(".");

        // For apps domains like "apps.example.com", match if current URL contains it
        if (clusterHost.includes(".apps.") && currentHost.includes(".apps.")) {
          // Extract the apps domain: console-openshift-console.apps.dev.example.com → apps.dev.example.com
          const clusterAppsIndex = clusterParts.findIndex(p => p === "apps");
          const currentAppsIndex = currentParts.findIndex(p => p === "apps");

          if (clusterAppsIndex >= 0 && currentAppsIndex >= 0) {
            const clusterAppsDomain = clusterParts.slice(clusterAppsIndex).join(".");
            const currentAppsDomain = currentParts.slice(currentAppsIndex).join(".");

            if (clusterAppsDomain === currentAppsDomain) {
              console.log("[Auto-Login Content] Apps domain match for", c.name, ":", clusterAppsDomain);
              return true;
            }
          }
        }

        // Fallback: match by shared base domain
        const clusterBase = clusterParts.slice(1).join(".");
        const currentBase = currentParts.slice(1).join(".");

        if (clusterBase.length > 0 && clusterBase === currentBase) {
          console.log("[Auto-Login Content] Base domain match for", c.name, ":", clusterBase);
          return true;
        }

        return false;
      } catch (err) {
        console.log("[Auto-Login Content] Error matching cluster", c.name, ":", err);
        return false;
      }
    }) || null;

    return match;
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

    chrome.storage.local.get(["clusters", "settings"], ({ clusters = [], settings = {} }) => {
      console.log("[Auto-Login Content] Settings:", settings);
      console.log("[Auto-Login Content] Auto-login enabled:", settings.autoLogin);

      if (!settings.autoLogin) {
        console.log("[Auto-Login Content] Auto-login is disabled in settings");
        return;
      }

      const cluster = matchCluster(clusters);
      console.log("[Auto-Login Content] Matched cluster:", cluster);

      if (!cluster) {
        console.log("[Auto-Login Content] No matching cluster found for this URL");
        console.log("[Auto-Login Content] Available clusters:", clusters.map(c => c.url));
        return;
      }

      console.log("[Auto-Login Content] Match found! Cluster:", cluster.name);

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

})();
