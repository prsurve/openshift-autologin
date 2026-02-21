// content.js — injected into every page
// Detects OpenShift login page and auto-fills credentials if enabled

(function () {

  // ── Check if this is an OpenShift login page ──────────
  // Works on both the console login page AND the OAuth server page
  function isOpenShiftLoginPage() {
    const hasUser   = !!document.querySelector("#inputUsername");
    const hasPass   = !!document.querySelector("#inputPassword");
    const hasSubmit = !!document.querySelector("button[type='submit'], input[type='submit']");
    const isIdpPage = !!document.querySelector(".idp-link, [class*='idp'], a[href*='oauth']");
    return (hasUser && hasPass && hasSubmit) || isIdpPage;
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

    return clusters.find(c => {
      try {
        const clusterHost = new URL(c.url).hostname;

        // Direct prefix match
        if (window.location.href.startsWith(c.url)) return true;

        // Match by shared base domain (everything after first subdomain segment)
        // console-openshift-console.apps.dev.ex.com → apps.dev.ex.com
        const clusterBase = clusterHost.split(".").slice(1).join(".");
        const currentBase = currentHost.split(".").slice(1).join(".");

        return clusterBase.length > 0 && clusterBase === currentBase;
      } catch {
        return false;
      }
    }) || null;
  }

  // ── Main auto-detect logic ────────────────────────────
  function run() {
    if (!isOpenShiftLoginPage()) return;

    chrome.storage.local.get(["clusters", "settings"], ({ clusters = [], settings = {} }) => {
      if (!settings.autoLogin) return;

      const cluster = matchCluster(clusters);
      if (!cluster) return;

      if (settings.confirm !== false) {
        showConfirmBanner(cluster.name, cluster.user, cluster.password);
      } else {
        handleIdpAndFill(cluster.user, cluster.password);
      }
    });
  }

  // Run after page settles
  setTimeout(run, 800);

})();
