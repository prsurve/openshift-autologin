// background.js — service worker

chrome.runtime.onInstalled.addListener(() => {
  // Set default settings on install
  chrome.storage.local.get("settings", ({ settings }) => {
    if (!settings) {
      chrome.storage.local.set({
        settings: {
          autoLogin: false,     // Auto-detect off by default (user must enable)
          confirm:   true,      // Show confirmation banner before filling
          newTab:    true,      // Open cluster in new tab
          popupSize: 'normal'   // Default popup size
        }
      });
    }
  });
  console.log("OpenShift Auto-Login installed.");
});

// ════════════════════════════════════════════════════════
// CORS-FREE FETCH
// Background service workers bypass CORS due to host_permissions
// ════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'corsFetch') {
    // Make a CORS-free fetch request from the background worker
    const { url, options } = request;

    console.log(`[Background] CORS-free fetch: ${url}`);

    fetch(url, options)
      .then(async response => {
        // Read the response body
        const text = await response.text();

        // Send back response details
        sendResponse({
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          text: text
        });
      })
      .catch(error => {
        console.error(`[Background] Fetch error for ${url}:`, error);
        sendResponse({
          ok: false,
          error: error.message
        });
      });

    // Return true to indicate we'll call sendResponse asynchronously
    return true;
  }
});
