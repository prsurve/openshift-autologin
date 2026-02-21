// background.js — service worker

chrome.runtime.onInstalled.addListener(() => {
  // Set default settings on install
  chrome.storage.local.get("settings", ({ settings }) => {
    if (!settings) {
      chrome.storage.local.set({
        settings: {
          autoLogin: false,  // Auto-detect off by default (user must enable)
          confirm:   true,   // Show confirmation banner before filling
          newTab:    true    // Open cluster in new tab
        }
      });
    }
  });
  console.log("OpenShift Auto-Login installed.");
});
