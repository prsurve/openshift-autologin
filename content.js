// content.js — injected into every page
// Detects OpenShift and vSphere/vCenter login pages and auto-fills credentials if enabled

(function () {

  // ── Safe Chrome API Wrapper ────────────────────────────
  // Gracefully handles "Extension context invalidated" errors
  function safeStorageGet(keys, callback) {
    try {
      if (!chrome.runtime?.id) {
        console.log('[Auto-Login] Extension context invalidated, skipping storage get');
        return;
      }
      chrome.storage.local.get(keys, (result) => {
        if (chrome.runtime.lastError) {
          console.log('[Auto-Login] Storage get error:', chrome.runtime.lastError.message);
          return;
        }
        callback(result);
      });
    } catch (error) {
      console.log('[Auto-Login] Extension context invalidated:', error.message);
    }
  }

  function safeStorageSet(items, callback) {
    try {
      if (!chrome.runtime?.id) {
        console.log('[Auto-Login] Extension context invalidated, skipping storage set');
        return;
      }
      chrome.storage.local.set(items, () => {
        if (chrome.runtime.lastError) {
          console.log('[Auto-Login] Storage set error:', chrome.runtime.lastError.message);
          return;
        }
        if (callback) callback();
      });
    } catch (error) {
      console.log('[Auto-Login] Extension context invalidated:', error.message);
    }
  }

  // ── Vendor Detection Registry ──────────────────────────
  const DETECTORS = {
    openshift: {
      selectors: {
        username: ['#inputUsername'],
        password: ['#inputPassword'],
        submit: ["button[type='submit']", "input[type='submit']"]
      },
      urlPatterns: [/oauth-openshift/, /\/oauth\//, /\/login.*openshift/],
      titlePatterns: [/openshift.*login/i, /openshift.*log in/i]
    },
    vsphere: {
      selectors: {
        username: ['#username', "input[name='username']", "input[type='text'][class*='login']", "input[id*='username']"],
        password: ['#password', "input[name='password']", "input[type='password'][class*='login']", "input[id*='password']"],
        submit: ['#submit', "button[type='submit']", "input[type='submit']", "button[class*='login']", "button[id*='submit']"]
      },
      urlPatterns: [/\/ui\//, /\/vsphere-client\//, /vcenter/i],
      titlePatterns: [/vsphere.*client/i, /vcenter/i, /vmware.*login/i, /vsphere.*login/i]
    }
  };

  // ── Check if this is an OpenShift login page ──────────
  // Works on both the console login page AND the OAuth server page
  function isOpenShiftLoginPage() {
    // Check for login form fields
    const hasUser   = !!document.querySelector('#inputUsername');
    const hasPass   = !!document.querySelector('#inputPassword');
    const hasSubmit = !!document.querySelector("button[type='submit'], input[type='submit']");

    // Check for IDP selection page
    const isIdpPage = !!document.querySelector(".idp-link, [class*='idp'], a[href*='oauth']");

    // Check URL patterns for OpenShift OAuth pages
    const url = window.location.href;
    const isOAuthUrl = url.includes('oauth-openshift') ||
                       url.includes('/oauth/') ||
                       (url.includes('/login') && url.includes('openshift'));

    // Check page title
    const title = document.title.toLowerCase();
    const hasOSTitle = title.includes('openshift') && (title.includes('login') || title.includes('log in'));

    console.log('[Auto-Login Content] Detection details:', {
      hasUser, hasPass, hasSubmit, isIdpPage, isOAuthUrl, hasOSTitle,
      url, title
    });

    return (hasUser && hasPass && hasSubmit) || isIdpPage || (isOAuthUrl && (hasUser || isIdpPage)) || hasOSTitle;
  }

  // ── Check if this is a vSphere/vCenter login page ──────
  function isVSphereLoginPage() {
    const detector = DETECTORS.vsphere;

    // Check for login form fields (try multiple selectors)
    let hasUser = false;
    let hasPass = false;
    let hasSubmit = false;

    for (const sel of detector.selectors.username) {
      if (document.querySelector(sel)) {
        hasUser = true;
        break;
      }
    }

    for (const sel of detector.selectors.password) {
      if (document.querySelector(sel)) {
        hasPass = true;
        break;
      }
    }

    for (const sel of detector.selectors.submit) {
      if (document.querySelector(sel)) {
        hasSubmit = true;
        break;
      }
    }

    // Check URL patterns
    const url = window.location.href;
    const hasVSphereUrl = detector.urlPatterns.some(pattern => pattern.test(url));

    // Check page title
    const title = document.title.toLowerCase();
    const hasVSphereTitle = detector.titlePatterns.some(pattern => pattern.test(title));

    console.log('[Auto-Login Content] vSphere detection details:', {
      hasUser, hasPass, hasSubmit, hasVSphereUrl, hasVSphereTitle,
      url, title
    });

    return (hasUser && hasPass && hasSubmit) || hasVSphereUrl || hasVSphereTitle;
  }

  // ── Detect vendor type (openshift, vsphere, or null) ──
  function detectVendor() {
    if (isOpenShiftLoginPage()) {
      return 'openshift';
    }
    if (isVSphereLoginPage()) {
      return 'vsphere';
    }
    return null;
  }

  // ── Native value setter (bypasses React/Angular) ──────
  function setFieldValue(field, value) {
    field.focus();
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    ).set;
    nativeSetter.call(field, value);
    field.dispatchEvent(new Event('input',  { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    field.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
  }

  // ── Fill credentials and submit ───────────────────────
  function fillCredentials(user, password, vendor = 'openshift') {
    const detector = DETECTORS[vendor];

    if (!detector) {
      console.error(`[Auto-Login Content] Unknown vendor: ${vendor}`);
      return false;
    }

    // Find fields using vendor-specific selectors
    let userField = null;
    let passField = null;
    let submitBtn = null;

    for (const sel of detector.selectors.username) {
      userField = document.querySelector(sel);
      if (userField) break;
    }

    for (const sel of detector.selectors.password) {
      passField = document.querySelector(sel);
      if (passField) break;
    }

    for (const sel of detector.selectors.submit) {
      submitBtn = document.querySelector(sel);
      if (submitBtn) break;
    }

    if (!userField || !passField) {
      console.log(`[Auto-Login Content] ${vendor} login fields not found`);
      return false;
    }

    console.log(`[Auto-Login Content] Filling ${vendor} credentials`);

    setFieldValue(userField, user);
    setFieldValue(passField, password);

    if (submitBtn) submitBtn.click();
    return true;
  }

  // ── Capture manual login credentials ──────────────────
  let captureRetries = 0;
  function captureManualLogin() {
    // Detect vendor to use correct selectors
    const vendor = detectVendor();
    if (!vendor) {
      console.log('[Auto-Login Content] Capture: Not a login page, skipping credential capture');
      return;
    }

    const detector = DETECTORS[vendor];

    // Find fields using vendor-specific selectors
    let userField = null;
    let passField = null;
    let submitBtn = null;

    for (const sel of detector.selectors.username) {
      userField = document.querySelector(sel);
      if (userField) break;
    }

    for (const sel of detector.selectors.password) {
      passField = document.querySelector(sel);
      if (passField) break;
    }

    for (const sel of detector.selectors.submit) {
      submitBtn = document.querySelector(sel);
      if (submitBtn) break;
    }

    if (!userField || !passField || !submitBtn) {
      captureRetries++;
      if (captureRetries < 20) { // Max 10 seconds (20 * 500ms)
        console.log('[Auto-Login Content] Capture: Form fields not found, retry', captureRetries);
        setTimeout(captureManualLogin, 500);
      } else {
        console.log('[Auto-Login Content] Capture: Gave up after', captureRetries, 'retries');
      }
      return;
    }

    console.log(`[Auto-Login Content] Setting up ${vendor} credential capture listeners`);

    // Intercept form submission to capture credentials
    const captureCredentials = () => {
      const username = userField.value.trim();
      const password = passField.value;

      if (username && password) {
        // Use chrome.storage.local instead of sessionStorage to persist across OAuth redirects
        safeStorageSet({
          'os-captured-username': username,
          'os-captured-password': password,
          'os-captured-url': window.location.origin,
          'os-captured-timestamp': Date.now(),
          'os-captured-vendor': vendor
        }, () => {
          console.log('[Auto-Login Content] ✅ Captured login credentials:', {
            username,
            url: window.location.origin,
            vendor
          });

          // Re-enable auto-login for this cluster immediately upon manual login attempt
          // This ensures auto-login works again after user fixes their credentials
          safeStorageGet('clusters', ({ clusters = [] }) => {
            // Use the same matching logic to find the cluster
            const matchedCluster = matchCluster(clusters);
            if (matchedCluster) {
              const sessionKey = `os-autologin-disabled-${matchedCluster.url}`;

              // Clear sessionStorage flag immediately
              sessionStorage.removeItem(sessionKey);
              console.log(`[Auto-Login Content] Cleared sessionStorage disable flag for ${matchedCluster.name}`);

              if (matchedCluster.autoLoginDisabled) {
                const clusterIndex = clusters.findIndex(c => c.url === matchedCluster.url);
                if (clusterIndex !== -1) {
                  const clusterName = clusters[clusterIndex].name;
                  delete clusters[clusterIndex].autoLoginDisabled;
                  safeStorageSet({ clusters }, () => {
                    console.log(`[Auto-Login Content] ✅ Re-enabled auto-login for ${clusterName} - manual login detected`);
                    // Show success toast after a short delay (wait for page to redirect)
                    setTimeout(() => showSuccessToast(clusterName), 1500);
                  });
                }
              }
            }
          });
        });
      }
    };

    // Listen to submit button click
    submitBtn.addEventListener('click', captureCredentials);

    // Also listen to form submit event
    const form = submitBtn.closest('form');
    if (form) {
      form.addEventListener('submit', captureCredentials);
    }

    // Also listen to Enter key on password field
    passField.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        captureCredentials();
      }
    });
  }

  // ── Handle IDP selection screen then fill ─────────────
  function handleIdpAndFill(user, password, vendor = 'openshift') {
    // vSphere typically doesn't have IDP selection - fill directly
    if (vendor === 'vsphere') {
      fillCredentials(user, password, 'vsphere');
      return;
    }

    // OpenShift IDP selection logic
    // Look for IDP provider links/buttons (htpasswd, Local, LDAP etc.)
    const allEls = [...document.querySelectorAll('a, button')];
    const idpBtn = allEls.find(el => {
      const txt  = (el.textContent || '').toLowerCase();
      const href = (el.getAttribute('href') || '').toLowerCase();
      return txt.includes('htpasswd') || txt.includes('local') ||
             href.includes('htpasswd') || href.includes('idp') ||
             el.classList.contains('idp-link');
    });

    if (idpBtn) {
      idpBtn.click();
      // Poll until login form appears after IDP navigation
      let attempts = 0;
      const iv = setInterval(() => {
        attempts++;
        const hasForm = document.querySelector('#inputUsername') && document.querySelector('#inputPassword');
        if (hasForm) {
          clearInterval(iv);
          setTimeout(() => fillCredentials(user, password, vendor), 300);
        }
        if (attempts > 40) clearInterval(iv); // give up after ~12s
      }, 300);
    } else {
      // Already on the login form directly
      fillCredentials(user, password, vendor);
    }
  }

  // ── Show error banner for failed login ────────────────
  function showErrorBanner(clusterName) {
    // Remove any existing banners first
    const existingBanner = document.getElementById('os-autologin-error-banner');
    if (existingBanner) existingBanner.remove();

    const banner = document.createElement('div');
    banner.id = 'os-autologin-error-banner';
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

    document.getElementById('os-error-dismiss').addEventListener('click', () => banner.remove());

    // Auto-dismiss after 10 seconds
    setTimeout(() => { if (banner.parentNode) banner.remove(); }, 10000);
  }

  // ── Show banner for missing cluster ───────────────────
  function showMissingClusterBanner(appsDomain) {
    // Remove any existing banners first
    const existingBanner = document.getElementById('os-missing-cluster-banner');
    if (existingBanner) return; // Already shown

    const banner = document.createElement('div');
    banner.id = 'os-missing-cluster-banner';
    banner.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0;
      background: #2e2a1a; color: #ffeecc;
      padding: 12px 20px;
      display: flex; align-items: center; justify-content: space-between;
      font-family: Arial, sans-serif; font-size: 13px;
      border-bottom: 3px solid #ff9900;
      z-index: 999999; box-shadow: 0 2px 10px rgba(0,0,0,0.5);
      animation: slideDown 0.3s ease-out;
    `;

    // Extract a simple name from the apps domain (e.g., "f10-c1" from "apps.f10-c1.apps.f10l040...")
    const parts = appsDomain.split('.');
    const clusterName = parts[1] || appsDomain; // Get the part right after "apps."

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
          <div style="font-weight:bold;color:#ffaa66;">Cluster Not Found: <span style="color:#ffcc99;">${clusterName}</span></div>
          <div style="font-size:11px;color:#ccaa88;">This cluster is not saved. Please add it in the extension popup to enable auto-login.</div>
        </div>
      </div>
      <button id="os-missing-dismiss" style="
        background:#ff9900;color:#1a1a1a;border:none;border-radius:6px;
        padding:7px 16px;cursor:pointer;font-size:12px;font-weight:bold;">
        ✕ Dismiss
      </button>
    `;

    document.body.prepend(banner);

    document.getElementById('os-missing-dismiss').addEventListener('click', () => banner.remove());

    // Auto-dismiss after 15 seconds
    setTimeout(() => { if (banner.parentNode) banner.remove(); }, 15000);
  }

  // ── Show success toast for re-enabled auto-login ───────
  function showSuccessToast(clusterName) {
    const toast = document.createElement('div');
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
      toast.style.transition = 'opacity 0.5s';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 500);
    }, 3000);
  }

  // ── Show confirmation banner ──────────────────────────
  function showConfirmBanner(clusterName, user, password, vendor = 'openshift') {
    if (document.getElementById('os-autologin-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'os-autologin-banner';
    banner.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0;
      background: #1a1a2e; color: #eee;
      padding: 12px 20px;
      display: flex; align-items: center; justify-content: space-between;
      font-family: Arial, sans-serif; font-size: 13px;
      border-bottom: 3px solid #EE0000;
      z-index: 999999; box-shadow: 0 2px 10px rgba(0,0,0,0.5);
    `;

    const platformName = vendor === 'vsphere' ? 'vSphere' : 'OpenShift';

    banner.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;">
        <img src="${chrome.runtime.getURL('icon48.png')}" width="28" height="28" style="border-radius:50%;" />
        <div>
          <div style="font-weight:bold;">${platformName} Auto-Login: <span style="color:#EE0000;">${clusterName}</span></div>
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

    document.getElementById('os-login-yes').addEventListener('click', () => {
      handleIdpAndFill(user, password, vendor);
      banner.remove();
    });
    document.getElementById('os-login-no').addEventListener('click', () => banner.remove());

    // Auto-dismiss after 15 seconds
    setTimeout(() => { if (banner.parentNode) banner.remove(); }, 15000);
  }

  // ── Match vSphere/vCenter cluster ─────────────────────
  function matchVSphereCluster(clusters, currentHost, currentUrl) {
    console.log('[Auto-Login Content] vSphere matching logic');

    const matches = [];

    clusters.forEach(cluster => {
      try {
        const clusterUrl = new URL(cluster.url);
        const clusterHost = clusterUrl.hostname;

        // 1. Exact hostname match (highest priority)
        if (currentHost === clusterHost) {
          console.log(`[Auto-Login Content] Exact hostname match for ${cluster.name}`);
          matches.push({ cluster, specificity: 10000 });
          return;
        }

        // 2. URL prefix match (e.g., /ui/ vs /vsphere-client/)
        if (currentUrl.startsWith(cluster.url)) {
          console.log(`[Auto-Login Content] URL prefix match for ${cluster.name}`);
          matches.push({ cluster, specificity: 9000 + cluster.url.length });
          return;
        }

        // 3. Partial hostname match (e.g., vcenter.company.com contains vcenter)
        if (currentHost.includes(clusterHost) || clusterHost.includes(currentHost)) {
          console.log(`[Auto-Login Content] Partial hostname match for ${cluster.name}`);
          matches.push({ cluster, specificity: 5000 });
          return;
        }

      } catch (err) {
        console.log(`[Auto-Login Content] Error matching cluster ${cluster.name}:`, err);
      }
    });

    // Return highest specificity match
    if (matches.length === 0) {
      console.log('[Auto-Login Content] No vSphere matches found');
      return null;
    }

    matches.sort((a, b) => b.specificity - a.specificity);
    const bestMatch = matches[0];

    console.log(`[Auto-Login Content] Best vSphere match: ${bestMatch.cluster.name} (specificity: ${bestMatch.specificity})`);
    if (matches.length > 1) {
      console.log('[Auto-Login Content] Other potential matches:', matches.slice(1).map(m => `${m.cluster.name} (${m.specificity})`));
    }

    return bestMatch.cluster;
  }

  // ── Match current page to a saved cluster ─────────────
  // Matches by shared apps domain so OAuth redirects are detected
  // e.g. console-openshift-console.apps.dev.example.com
  //  and oauth-openshift.apps.dev.example.com  → same cluster
  // IMPORTANT: Returns the MOST SPECIFIC match to handle nested domains correctly
  function matchCluster(clusters) {
    const currentHost = window.location.hostname;
    const currentUrl = window.location.href;

    // Detect vendor type (openshift, vsphere)
    const vendor = detectVendor();
    console.log('[Auto-Login Content] Detected vendor:', vendor);

    // Filter clusters by vendor type (only match clusters of the same type as current page)
    const vendorClusters = clusters.filter(c => (c.type || 'openshift') === vendor);

    console.log('[Auto-Login Content] Matching against', vendorClusters.length, `${vendor} clusters (filtered from ${clusters.length} total)`);
    console.log('[Auto-Login Content] Current hostname:', currentHost);
    console.log('[Auto-Login Content] Current URL:', currentUrl);

    // Route to vendor-specific matching logic
    if (vendor === 'vsphere') {
      return matchVSphereCluster(vendorClusters, currentHost, currentUrl);
    }

    // OpenShift matching logic (existing code)
    const currentParts = currentHost.split('.');
    const currentAppsCount = currentParts.filter(p => p === 'apps').length;

    console.log("[Auto-Login Content] Number of 'apps' segments in current URL:", currentAppsCount);

    // Check sessionStorage for the source cluster URL (set when user clicks Login)
    let sourceClusterUrl = sessionStorage.getItem('os-autologin-source');
    console.log('[Auto-Login Content] Source cluster from session:', sourceClusterUrl);

    // Collect all potential matches with their specificity score
    const matches = [];

    // CRITICAL: On OAuth pages, extract the redirect_uri parameter to determine source cluster
    // This is essential when multiple clusters share the same OAuth server
    if ((currentHost.startsWith('oauth-') || currentUrl.includes('/oauth/')) && !sourceClusterUrl) {
      try {
        const url = new URL(currentUrl);
        // Check for redirect_uri in URL params
        let redirectUri = url.searchParams.get('redirect_uri');

        // If not found, check inside the 'then' parameter (which contains the full OAuth authorize URL)
        if (!redirectUri) {
          const then = url.searchParams.get('then');
          if (then) {
            // Parse the 'then' parameter which is a relative URL like /oauth/authorize?...
            const thenParams = new URLSearchParams(then.includes('?') ? then.split('?')[1] : '');
            redirectUri = thenParams.get('redirect_uri');
          }
        }

        if (redirectUri) {
          // Decode the redirect_uri (it's usually URL-encoded)
          const decodedRedirectUri = decodeURIComponent(redirectUri);
          console.log('[Auto-Login Content] Found redirect_uri from OAuth URL:', decodedRedirectUri);

          // Extract the console hostname from redirect_uri
          const redirectHost = new URL(decodedRedirectUri).hostname;
          console.log('[Auto-Login Content] Redirect hostname:', redirectHost);

          // Extract apps domain from redirect hostname
          // e.g., console-openshift-console.apps.f10-c1.apps.f10l040.abc.tadn.xyz.com
          //    -> apps.f10-c1.apps.f10l040.abc.tadn.xyz.com
          const redirectParts = redirectHost.split('.');
          const redirectAppsIndex = redirectParts.findIndex(p => p === 'apps');
          const redirectAppsDomain = redirectAppsIndex >= 0 ? redirectParts.slice(redirectAppsIndex).join('.') : null;

          console.log('[Auto-Login Content] Redirect apps domain:', redirectAppsDomain);

          // Log all clusters and their apps domains for debugging
          console.log('[Auto-Login Content] All OpenShift clusters:');
          vendorClusters.forEach(c => {
            try {
              const clusterHost = new URL(c.url).hostname;
              const clusterParts = clusterHost.split('.');
              const clusterAppsIndex = clusterParts.findIndex(p => p === 'apps');
              const clusterAppsDomain = clusterAppsIndex >= 0 ? clusterParts.slice(clusterAppsIndex).join('.') : null;
              console.log(`  - ${c.name}: URL=${c.url}, hostname=${clusterHost}, apps domain=${clusterAppsDomain}`);
            } catch (e) {
              console.log(`  - ${c.name}: URL=${c.url}, ERROR: ${e.message}`);
            }
          });

          // Find cluster that matches this apps domain
          const matchingCluster = redirectAppsDomain ? vendorClusters.find(c => {
            try {
              const clusterHost = new URL(c.url).hostname;
              const clusterParts = clusterHost.split('.');
              const clusterAppsIndex = clusterParts.findIndex(p => p === 'apps');
              const clusterAppsDomain = clusterAppsIndex >= 0 ? clusterParts.slice(clusterAppsIndex).join('.') : null;

              console.log(`[Auto-Login Content] Checking cluster ${c.name}: apps domain = ${clusterAppsDomain}, match = ${clusterAppsDomain === redirectAppsDomain}`);

              // Match if apps domains are identical
              return clusterAppsDomain === redirectAppsDomain;
            } catch { return false; }
          }) : null;

          if (matchingCluster) {
            sourceClusterUrl = matchingCluster.url;
            sessionStorage.setItem('os-autologin-source', sourceClusterUrl);
            console.log('[Auto-Login Content] ✅ Matched cluster from redirect_uri:', matchingCluster.name, matchingCluster.url);

            // CRITICAL: Use this cluster immediately for THIS request (don't wait for sessionStorage)
            // Give it maximum specificity so it always wins
            matches.push({ cluster: matchingCluster, specificity: 30000 });
          } else {
            console.log('[Auto-Login Content] ⚠️ No cluster found matching redirect apps domain:', redirectAppsDomain);
            console.log('[Auto-Login Content] ⚠️ Blocking auto-login to prevent using wrong cluster credentials');

            // CRITICAL: Block all other matches to prevent using wrong cluster credentials
            // When redirect_uri points to a cluster we don't have saved (e.g., f10-c1),
            // we should NOT fall back to a similar cluster (e.g., f10 base cluster)
            // Set a flag to block auto-login for this page load
            sessionStorage.setItem('os-autologin-blocked-missing-cluster', redirectAppsDomain);
          }
        }
      } catch (e) {
        console.log('[Auto-Login Content] Could not parse OAuth redirect_uri:', e);
      }
    }

    vendorClusters.forEach(c => {
      try {
        const clusterHost = new URL(c.url).hostname;

        // If we have a source cluster URL and this matches, give it highest priority
        if (sourceClusterUrl && c.url === sourceClusterUrl) {
          console.log('[Auto-Login Content] Source cluster match (from session) for', c.name);
          matches.push({ cluster: c, specificity: 20000 });
          return;
        }

        // Direct hostname match (exact match)
        if (currentHost === clusterHost) {
          console.log('[Auto-Login Content] Exact hostname match for', c.name);
          matches.push({ cluster: c, specificity: 10000 });
          return;
        }

        // Direct URL prefix match
        if (currentUrl.startsWith(c.url)) {
          console.log('[Auto-Login Content] Direct URL prefix match for', c.name);
          matches.push({ cluster: c, specificity: 9000 + c.url.length });
          return;
        }

        const clusterParts = clusterHost.split('.');
        const currentParts = currentHost.split('.');

        // Count number of "apps" segments in both domains
        const clusterAppsCount = clusterParts.filter(p => p === 'apps').length;
        const currentAppsCount = currentParts.filter(p => p === 'apps').length;

        // Check if current page is an OAuth redirect page
        const isOAuthPage = currentHost.startsWith('oauth-') || currentHost.includes('-oauth') || currentUrl.includes('/oauth/');

        // For nested apps domains, we need to match on the ENTIRE cluster identifier
        // e.g., console.apps.farm2-dr1-c3.apps.se350-farm-cluster2...
        // The unique identifier is everything from FIRST "apps" onward
        // This ensures console.apps.X.apps.Y only matches oauth.apps.X.apps.Y
        if (clusterHost.includes('.apps.') && currentHost.includes('.apps.')) {
          // Extract full apps domain from first occurrence
          const clusterAppsIndex = clusterParts.findIndex(p => p === 'apps');
          const currentAppsIndex = currentParts.findIndex(p => p === 'apps');

          if (clusterAppsIndex >= 0 && currentAppsIndex >= 0) {
            // Full domain from first "apps" to end
            const clusterAppsDomain = clusterParts.slice(clusterAppsIndex).join('.');
            const currentAppsDomain = currentParts.slice(currentAppsIndex).join('.');

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
                    const otherParts = otherHost.split('.');
                    const otherAppsCount = otherParts.filter(p => p === 'apps').length;
                    const otherLastAppsIndex = otherParts.lastIndexOf('apps');
                    const otherLastAppsDomain = otherParts.slice(otherLastAppsIndex).join('.');
                    return otherAppsCount > 1 && otherLastAppsDomain === currentAppsDomain;
                  } catch { return false; }
                });

                if (hasNestedClusters) {
                  console.log('[Auto-Login Content] Skipping Apps domain match for', c.name, 'because nested clusters exist for this OAuth domain');
                  // Fall through to OAuth matching logic below
                } else {
                  console.log('[Auto-Login Content] Apps domain match for', c.name, ':', clusterAppsDomain);
                  const hostnameMatch = currentHost === clusterHost ? 2000 : 0;
                  matches.push({ cluster: c, specificity: 5000 + clusterAppsDomain.length + (clusterAppsCount * 100) + hostnameMatch });
                  return;
                }
              } else {
                console.log('[Auto-Login Content] Apps domain match for', c.name, ':', clusterAppsDomain);
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
            if (!sourceClusterUrl && (currentHost.startsWith('oauth-') || currentHost.includes('oauth'))) {
              // For nested apps domains, extract the LAST apps domain portion
              const clusterLastAppsIndex = clusterParts.lastIndexOf('apps');
              const currentLastAppsIndex = currentParts.lastIndexOf('apps');

              if (clusterLastAppsIndex >= 0 && currentLastAppsIndex >= 0) {
                const clusterLastAppsDomain = clusterParts.slice(clusterLastAppsIndex).join('.');
                const currentLastAppsDomain = currentParts.slice(currentLastAppsIndex).join('.');

                if (clusterLastAppsDomain === currentLastAppsDomain) {
                  console.log('[Auto-Login Content] OAuth nested apps domain match for', c.name, ':', clusterLastAppsDomain);
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
        console.log('[Auto-Login Content] Error matching cluster', c.name, ':', err);
      }
    });

    // Return the most specific match (highest specificity score)
    if (matches.length === 0) {
      console.log('[Auto-Login Content] No matches found');
      return null;
    }

    matches.sort((a, b) => b.specificity - a.specificity);
    const bestMatch = matches[0];

    console.log('[Auto-Login Content] Best match:', bestMatch.cluster.name, 'with specificity:', bestMatch.specificity);
    console.log('[Auto-Login Content] Best match URL:', bestMatch.cluster.url);
    if (matches.length > 1) {
      console.log('[Auto-Login Content] Other potential matches:', matches.slice(1).map(m => `${m.cluster.name} (${m.specificity}) - ${m.cluster.url}`));
    }

    return bestMatch.cluster;
  }

  // ── Main auto-detect logic ────────────────────────────
  function run() {
    console.log('[Auto-Login Content] Running detection...');
    console.log('[Auto-Login Content] Current URL:', window.location.href);

    const vendor = detectVendor();
    console.log('[Auto-Login Content] Detected vendor:', vendor);

    if (!vendor) {
      console.log('[Auto-Login Content] Not a login page, skipping');
      return;
    }

    console.log(`[Auto-Login Content] Detected ${vendor} login page`);

    // Set up credential capture for manual login
    captureManualLogin();

    safeStorageGet(['clusters', 'settings'], ({ clusters = [], settings = {} }) => {
      console.log('[Auto-Login Content] Settings:', settings);
      console.log('[Auto-Login Content] Auto-login enabled:', settings.autoLogin);

      if (!settings.autoLogin) {
        console.log('[Auto-Login Content] Auto-login is disabled in settings');
        return;
      }

      // Before matching, check if we're on a console URL (not OAuth) and store it
      // This helps track the source cluster before OAuth redirects strip nested domains
      const currentUrl = window.location.href;
      const currentHost = window.location.hostname;

      // If we're on a console page (not OAuth), try to find exact match and store it
      if (currentHost.includes('console-openshift-console') && !sessionStorage.getItem('os-autologin-source')) {
        const exactMatch = clusters.find(c => {
          try {
            return currentUrl.startsWith(c.url) || currentHost === new URL(c.url).hostname;
          } catch { return false; }
        });

        if (exactMatch) {
          sessionStorage.setItem('os-autologin-source', exactMatch.url);
          console.log('[Auto-Login Content] Stored source cluster for OAuth tracking:', exactMatch.url);
        }
      }

      // Check if auto-login was blocked due to missing cluster
      const blockedDomain = sessionStorage.getItem('os-autologin-blocked-missing-cluster');
      if (blockedDomain) {
        console.log('[Auto-Login Content] ⛔ Auto-login blocked - redirect points to unsaved cluster');
        console.log('[Auto-Login Content] Missing cluster apps domain:', blockedDomain);
        console.log('[Auto-Login Content] Please add this cluster to enable auto-login');

        // Show a helpful banner
        showMissingClusterBanner(blockedDomain);

        // Don't clear the flag - keep it for this session to prevent retries
        return;
      }

      const cluster = matchCluster(clusters);
      console.log('[Auto-Login Content] Matched cluster:', cluster);

      if (!cluster) {
        console.log('[Auto-Login Content] No matching cluster found for this URL');
        console.log('[Auto-Login Content] Available clusters:', clusters.map(c => c.url));
        return;
      }

      console.log('[Auto-Login Content] Match found! Cluster:', cluster.name);
      console.log('[Auto-Login Content] Current URL:', currentUrl);
      console.log('[Auto-Login Content] Has authentication_error:', currentUrl.includes('reason=authentication_error'));
      console.log('[Auto-Login Content] cluster.autoLoginDisabled:', cluster.autoLoginDisabled);

      // Check if we're on an authentication error page (login failed)
      if (currentUrl.includes('reason=authentication_error') ||
          currentUrl.includes('reason=access_denied') ||
          currentUrl.includes('error=login_failed')) {
        console.log('[Auto-Login Content] ⚠️ Authentication error detected - login failed for', cluster.name);
        console.log('[Auto-Login Content] Disabling auto-login for this cluster to prevent retry loop');

        // IMMEDIATELY set sessionStorage flag to prevent any retries while chrome.storage saves
        const sessionKey = `os-autologin-disabled-${cluster.url}`;
        sessionStorage.setItem(sessionKey, 'true');

        // Show error banner to notify user
        showErrorBanner(cluster.name);

        // Find this cluster in storage and disable auto-login (permanent)
        safeStorageGet('clusters', ({ clusters = [] }) => {
          const clusterIndex = clusters.findIndex(c => c.url === cluster.url);
          if (clusterIndex !== -1) {
            clusters[clusterIndex].autoLoginDisabled = true;
            safeStorageSet({ clusters }, () => {
              console.log(`[Auto-Login Content] ❌ Auto-login disabled for ${cluster.name} due to authentication error`);
              console.log('[Auto-Login Content] Please update credentials and login manually to re-enable');
            });
          }
        });
        return;
      }

      // Check sessionStorage first (immediate check before storage loads)
      const sessionKey = `os-autologin-disabled-${cluster.url}`;
      if (sessionStorage.getItem(sessionKey) === 'true') {
        console.log('[Auto-Login Content] Auto-login temporarily disabled (sessionStorage) for this cluster');
        return;
      }

      // Check if auto-login is disabled for this cluster (e.g., due to previous login failure)
      if (cluster.autoLoginDisabled) {
        console.log('[Auto-Login Content] Auto-login is disabled for this cluster due to previous login failure');
        console.log('[Auto-Login Content] Please update credentials and login manually to re-enable auto-login');
        return;
      }

      if (settings.confirm !== false) {
        console.log('[Auto-Login Content] Showing confirmation banner');
        showConfirmBanner(cluster.name, cluster.user, cluster.password, vendor);
      } else {
        console.log('[Auto-Login Content] Auto-filling without confirmation');
        handleIdpAndFill(cluster.user, cluster.password, vendor);
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
    if (document.getElementById('os-autologin-banner')) {
      console.log('[Auto-Login Content] Banner already shown, stopping');
      return;
    }

    run();

    // Retry if login form hasn't appeared yet
    if (attempts < maxAttempts && !detectVendor()) {
      console.log('[Auto-Login Content] Login form not found yet, retrying in 1s...');
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
    const isConsoleHostname = hostname.includes('console-openshift-console') ||
                               hostname.includes('console.apps');

    const isConsoleUrl = url.includes('/k8s/') ||
                          url.includes('/dashboards/') ||
                          url.includes('/overview/') ||
                          url.includes('/project/');

    const isConsoleTitle = title.includes('openshift') && !title.includes('login');

    const hasConsoleUI = !!document.querySelector('[class*="pf-c-page"], [class*="co-m-"], [class*="oc-"]');

    return (isConsoleHostname || isConsoleUrl || (isConsoleTitle && hasConsoleUI));
  }

  // ── Detect if this is a vSphere console page ──────────
  function isVSphereConsolePage() {
    const url = window.location.href;
    const hostname = window.location.hostname;
    const title = document.title.toLowerCase();

    // Check for vSphere console patterns (not login page)
    const isVSphereUrl = (url.includes('/ui/app/') || url.includes('/vsphere-client/')) &&
                         !url.includes('/login');

    const isVSphereTitle = (title.includes('vsphere') || title.includes('vcenter')) &&
                           !title.includes('login');

    // Check for vSphere UI elements
    const hasVSphereUI = !!document.querySelector('[class*="vui-"], [class*="vsphere-"], [id*="vsphere"]');

    return (isVSphereUrl || (isVSphereTitle && hasVSphereUI));
  }

  // ── Detect if this is ANY console page (not login) ────
  function isConsolePage() {
    return isOpenShiftConsolePage() || isVSphereConsolePage();
  }

  // ── Detect vendor from console page ────────────────────
  function detectVendorFromConsolePage() {
    if (isVSphereConsolePage()) return 'vsphere';
    if (isOpenShiftConsolePage()) return 'openshift';
    return null;
  }

  // Show banner to save cluster
  function showSaveClusterBanner() {
    if (document.getElementById('os-save-cluster-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'os-save-cluster-banner';
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

    document.getElementById('os-save-add').addEventListener('click', () => {
      banner.remove();
      showSaveClusterForm();
    });

    document.getElementById('os-save-dismiss').addEventListener('click', () => {
      banner.remove();
      sessionStorage.setItem('os-save-dismissed', 'true');
    });

    // Auto-dismiss after 20 seconds
    setTimeout(() => { if (banner.parentNode) banner.remove(); }, 20000);
  }

  // Show form to save cluster
  function showSaveClusterForm() {
    if (document.getElementById('os-save-cluster-form')) return;

    const overlay = document.createElement('div');
    overlay.id = 'os-save-cluster-form';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(8px);
      z-index: 9999999;
      display: flex; align-items: center; justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      animation: fadeIn 0.2s ease;
      padding: 20px;
    `;

    // Add animation keyframes
    if (!document.getElementById('os-modal-animations')) {
      const style = document.createElement('style');
      style.id = 'os-modal-animations';
      style.textContent = `
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-30px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `;
      document.head.appendChild(style);
    }

    const hostParts = window.location.hostname.split('.');
    const appsIdx = hostParts.indexOf('apps');
    const suggestedName = (appsIdx >= 0 && appsIdx + 1 < hostParts.length)
      ? hostParts[appsIdx + 1]
      : hostParts[0];

    // Get captured credentials and existing groups
    safeStorageGet([
      'clusters',
      'os-captured-username',
      'os-captured-password',
      'os-captured-timestamp',
      'os-captured-vendor'
    ], (data) => {
      const clusters = data.clusters || [];

      // Check if captured credentials are recent (within last 2 minutes)
      const capturedAge = Date.now() - (data['os-captured-timestamp'] || 0);
      const isRecent = capturedAge < 120000; // 2 minutes

      const capturedUsername = isRecent ? (data['os-captured-username'] || '') : '';
      const capturedPassword = isRecent ? (data['os-captured-password'] || '') : '';
      const capturedVendor = isRecent ? (data['os-captured-vendor'] || null) : null;

      // Detect vendor from console page if not captured
      const detectedVendor = capturedVendor || detectVendorFromConsolePage() || 'openshift';

      // Set appropriate URL based on vendor
      let currentUrl = window.location.origin;
      if (detectedVendor === 'vsphere') {
        currentUrl = window.location.origin + '/ui/';
      }

      console.log('[Auto-Login Content] Pre-filling form:', {
        hasUsername: !!capturedUsername,
        hasPassword: !!capturedPassword,
        age: Math.round(capturedAge / 1000) + 's',
        username: capturedUsername,
        vendor: detectedVendor
      });

      const preFilledNote = (capturedUsername && capturedPassword) ?
        `<div style="background:linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);border:2px solid #6ee7b7;border-radius:10px;padding:12px;margin-bottom:18px;">
          <div style="font-size:12px;color:#065f46;font-weight:600;">✅ Pre-filled with captured credentials</div>
        </div>` : '';
      const existingGroups = [...new Set(clusters.filter(c => c.group).map(c => c.group))].sort();

      let groupOptions = '<option value="">No Group</option>';
      existingGroups.forEach(group => {
        groupOptions += `<option value="${group}">${group}</option>`;
      });
      groupOptions += '<option value="__new__">➕ Create New Group...</option>';

      overlay.innerHTML = `
        <div style="
          background: white;
          border-radius: 16px;
          width: 480px;
          max-width: 95%;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
          animation: slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        ">
          <!-- Modal Header -->
          <div style="
            background: linear-gradient(135deg, #DC2626 0%, #B91C1C 100%);
            padding: 20px 24px;
            border-radius: 16px 16px 0 0;
            display: flex;
            align-items: center;
            justify-content: space-between;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          ">
            <div style="display:flex;align-items:center;gap:12px;">
              <img src="${chrome.runtime.getURL('icon48.png')}" width="40" height="40" style="border-radius:10px;box-shadow:0 4px 12px rgba(0,0,0,0.3);" />
              <div>
                <div style="font-size:18px;font-weight:700;color:white;letter-spacing:-0.3px;text-shadow:0 2px 4px rgba(0,0,0,0.2);">Save Cluster</div>
                <div style="font-size:11px;color:rgba(255,255,255,0.9);font-weight:600;margin-top:2px;">Auto-login credentials detected</div>
              </div>
            </div>
            <button id="os-save-close-x" style="
              background: rgba(255,255,255,0.2);
              border: none;
              color: white;
              width: 32px;
              height: 32px;
              border-radius: 8px;
              cursor: pointer;
              font-size: 20px;
              display: flex;
              align-items: center;
              justify-content: center;
              transition: all 0.2s;
              line-height: 1;
            ">×</button>
          </div>

          <!-- Modal Body -->
          <div style="padding:24px;">

          ${preFilledNote}

          <div style="margin-bottom:14px;">
            <label style="display:block;font-size:12px;color:#475569;font-weight:700;margin-bottom:6px;letter-spacing:0.2px;">Cluster Name</label>
            <input id="os-save-name" type="text" value="${suggestedName}"
              style="width:100%;background:#f8fafc;border:2px solid #e2e8f0;border-radius:10px;
                     padding:10px 14px;color:#1e293b;font-size:13px;box-sizing:border-box;font-weight:500;transition:all 0.2s;" />
          </div>

          <div style="margin-bottom:14px;">
            <label style="display:block;font-size:12px;color:#475569;font-weight:700;margin-bottom:6px;letter-spacing:0.2px;">Console URL</label>
            <input id="os-save-url" type="text" value="${currentUrl}" readonly
              style="width:100%;background:#f1f5f9;border:2px solid #e2e8f0;border-radius:10px;
                     padding:10px 14px;color:#64748b;font-size:13px;box-sizing:border-box;font-weight:500;" />
          </div>

          <div style="margin-bottom:14px;">
            <label style="display:block;font-size:12px;color:#475569;font-weight:700;margin-bottom:6px;letter-spacing:0.2px;">Username</label>
            <input id="os-save-user" type="text" placeholder="Enter username" value="${capturedUsername}"
              style="width:100%;background:#f8fafc;border:2px solid #e2e8f0;border-radius:10px;
                     padding:10px 14px;color:#1e293b;font-size:13px;box-sizing:border-box;font-weight:500;transition:all 0.2s;" />
          </div>

          <div style="margin-bottom:14px;">
            <label style="display:block;font-size:12px;color:#475569;font-weight:700;margin-bottom:6px;letter-spacing:0.2px;">Password</label>
            <input id="os-save-password" type="password" placeholder="Enter password" value="${capturedPassword}"
              style="width:100%;background:#f8fafc;border:2px solid #e2e8f0;border-radius:10px;
                     padding:10px 14px;color:#1e293b;font-size:13px;box-sizing:border-box;font-weight:500;transition:all 0.2s;" />
          </div>

          <div style="margin-bottom:14px;">
            <label style="display:block;font-size:12px;color:#475569;font-weight:700;margin-bottom:6px;letter-spacing:0.2px;">Group (Optional)</label>
            <select id="os-save-group"
              style="width:100%;background:#f8fafc;border:2px solid #e2e8f0;border-radius:10px;
                     padding:10px 14px;color:#1e293b;font-size:13px;box-sizing:border-box;cursor:pointer;font-weight:500;transition:all 0.2s;">
              ${groupOptions}
            </select>
            <input id="os-save-new-group" type="text" placeholder="Enter new group name"
              style="width:100%;background:#f8fafc;border:2px solid #e2e8f0;border-radius:10px;
                     padding:10px 14px;color:#1e293b;font-size:13px;box-sizing:border-box;margin-top:8px;display:none;font-weight:500;transition:all 0.2s;" />
          </div>

          <div style="margin-bottom:20px;">
            <label style="display:block;font-size:12px;color:#475569;font-weight:700;margin-bottom:6px;letter-spacing:0.2px;">Role (Optional)</label>
            <input id="os-save-role" type="text" placeholder="e.g., hub, primary, secondary"
              style="width:100%;background:#f8fafc;border:2px solid #e2e8f0;border-radius:10px;
                     padding:10px 14px;color:#1e293b;font-size:13px;box-sizing:border-box;font-weight:500;transition:all 0.2s;" />
          </div>

          <div style="display:flex;gap:10px;">
            <button id="os-save-confirm" style="
              flex:1;
              background:linear-gradient(135deg, #DC2626 0%, #B91C1C 100%);
              color:white;
              border:none;
              border-radius:10px;
              padding:12px;
              cursor:pointer;
              font-weight:700;
              font-size:14px;
              letter-spacing:-0.2px;
              box-shadow:0 2px 8px rgba(220, 38, 38, 0.25);
              transition:all 0.2s;">
              Save Cluster
            </button>
            <button id="os-save-cancel" style="
              flex:1;
              background:white;
              color:#64748b;
              border:2px solid #e2e8f0;
              border-radius:10px;
              padding:12px;
              cursor:pointer;
              font-weight:700;
              font-size:14px;
              letter-spacing:-0.2px;
              transition:all 0.2s;">
              Cancel
            </button>
          </div>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      // Close modal function
      const closeModal = () => {
        overlay.remove();
        sessionStorage.setItem('os-save-dismissed', 'true');
      };

      // Close button (X)
      const closeBtn = document.getElementById('os-save-close-x');
      if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
        // Hover effect
        closeBtn.addEventListener('mouseenter', () => {
          closeBtn.style.background = 'rgba(255,255,255,0.3)';
          closeBtn.style.transform = 'scale(1.1)';
        });
        closeBtn.addEventListener('mouseleave', () => {
          closeBtn.style.background = 'rgba(255,255,255,0.2)';
          closeBtn.style.transform = 'scale(1)';
        });
      }

      // Click outside to close
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          closeModal();
        }
      });

      // ESC key to close
      const escHandler = (e) => {
        if (e.key === 'Escape') {
          closeModal();
          document.removeEventListener('keydown', escHandler);
        }
      };
      document.addEventListener('keydown', escHandler);

      // Handle group selection
      const groupSelect = document.getElementById('os-save-group');
      const newGroupInput = document.getElementById('os-save-new-group');

      groupSelect.addEventListener('change', () => {
        if (groupSelect.value === '__new__') {
          newGroupInput.style.display = 'block';
          newGroupInput.focus();
        } else {
          newGroupInput.style.display = 'none';
        }
      });

      // Focus on appropriate field - cluster name if credentials pre-filled, username otherwise
      setTimeout(() => {
        if (capturedUsername && capturedPassword) {
          document.getElementById('os-save-name').focus();
        } else {
          document.getElementById('os-save-user').focus();
        }
      }, 100);

      // Handle save
      document.getElementById('os-save-confirm').addEventListener('click', () => {
        const name = document.getElementById('os-save-name').value.trim();
        let url = document.getElementById('os-save-url').value.trim();
        const user = document.getElementById('os-save-user').value.trim();
        const password = document.getElementById('os-save-password').value;
        const role = document.getElementById('os-save-role').value.trim();

        let group = groupSelect.value;
        if (group === '__new__') {
          group = newGroupInput.value.trim();
        } else if (group === '') {
          group = undefined;
        }

        if (!name || !user || !password) {
          alert('Please fill in all required fields (Name, Username, Password)');
          return;
        }

        // Normalize vSphere URLs to ensure they point to /ui/
        if (detectedVendor === 'vsphere') {
          try {
            const urlObj = new URL(url);
            if (urlObj.pathname === '/' || urlObj.pathname === '') {
              urlObj.pathname = '/ui/';
              url = urlObj.toString();
              console.log('[Auto-Login Content] Normalized vSphere URL to:', url);
            } else if (urlObj.pathname === '/ui') {
              urlObj.pathname = '/ui/';
              url = urlObj.toString();
              console.log('[Auto-Login Content] Normalized vSphere URL to:', url);
            }
          } catch (e) {
            console.error('[Auto-Login Content] Error normalizing URL:', e);
          }
        }

        safeStorageGet('clusters', ({ clusters = [] }) => {
          const newCluster = { name, url, user, password, type: detectedVendor };
          if (group) newCluster.group = group;
          if (role) newCluster.role = role;

          clusters.push(newCluster);
          safeStorageSet({ clusters }, () => {
            // Clear captured credentials from session
            chrome.storage.local.remove([
              'os-captured-username',
              'os-captured-password',
              'os-captured-url',
              'os-captured-timestamp',
              'os-captured-vendor'
            ]);

            overlay.remove();
            showSaveSuccessBanner(name);
          });
        });
      });

      // Handle cancel
      const cancelBtn = document.getElementById('os-save-cancel');
      cancelBtn.addEventListener('click', closeModal);

      // Cancel button hover effects
      cancelBtn.addEventListener('mouseenter', () => {
        cancelBtn.style.background = '#f8fafc';
        cancelBtn.style.color = '#1e293b';
        cancelBtn.style.borderColor = '#cbd5e1';
      });
      cancelBtn.addEventListener('mouseleave', () => {
        cancelBtn.style.background = 'white';
        cancelBtn.style.color = '#64748b';
        cancelBtn.style.borderColor = '#e2e8f0';
      });

      // Save button hover effects
      const saveBtn = document.getElementById('os-save-confirm');
      saveBtn.addEventListener('mouseenter', () => {
        saveBtn.style.background = 'linear-gradient(135deg, #B91C1C 0%, #991B1B 100%)';
        saveBtn.style.boxShadow = '0 4px 16px rgba(220, 38, 38, 0.35)';
        saveBtn.style.transform = 'translateY(-1px)';
      });
      saveBtn.addEventListener('mouseleave', () => {
        saveBtn.style.background = 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)';
        saveBtn.style.boxShadow = '0 2px 8px rgba(220, 38, 38, 0.25)';
        saveBtn.style.transform = 'translateY(0)';
      });

      // Input focus effects
      ['os-save-name', 'os-save-user', 'os-save-password', 'os-save-role', 'os-save-new-group'].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
          input.addEventListener('focus', () => {
            input.style.borderColor = '#DC2626';
            input.style.background = 'white';
            input.style.boxShadow = '0 0 0 4px rgba(220, 38, 38, 0.1)';
          });
          input.addEventListener('blur', () => {
            input.style.borderColor = '#e2e8f0';
            input.style.background = '#f8fafc';
            input.style.boxShadow = 'none';
          });
        }
      });

      // Handle enter key
      ['os-save-name', 'os-save-user', 'os-save-password', 'os-save-role'].forEach(id => {
        document.getElementById(id).addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
            document.getElementById('os-save-confirm').click();
          }
        });
      });

      // Close on overlay click (not form click)
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          // Clear captured credentials from session
          sessionStorage.removeItem('os-captured-username');
          sessionStorage.removeItem('os-captured-password');
          sessionStorage.removeItem('os-captured-url');

          overlay.remove();
        }
      });
    });
  }

  // Show success banner after saving
  function showSaveSuccessBanner(clusterName) {
    const banner = document.createElement('div');
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
      banner.style.transition = 'opacity 0.5s';
      banner.style.opacity = '0';
      setTimeout(() => banner.remove(), 500);
    }, 3000);
  }

  // Check if we should show the save banner
  function checkAndShowSaveBanner() {
    // Don't show if already dismissed in this session
    if (sessionStorage.getItem('os-save-dismissed') === 'true') return;

    // Don't show on login pages
    if (detectVendor()) return;

    // Check if we're on a console page (OpenShift or vSphere)
    if (!isConsolePage()) return;

    const currentUrl = window.location.origin;

    safeStorageGet('clusters', ({ clusters = [] }) => {
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
    // Only check on console pages (OpenShift or vSphere)
    if (!isConsolePage()) return;

    safeStorageGet([
      'clusters',
      'os-captured-username',
      'os-captured-password',
      'os-captured-timestamp'
    ], (data) => {
      const capturedUsername = data['os-captured-username'];
      const capturedPassword = data['os-captured-password'];
      const capturedTimestamp = data['os-captured-timestamp'] || 0;

      // Check if credentials are recent (within last 2 minutes)
      const age = Date.now() - capturedTimestamp;
      const isRecent = age < 120000; // 2 minutes

      console.log('[Auto-Login Content] Checking after login:', {
        hasCredentials: !!capturedUsername && !!capturedPassword,
        age: Math.round(age / 1000) + 's',
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

        if (!exists && sessionStorage.getItem('os-save-dismissed') !== 'true') {
          // Auto-show the save form with pre-filled credentials
          console.log('[Auto-Login Content] Auto-showing save form with captured credentials');
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

          if (matchingClusterIndex !== -1) {
            const matchedCluster = clusters[matchingClusterIndex];
            const sessionKey = `os-autologin-disabled-${matchedCluster.url}`;

            // Clear sessionStorage flag
            sessionStorage.removeItem(sessionKey);

            if (matchedCluster.autoLoginDisabled) {
              // Re-enable auto-login after successful manual login
              delete clusters[matchingClusterIndex].autoLoginDisabled;
              safeStorageSet({ clusters }, () => {
                console.log(`[Auto-Login Content] ✅ Re-enabled auto-login for ${matchedCluster.name} after successful manual login`);
              });
            }
          }

          // Clear captured credentials
          console.log('[Auto-Login Content] Cluster exists or dismissed, clearing captured credentials');
          chrome.storage.local.remove([
            'os-captured-username',
            'os-captured-password',
            'os-captured-url',
            'os-captured-timestamp'
          ]);
        }
      } else if (capturedUsername && !isRecent) {
        // Credentials are too old, clear them
        console.log('[Auto-Login Content] Captured credentials expired, clearing');
        chrome.storage.local.remove([
          'os-captured-username',
          'os-captured-password',
          'os-captured-url',
          'os-captured-timestamp'
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
