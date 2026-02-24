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
