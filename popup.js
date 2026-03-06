// ══════════════════════════════════════════════════════════════════
// CORS-FREE FETCH using background service worker
// ══════════════════════════════════════════════════════════════════

/**
 * Make a CORS-free fetch request via the background service worker
 * Chrome extensions can bypass CORS when using host_permissions + background worker
 *
 * @param {string} url - The URL to fetch
 * @param {object} options - Fetch options (headers, method, etc.)
 * @returns {Promise<Response>} - A Response-like object
 */
async function corsFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        action: 'corsFetch',
        url: url,
        options: options
      },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (response.error) {
          reject(new Error(response.error));
          return;
        }

        // Create a Response-like object
        const mockResponse = {
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          headers: new Headers(response.headers),
          text: async () => response.text,
          json: async () => JSON.parse(response.text)
        };

        resolve(mockResponse);
      }
    );
  });
}

// ── Format relative time ──
function formatRelativeTime(timestamp) {
  if (!timestamp) return null;

  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// ── Get color for group ──
function getGroupColor(groupName) {
  const colors = [
    { bg: '#1a3a6e', text: '#90b8f0', border: '#2a4a8e' }, // Blue
    { bg: '#3a1a6e', text: '#c084fc', border: '#7c3aed' }, // Purple
    { bg: '#1a3a2a', text: '#6ee7b7', border: '#10b981' }, // Green
    { bg: '#2a2a1a', text: '#fde68a', border: '#f59e0b' }, // Yellow
    { bg: '#3a1a1a', text: '#fca5a5', border: '#ef4444' }, // Red
    { bg: '#1a2a3a', text: '#93c5fd', border: '#3b82f6' }, // Light Blue
    { bg: '#2a1a3a', text: '#dda6f5', border: '#a855f7' }, // Pink
    { bg: '#1a2a1a', text: '#86efac', border: '#22c55e' }, // Lime
  ];

  // Simple hash function
  let hash = 0;
  for (let i = 0; i < groupName.length; i++) {
    hash = ((hash << 5) - hash) + groupName.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }

  return colors[Math.abs(hash) % colors.length];
}

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

// ── Get login tooltip based on cluster role ──────────
function getLoginTooltip(role) {
  const tooltips = {
    "hub": '<div class="login-tooltip login-tooltip-hub">🟣 Active ACM Hub<br/>Manages all spoke clusters</div>',
    "hub-passive": '<div class="login-tooltip login-tooltip-hub-passive">🔵 Passive Hub (DR)<br/>Standby ACM Hub for disaster recovery</div>',
    "primary": '<div class="login-tooltip login-tooltip-primary">🟢 Primary Cluster (C1)<br/>Active production cluster</div>',
    "secondary": '<div class="login-tooltip login-tooltip-secondary">🟡 Secondary Cluster (C2)<br/>DR standby - may be read-only</div>',
    "unknown": ''
  };
  return tooltips[role.key] || '';
}

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

  // Get list of all unique groups from clusters
  const allGroups = [...new Set(clusters.map(c => c.group).filter(Boolean))].sort();

  // Build group badge HTML
  let groupBadgeHTML = '';
  if (cluster.group) {
    const groupColor = getGroupColor(cluster.group);
    groupBadgeHTML = `<span class="group-badge" style="background:${groupColor.bg};color:${groupColor.text};border-color:${groupColor.border};" title="Group: ${escapeHtml(cluster.group)}">📦 ${escapeHtml(cluster.group)}</span>`;
  }

  // Build last login HTML
  let lastLoginHTML = '';
  if (cluster.lastLogin) {
    const relTime = formatRelativeTime(cluster.lastLogin);
    lastLoginHTML = `<span style="font-size:9px;color:#555;margin-left:6px;" title="Last login: ${new Date(cluster.lastLogin).toLocaleString()}">🕐 ${relTime}</span>`;
  }

  // Build tags HTML
  let tagsHTML = '';
  if (cluster.tags && cluster.tags.length > 0) {
    tagsHTML = cluster.tags.slice(0, 3).map(tag =>
      `<span style="font-size:9px;padding:2px 5px;border-radius:8px;background:#2a2a3a;color:#888;border:1px solid #333;margin-left:4px;" title="Tag: ${escapeHtml(tag)}">#${escapeHtml(tag)}</span>`
    ).join('');
    if (cluster.tags.length > 3) {
      tagsHTML += `<span style="font-size:9px;color:#666;margin-left:4px;">+${cluster.tags.length - 3}</span>`;
    }
  }

  // Pin star icon
  const pinIcon = cluster.pinned ? '⭐' : '☆';
  const pinTitle = cluster.pinned ? 'Unpin from top' : 'Pin to top';

  div.innerHTML = `
    <span class="drag-handle" style="cursor:grab;color:#666;margin-right:8px;font-size:12px;" title="Drag to reorder">⋮⋮</span>
    <input type="checkbox" class="cluster-checkbox" data-index="${index}" />
    <button class="pin-btn" data-index="${index}" title="${pinTitle}" style="background:none;border:none;font-size:16px;cursor:pointer;padding:0 4px;margin-right:4px;color:${cluster.pinned ? '#f59e0b' : '#444'};">${pinIcon}</button>
    <div style="min-width:0;flex:1;">
      <div class="cluster-name">
        ${escapeHtml(cluster.name)}
        ${cluster.notes ? `<span style="font-size:10px;color:#666;margin-left:6px;" title="Notes: ${escapeHtml(cluster.notes)}">📝</span>` : ''}
      </div>
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
        ${groupBadgeHTML}
        ${lastLoginHTML}
        ${tagsHTML}
      </div>
    </div>
    <div class="cluster-actions">
      <div class="login-btn-wrapper">
        <button class="login-btn ${role.key !== 'unknown' ? 'has-tooltip' : ''}" data-index="${index}">Login</button>
        ${getLoginTooltip(role)}
      </div>
      <button class="menu-btn" data-index="${index}" title="More actions">⋮</button>
      <button class="edit-btn" data-index="${index}" title="Edit cluster">✏️</button>
      <button class="delete-btn" data-index="${index}" title="Remove cluster">✕</button>
    </div>
  `;

  // Checkbox event
  div.querySelector(".cluster-checkbox").addEventListener("change", updateBulkActionsBar);

  // Pin button event
  div.querySelector(".pin-btn").addEventListener("click", () => {
    clusters[index].pinned = !clusters[index].pinned;
    chrome.storage.local.set({ clusters }, () => {
      loadClusters();
      showStatus("success", clusters[index].pinned ? `⭐ ${cluster.name} pinned` : `✅ ${cluster.name} unpinned`);
    });
  });

  div.querySelector(".login-btn").addEventListener("click", (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "...";
    loginToCluster(cluster, btn);
  });

  div.querySelector(".menu-btn").addEventListener("click", (e) => {
    showMoveToGroupMenu(e.currentTarget, cluster, index, clusters, allGroups);
  });

  div.querySelector(".edit-btn").addEventListener("click", () => {
    editCluster(index, cluster, clusters);
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

// ── Show Move to Group menu ──────────────────────────
function showMoveToGroupMenu(button, cluster, index, clusters, allGroups) {
  // Remove any existing menu
  const existingMenu = document.getElementById("move-menu");
  if (existingMenu) existingMenu.remove();

  // Create menu
  const menu = document.createElement("div");
  menu.id = "move-menu";
  menu.className = "context-menu";

  let menuHTML = '<div class="context-menu-header">Move to Group</div>';

  // Add "Remove from group" option if cluster is in a group
  if (cluster.group) {
    menuHTML += `<div class="context-menu-item" data-action="remove-group">🚫 Remove from Group</div>`;
  }

  // Add existing groups
  if (allGroups.length > 0) {
    allGroups.forEach(groupName => {
      if (groupName !== cluster.group) {
        menuHTML += `<div class="context-menu-item" data-group="${escapeHtml(groupName)}">📦 ${escapeHtml(groupName)}</div>`;
      }
    });
  }

  // Add "Create new group" option
  menuHTML += '<div class="context-menu-divider"></div>';
  menuHTML += '<div class="context-menu-item" data-action="new-group">➕ Create New Group</div>';

  menu.innerHTML = menuHTML;
  document.body.appendChild(menu);

  // Position menu near the button
  const rect = button.getBoundingClientRect();
  menu.style.position = "fixed";
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.right = `${window.innerWidth - rect.right}px`;
  menu.style.zIndex = "10000";

  // Handle clicks
  menu.querySelectorAll(".context-menu-item").forEach(item => {
    item.addEventListener("click", () => {
      const action = item.dataset.action;
      const groupName = item.dataset.group;

      if (action === "remove-group") {
        // Remove from group
        delete clusters[index].group;
        chrome.storage.local.set({ clusters }, () => {
          loadClusters();
          showStatus("success", `✅ ${cluster.name} removed from group`);
        });
      } else if (action === "new-group") {
        // Prompt for new group name
        const newGroupName = prompt("Enter new group name:", "");
        if (newGroupName && newGroupName.trim()) {
          clusters[index].group = newGroupName.trim();
          chrome.storage.local.set({ clusters }, () => {
            loadClusters();
            showStatus("success", `✅ ${cluster.name} moved to group "${newGroupName.trim()}"`);
          });
        }
      } else if (groupName) {
        // Move to existing group
        clusters[index].group = groupName;
        chrome.storage.local.set({ clusters }, () => {
          loadClusters();
          showStatus("success", `✅ ${cluster.name} moved to group "${groupName}"`);
        });
      }

      menu.remove();
    });
  });

  // Close menu when clicking outside
  setTimeout(() => {
    const closeHandler = (e) => {
      if (!menu.contains(e.target) && e.target !== button) {
        menu.remove();
        document.removeEventListener("click", closeHandler);
      }
    };
    document.addEventListener("click", closeHandler);
  }, 0);
}

// ── Edit cluster ──────────────────────────────────────
function editCluster(index, cluster, clusters) {
  // Hide add form if open
  document.getElementById("add-form").style.display = "none";
  document.getElementById("add-btn").style.display = "none";

  // Create or show edit form
  let editForm = document.getElementById("edit-form");
  if (!editForm) {
    editForm = document.createElement("div");
    editForm.id = "edit-form";
    editForm.className = "form";
    editForm.innerHTML = `
      <div style="font-size:13px;font-weight:bold;margin-bottom:12px;color:#90b8f0;">✏️ Edit Cluster</div>
      <label>Cluster Name</label>
      <input type="text" id="e-name" placeholder="e.g. Dev / Staging / Prod" />
      <label>Console URL</label>
      <input type="url" id="e-url" placeholder="https://console-openshift-console.apps..." />
      <label>Username</label>
      <input type="text" id="e-user" placeholder="kubeadmin" autocomplete="off" />
      <label>Password</label>
      <input type="password" id="e-password" placeholder="••••••••" autocomplete="off" />
      <label>Role (optional)</label>
      <select id="e-role" style="width:100%;background:#1a1a2e;border:1px solid #333;border-radius:6px;padding:7px 10px;color:#eee;font-size:12px;margin-bottom:10px;">
        <option value="">Auto-detect</option>
        <option value="hub">Active Hub</option>
        <option value="hub-passive">Passive Hub</option>
        <option value="primary">Primary C1</option>
        <option value="secondary">Secondary C2</option>
      </select>
      <label>Group / Jenkins Job ID (optional)</label>
      <input type="text" id="e-group" placeholder="e.g. jenkins-job-123 or RDR-Group-1" />
      <label>Tags (optional)</label>
      <input type="text" id="e-tags" placeholder="production, important, test (comma-separated)" />
      <label>Notes (optional)</label>
      <textarea id="e-notes" placeholder="Add notes about this cluster..." style="width:100%;background:#1a1a2e;border:1px solid #333;border-radius:6px;padding:7px 10px;color:#eee;font-size:12px;margin-bottom:10px;resize:vertical;min-height:60px;"></textarea>
      <div class="form-btns">
        <button class="save-btn" id="edit-save-btn">Save Changes</button>
        <button class="cancel-btn" id="edit-cancel-btn">Cancel</button>
      </div>
    `;
    document.getElementById("cluster-list").parentNode.appendChild(editForm);
  }

  // Pre-fill form with existing values
  document.getElementById("e-name").value = cluster.name || "";
  document.getElementById("e-url").value = cluster.url || "";
  document.getElementById("e-user").value = cluster.user || "";
  document.getElementById("e-password").value = cluster.password || "";
  document.getElementById("e-role").value = cluster.role || "";
  document.getElementById("e-group").value = cluster.group || "";
  document.getElementById("e-tags").value = (cluster.tags || []).join(", ");
  document.getElementById("e-notes").value = cluster.notes || "";

  editForm.style.display = "block";

  // Scroll to form
  editForm.scrollIntoView({ behavior: "smooth", block: "nearest" });

  // Save handler
  const saveBtn = document.getElementById("edit-save-btn");
  saveBtn.replaceWith(saveBtn.cloneNode(true)); // Remove old event listeners
  document.getElementById("edit-save-btn").addEventListener("click", () => {
    const name = document.getElementById("e-name").value.trim();
    const rawUrl = document.getElementById("e-url").value.trim();
    const user = document.getElementById("e-user").value.trim();
    const password = document.getElementById("e-password").value;
    const role = document.getElementById("e-role").value.trim();
    const group = document.getElementById("e-group").value.trim();
    const tagsInput = document.getElementById("e-tags").value.trim();
    const notes = document.getElementById("e-notes").value.trim();

    const url = normalizeURL(rawUrl);

    if (!name || !url || !user || !password) {
      showStatus("error", "❌ All fields are required");
      return;
    }
    if (!url.startsWith("http")) {
      showStatus("error", "❌ URL must start with https://");
      return;
    }

    // Parse tags
    const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t.length > 0) : [];

    // Update cluster (preserve existing fields like lastLogin, pinned)
    clusters[index] = {
      ...clusters[index],
      name,
      url,
      user,
      password
    };
    if (role) clusters[index].role = role;
    if (group) clusters[index].group = group;
    if (tags.length > 0) clusters[index].tags = tags;
    else delete clusters[index].tags;
    if (notes) clusters[index].notes = notes;
    else delete clusters[index].notes;

    chrome.storage.local.set({ clusters }, () => {
      editForm.style.display = "none";
      document.getElementById("add-btn").style.display = "block";
      loadClusters();
      showStatus("success", `✅ ${name} updated!`);
    });
  });

  // Cancel handler
  const cancelBtn = document.getElementById("edit-cancel-btn");
  cancelBtn.replaceWith(cancelBtn.cloneNode(true)); // Remove old event listeners
  document.getElementById("edit-cancel-btn").addEventListener("click", () => {
    editForm.style.display = "none";
    document.getElementById("add-btn").style.display = "block";
  });
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

    // Sort groups: pinned clusters first within each group
    groups.forEach(group => {
      group.clusters.sort((a, b) => {
        if (a.cluster.pinned && !b.cluster.pinned) return -1;
        if (!a.cluster.pinned && b.cluster.pinned) return 1;
        return 0;
      });
    });

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
      const groupColor = getGroupColor(groupLabel);

      // Header — click to expand/collapse, Login All button
      const header = document.createElement("div");
      header.className = "group-header";
      header.style.background = groupColor.bg;
      header.style.borderLeft = `4px solid ${groupColor.border}`;
      header.innerHTML = `
        <div class="group-header-left">
          <span class="drag-handle" style="cursor:grab;color:${groupColor.text};margin-right:6px;font-size:14px;" title="Drag to reorder">⋮⋮</span>
          <span class="group-chevron" style="color:${groupColor.text};">▶</span>
          <div>
            <div class="group-name" style="color:${groupColor.text};">📦 ${escapeHtml(groupLabel)}</div>
            <div class="group-meta" style="color:${groupColor.text};">${group.clusters.length} clusters &nbsp;${rolesSummary}</div>
          </div>
        </div>
        <div class="group-actions">
          <button class="login-all-btn" style="background:${groupColor.border};color:${groupColor.text};" title="Login to all clusters in this group">⚡ Login All</button>
          <span class="group-count" style="background:${groupColor.bg};color:${groupColor.text};border-color:${groupColor.border};">${group.clusters.length}</span>
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

      // Allow dropping clusters onto group header to move them to this group
      header.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (draggedElement && draggedElement.classList.contains("cluster-item") && !draggedElement.closest(".cluster-group") !== groupDiv) {
          header.classList.add("drag-over");
        }
      });

      header.addEventListener("dragleave", (e) => {
        if (e.target === header || header.contains(e.relatedTarget)) return;
        header.classList.remove("drag-over");
      });

      header.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        header.classList.remove("drag-over");

        if (!draggedElement || !draggedElement.classList.contains("cluster-item")) return;

        const droppedIndex = parseInt(draggedElement.dataset.index);
        if (isNaN(droppedIndex)) return;

        chrome.storage.local.get("clusters", ({ clusters = [] }) => {
          if (!clusters[droppedIndex]) return;

          // Move cluster to this group
          clusters[droppedIndex].group = group.groupId;

          chrome.storage.local.set({ clusters }, () => {
            loadClusters();
            showStatus("success", `✅ Moved to group "${group.groupId}"`);
          });
        });
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

  // Update last login timestamp
  chrome.storage.local.get("clusters", ({ clusters = [] }) => {
    const clusterIndex = clusters.findIndex(c => c.url === cluster.url);
    if (clusterIndex !== -1) {
      clusters[clusterIndex].lastLogin = Date.now();
      chrome.storage.local.set({ clusters });
    }
  });

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

  // Store the source cluster URL in the tab's sessionStorage for OAuth redirect tracking
  // This helps the content script match the correct cluster when OAuth strips nested domains
  chrome.scripting.executeScript({
    target: { tabId },
    func: (clusterUrl) => {
      try {
        sessionStorage.setItem("os-autologin-source", clusterUrl);
        console.log("[Auto-Login] Set source cluster URL:", clusterUrl);
      } catch (e) {
        // Ignore errors (e.g., if page isn't loaded yet)
      }
    },
    args: [cluster.url]
  }).catch(() => {
    // Ignore errors - we'll try to set it again when the page loads
  });

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

                  // Set source cluster URL before login attempt
                  chrome.scripting.executeScript({
                    target: { tabId },
                    func: (clusterUrl) => {
                      try {
                        sessionStorage.setItem("os-autologin-source", clusterUrl);
                      } catch (e) { /* ignore */ }
                    },
                    args: [cluster.url]
                  }).catch(() => {});

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

            // Clear source cluster URL from sessionStorage
            chrome.scripting.executeScript({
              target: { tabId },
              func: () => {
                try {
                  sessionStorage.removeItem("os-autologin-source");
                } catch (e) { /* ignore */ }
              }
            }).catch(() => {});

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

          // Re-set the source cluster URL in sessionStorage before attempting login
          // This ensures it's available even after redirects
          chrome.scripting.executeScript({
            target: { tabId },
            func: (clusterUrl) => {
              try {
                sessionStorage.setItem("os-autologin-source", clusterUrl);
              } catch (e) { /* ignore */ }
            },
            args: [cluster.url]
          }).catch(() => {});

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

      // Clear the source cluster URL from sessionStorage after successful login
      chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          try {
            sessionStorage.removeItem("os-autologin-source");
            console.log("[Auto-Login] Cleared source cluster URL after successful login");
          } catch (e) { /* ignore */ }
        }
      }).catch(() => {});

      showStatus("success", `✅ Logged into ${cluster.name}!`);
      if (btn) { btn.disabled = false; btn.textContent = "Login"; }
    }
    // If redirected to an error page
    if (url.includes("login") && url.includes("error")) {
      chrome.tabs.onUpdated.removeListener(successListener);

      // Clear source cluster URL on error too
      chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          try {
            sessionStorage.removeItem("os-autologin-source");
          } catch (e) { /* ignore */ }
        }
      }).catch(() => {});

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

function normalizeURL(url) {
  if (!url || typeof url !== 'string') return url;
  // Remove trailing slash from URL
  return url.replace(/\/$/, '');
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
  const rawUrl   = document.getElementById("f-url").value.trim();
  const user     = document.getElementById("f-user").value.trim();
  const password = document.getElementById("f-password").value;
  const role     = document.getElementById("f-role").value.trim();
  const group    = document.getElementById("f-group").value.trim();
  const tagsInput = document.getElementById("f-tags").value.trim();
  const notes    = document.getElementById("f-notes").value.trim();

  const url = normalizeURL(rawUrl);

  if (!name || !url || !user || !password) {
    showStatus("error", "❌ All fields are required");
    return;
  }
  if (!url.startsWith("http")) {
    showStatus("error", "❌ URL must start with https://");
    return;
  }

  // Parse tags
  const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t.length > 0) : [];

  chrome.storage.local.get("clusters", ({ clusters = [] }) => {
    const newCluster = { name, url, user, password };
    if (role) newCluster.role = role;
    if (group) newCluster.group = group;
    if (tags.length > 0) newCluster.tags = tags;
    if (notes) newCluster.notes = notes;

    clusters.push(newCluster);
    chrome.storage.local.set({ clusters }, () => {
      document.getElementById("add-form").style.display = "none";
      document.getElementById("add-btn").style.display  = "block";
      ["f-name","f-url","f-user","f-password","f-role","f-group","f-tags","f-notes"].forEach(id => {
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
function applyPopupSize(size) {
  const sizes = {
    compact: '340px',
    normal: '450px',
    large: '600px',
    xlarge: '750px'
  };
  document.body.style.width = sizes[size] || sizes.normal;
}

function loadSettings() {
  chrome.storage.local.get("settings", ({ settings = {} }) => {
    document.getElementById("toggle-auto").checked         = settings.autoLogin       || false;
    document.getElementById("toggle-confirm").checked      = settings.confirm         !== false; // default true
    document.getElementById("toggle-newtab").checked       = settings.newTab          !== false; // default true
    document.getElementById("toggle-background").checked   = settings.backgroundTabs  !== false; // default true
    document.getElementById("toggle-sequential").checked   = settings.sequentialTabs  || false;  // default false

    // Load and apply popup size
    const popupSize = settings.popupSize || 'normal';
    document.getElementById("popup-size-select").value = popupSize;
    applyPopupSize(popupSize);
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

// Popup size selector
document.getElementById("popup-size-select").addEventListener("change", e => {
  const size = e.target.value;
  applyPopupSize(size);
  saveSetting("popupSize", size);
});

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

  // Allow dropping on group headers
  const groupHeader = e.target.closest(".group-header");
  if (groupHeader && draggedElement && draggedElement.classList.contains("cluster-item")) {
    groupHeader.classList.add("drag-over");
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
  document.querySelectorAll(".group-header").forEach(el => el.classList.remove("drag-over"));
  draggedElement = null;
  draggedIndex = null;
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
    url:      normalizeURL(c.url || c.console_url || c.consoleUrl || ""),
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
        if (key === "url")      current.url      = normalizeURL(val);
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
        url: normalizeURL(url),
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
    <div style="background:#1a3a6e;padding:10px 12px;border-radius:8px 8px 0 0;margin:-10px -12px 10px -12px;border-left:4px solid #EE0000;">
      <div style="font-size:13px;font-weight:bold;color:#90b8f0;margin-bottom:2px;">
        ✅ Found ${clusters.length} Cluster(s)
      </div>
      <div style="font-size:11px;color:#6a9abd;">
        Review the clusters below and click Import to add them
      </div>
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

  // Scroll to preview with smooth animation
  setTimeout(() => {
    list.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Add a brief highlight animation
    list.style.animation = 'none';
    setTimeout(() => {
      list.style.animation = 'pulse 0.5s ease-in-out';
    }, 10);
  }, 100);

  showImportStatus("success", `✅ Success! Found ${clusters.length} cluster(s). Review them below ⬇️`);
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

// ── Auto-detect group name from Jenkins URL ──────────
document.getElementById("jenkins-url").addEventListener("input", (e) => {
  const url = e.target.value.trim();
  const groupInput = document.getElementById("jenkins-group");

  // Try to extract job ID from URL
  const jobIdMatch = url.match(/\/job\/([^\/]+)\/(\d+)/);
  if (jobIdMatch) {
    const jobId = jobIdMatch[2];
    groupInput.placeholder = `Auto-detected: ${jobId}`;
  } else {
    groupInput.placeholder = "e.g. RDR-Setup-4073 or My-Test-Group";
  }
});

// ── Fetch clusters from Jenkins ──────────────────────
document.getElementById("fetch-jenkins-btn").addEventListener("click", async () => {
  const jenkinsUrl = document.getElementById("jenkins-url").value.trim();
  const jenkinsUser = document.getElementById("jenkins-user").value.trim();
  const jenkinsToken = document.getElementById("jenkins-token").value.trim();
  const customGroupName = document.getElementById("jenkins-group").value.trim();
  const debugMode = document.getElementById("jenkins-debug").checked;

  // Clear previous debug output
  const debugOutput = document.getElementById("jenkins-debug-output");
  const debugText = debugOutput.querySelector("div");
  debugText.textContent = "";
  debugOutput.style.display = "none";

  const debugLog = (msg) => {
    if (debugMode) {
      debugText.textContent += msg + "\n";
      debugOutput.style.display = "block";
    }
    console.log(msg);
  };

  if (!jenkinsUrl) {
    showImportStatus("error", "❌ Please enter a Jenkins job URL");
    return;
  }

  const btn = document.getElementById("fetch-jenkins-btn");
  btn.disabled = true;
  btn.textContent = "⏳ Fetching...";
  showImportStatus("info", "🔄 Connecting to Jenkins...");

  debugLog(`[Jenkins Import] Starting fetch from: ${jenkinsUrl}`);
  debugLog(`[Jenkins Import] Debug mode: enabled`);
  debugLog(`[Jenkins Import] Authentication: ${jenkinsUser ? 'provided' : 'none'}`);
  debugLog("");

  try {
    // Normalize Jenkins URL
    let baseUrl = jenkinsUrl.replace(/\/$/, "");

    // Setup auth headers if credentials provided
    const headers = {};
    if (jenkinsUser && jenkinsToken) {
      const auth = btoa(`${jenkinsUser}:${jenkinsToken}`);
      headers['Authorization'] = `Basic ${auth}`;
    }

    let allClusters = [];

    // Step 1: Fetch build info via Jenkins REST API (get ALL data to search for credentials)
    showImportStatus("info", "📋 Fetching build information from REST API...");
    // Request full JSON to search for credentials in all fields
    const apiUrl = `${baseUrl}/api/json`;
    debugLog(`[Step 1] Fetching full build info from: ${apiUrl}`);

    try {
      const apiResponse = await corsFetch(apiUrl, { headers });
      debugLog(`[Step 1] Response status: ${apiResponse.status} ${apiResponse.statusText}`);

      if (apiResponse.ok) {
        const buildInfo = await apiResponse.json();
        debugLog(`[Step 1] Build info received`);
        debugLog(`[Step 1] Top-level fields: ${Object.keys(buildInfo).join(', ')}`);

        // Step 1a: Extract credentials from build parameters and environment variables
        if (buildInfo.actions && buildInfo.actions.length > 0) {
          showImportStatus("info", "🔍 Extracting credentials from build parameters...");
          debugLog(`[Step 1a] Checking ${buildInfo.actions.length} action(s) for parameters...`);

          for (const action of buildInfo.actions) {
            if (action.parameters && action.parameters.length > 0) {
              debugLog(`[Step 1a] Found ${action.parameters.length} build parameter(s):`);

              // Convert parameters to key-value format
              const params = {};
              for (const param of action.parameters) {
                if (param.name && param.value !== undefined && param.value !== null) {
                  const valueStr = String(param.value);
                  params[param.name] = valueStr;

                  // Only show first 100 chars in debug to avoid clutter
                  const displayValue = valueStr.length > 100 ? valueStr.substring(0, 100) + '...' : valueStr;
                  debugLog(`  - ${param.name} = ${displayValue}`);
                }
              }

              // Parse parameters for cluster credentials (using same logic as env-vars pattern)
              const paramClusters = parseJenkinsParameters(params, jenkinsUrl, debugLog);
              if (paramClusters.length > 0) {
                debugLog(`[Step 1a] ✅ Found ${paramClusters.length} cluster(s) from build parameters`);
                allClusters.push(...paramClusters);
              } else {
                debugLog(`[Step 1a] ⚠️ No cluster credentials found in build parameters`);
              }
            }
          }
        }

        debugLog("");

        // Step 1a-2: Search through ALL actions for environment variables or credentials
        debugLog(`[Step 1a-2] Deep searching all ${buildInfo.actions.length} actions for credentials...`);
        debugLog(`[Step 1a-2] Action types found: ${buildInfo.actions.map(a => a._class || 'unknown').join(', ')}`);
        for (const action of buildInfo.actions) {
          // Check if this action has environment variables
          if (action._class && action._class.includes('EnvAction')) {
            debugLog(`[Step 1a-2] Found EnvAction! Examining...`);
            // Search for any field that might contain environment variables
            for (const key of Object.keys(action)) {
              if (key !== '_class' && typeof action[key] === 'object') {
                debugLog(`[Step 1a-2] Found object field: ${key}, type: ${typeof action[key]}`);
                if (action[key] && typeof action[key] === 'object') {
                  const envVars = action[key];
                  debugLog(`[Step 1a-2] Parsing ${Object.keys(envVars).length} environment variables...`);

                  const envClusters = parseJenkinsParameters(envVars, jenkinsUrl, debugLog);
                  if (envClusters.length > 0) {
                    debugLog(`[Step 1a-2] ✅ Found ${envClusters.length} cluster(s) from environment variables`);
                    allClusters.push(...envClusters);
                  }
                }
              }
            }
          }

          // Also check for any fields containing "environment", "env", "variables", etc.
          for (const key of Object.keys(action)) {
            const keyLower = key.toLowerCase();
            if ((keyLower.includes('env') || keyLower.includes('variable')) &&
                action[key] && typeof action[key] === 'object' &&
                !Array.isArray(action[key])) {
              debugLog(`[Step 1a-2] Found potential env field: ${key}`);
              const envClusters = parseJenkinsParameters(action[key], jenkinsUrl, debugLog);
              if (envClusters.length > 0) {
                debugLog(`[Step 1a-2] ✅ Found ${envClusters.length} cluster(s) from ${key}`);
                allClusters.push(...envClusters);
              }
            }
          }
        }

        debugLog("");

        // Step 1b: Try to fetch environment variables which often contain the actual credentials
        showImportStatus("info", "🔍 Fetching environment variables from Jenkins...");
        const envUrl = `${baseUrl}/injectedEnvVars/api/json`;
        debugLog(`[Step 1b] Fetching environment variables from: ${envUrl}`);

        try {
          const envResponse = await corsFetch(envUrl, { headers });
          debugLog(`[Step 1b] Response status: ${envResponse.status} ${envResponse.statusText}`);

          if (envResponse.ok) {
            const envData = await envResponse.json();
            if (envData.envMap) {
              debugLog(`[Step 1b] Found ${Object.keys(envData.envMap).length} environment variable(s)`);

              // Parse environment variables for cluster credentials
              const envClusters = parseJenkinsParameters(envData.envMap, jenkinsUrl, debugLog);
              if (envClusters.length > 0) {
                debugLog(`[Step 1b] ✅ Found ${envClusters.length} cluster(s) from environment variables`);
                allClusters.push(...envClusters);
              } else {
                debugLog(`[Step 1b] ⚠️ No cluster credentials found in environment variables`);
              }
            } else {
              debugLog(`[Step 1b] ⚠️ No envMap found in response`);
            }
          } else {
            debugLog(`[Step 1b] ⚠️ Failed to fetch environment variables (HTTP ${envResponse.status})`);
            debugLog(`[Step 1b] This is normal for some Jenkins configurations`);
          }
        } catch (e) {
          debugLog(`[Step 1b] ⚠️ Could not fetch environment variables: ${e.message}`);
          debugLog(`[Step 1b] This is normal - not all Jenkins jobs expose environment variables`);
        }

        debugLog("");

        // Step 1c: Parse build description for kubeconfig download paths (like the bash script does)
        if (buildInfo.description) {
          showImportStatus("info", "🔍 Parsing build description for credentials...");
          debugLog(`[Step 1c] Found build description (${buildInfo.description.length} chars)`);

          // Show sample of description for debugging
          const descriptionText = buildInfo.description
            .replace(/<[^>]+>/g, ' ')  // Strip HTML tags
            .replace(/\s+/g, ' ')       // Normalize whitespace
            .trim();
          debugLog(`[Step 1c] Description preview (first 500 chars):`);
          debugLog(`  ${descriptionText.substring(0, 500)}...`);
          debugLog(``);

          // Parse HTML description to find kubeconfig paths
          debugLog(`[Step 1c] Extracting kubeconfig download paths...`);
          const kubeconfigPaths = extractKubeconfigPaths(buildInfo.description, debugLog);

          if (kubeconfigPaths.length > 0) {
            debugLog(`[Step 1c] Found ${kubeconfigPaths.length} kubeconfig path(s)`);

            // Get cluster names and types from CLUSTERS_CONFIGURATION if available
            let clusterNames = [];
            let clusterRoles = [];
            let extractedUrls = {}; // Map cluster names to their full console URLs

            // Extract from params if we have them
            if (buildInfo.actions) {
              for (const action of buildInfo.actions) {
                if (action.parameters) {
                  for (const param of action.parameters) {
                    if (param.name === 'CLUSTERS_CONFIGURATION' && param.value) {
                      try {
                        let configStr = String(param.value).trim();
                        if ((configStr.startsWith('"') && configStr.endsWith('"')) ||
                            (configStr.startsWith("'") && configStr.endsWith("'"))) {
                          configStr = configStr.slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'");
                        }
                        const clustersConfig = JSON.parse(configStr);

                        for (const cluster of clustersConfig) {
                          const clusterName = cluster.CLUSTER_NAME || `cluster-${clusterNames.length}`;
                          clusterNames.push(clusterName);

                          // Map cluster type to role
                          const clusterType = cluster.CLUSTER_TYPE || '';
                          const typeMap = {
                            'Active ACM': 'hub',
                            'Passive ACM': 'hub-passive',
                            'Primary': 'primary',
                            'Secondary': 'secondary',
                            'C1': 'primary',
                            'C2': 'secondary'
                          };
                          clusterRoles.push(typeMap[clusterType] || 'unknown');

                          // Also extract console URL if present in CLUSTERS_CONFIGURATION
                          const clusterUrl = cluster.CONSOLE_URL || cluster.console_url ||
                                           cluster.CLUSTER_URL || cluster.cluster_url ||
                                           cluster.URL || cluster.url;
                          if (clusterUrl) {
                            extractedUrls[clusterName.toLowerCase()] = normalizeURL(clusterUrl);
                            debugLog(`[Step 1c]   Found console URL in CLUSTERS_CONFIGURATION: ${extractedUrls[clusterName.toLowerCase()]} (cluster: ${clusterName})`);
                          }
                        }

                        debugLog(`[Step 1c] Extracted ${clusterNames.length} cluster names from CLUSTERS_CONFIGURATION`);
                        for (let i = 0; i < clusterNames.length; i++) {
                          debugLog(`  ${i + 1}. ${clusterNames[i]} [${clusterRoles[i]}]`);
                        }
                      } catch (e) {
                        debugLog(`[Step 1c] Could not parse CLUSTERS_CONFIGURATION: ${e.message}`);
                      }
                      break;
                    }
                  }
                }
              }
            }

            // Extract console URLs from description (do this ALWAYS, not just when cluster names are missing)
            if (kubeconfigPaths.length > 0 && buildInfo.description) {
              debugLog(`[Step 1c] Extracting console URLs from description...`);

              let urlsFoundInDescription = 0;

              // First, extract console URLs from href attributes BEFORE stripping HTML
              const hrefRegex = /href=["']([^"']*console-openshift-console\.apps\.[^"']*)["']/gi;
              let hrefMatch;
              while ((hrefMatch = hrefRegex.exec(buildInfo.description)) !== null) {
                const fullUrl = hrefMatch[1];
                // Extract cluster name from URL
                const urlMatch = fullUrl.match(/console-openshift-console\.apps\.([a-zA-Z0-9_-]+)\./);
                if (urlMatch && urlMatch[1]) {
                  const clusterNameFromUrl = urlMatch[1].toLowerCase();
                  if (!extractedUrls[clusterNameFromUrl]) {
                    extractedUrls[clusterNameFromUrl] = normalizeURL(fullUrl);
                    debugLog(`[Step 1c]   ✅ Found in HTML href: ${extractedUrls[clusterNameFromUrl]} → cluster: ${clusterNameFromUrl}`);
                    urlsFoundInDescription++;
                  }
                }
              }

              // Extract cluster names and URLs from plain text
              const descText = buildInfo.description
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<[^>]+>/g, ' ')
                .replace(/&nbsp;/g, ' ')
                .trim();

              // Extract console URLs from plain text (Web Console: https://...)
              const plainTextUrlRegex = /https?:\/\/console-openshift-console\.apps\.([\w.-]+)/g;
              let plainUrlMatch;
              while ((plainUrlMatch = plainTextUrlRegex.exec(descText)) !== null) {
                const fullDomain = plainUrlMatch[1];
                const fullUrl = `https://console-openshift-console.apps.${fullDomain}`;
                const clusterNameFromUrl = fullDomain.split('.')[0].toLowerCase();
                if (clusterNameFromUrl.length >= 2) {
                  if (!extractedUrls[clusterNameFromUrl]) {
                    extractedUrls[clusterNameFromUrl] = normalizeURL(fullUrl);
                    debugLog(`[Step 1c]   ✅ Found in plain text: ${extractedUrls[clusterNameFromUrl]} → cluster: ${clusterNameFromUrl}`);
                    urlsFoundInDescription++;
                  }
                }
              }

              if (urlsFoundInDescription > 0) {
                debugLog(`[Step 1c] Extracted ${urlsFoundInDescription} console URL(s) from description`);
              } else {
                debugLog(`[Step 1c] ⚠️  No console URLs found in description`);
              }
            }

            // Try to extract actual cluster names from description before falling back to defaults
            if (clusterNames.length === 0 && kubeconfigPaths.length > 0 && buildInfo.description) {
              debugLog(`[Step 1c] No cluster names in CLUSTERS_CONFIGURATION, trying to extract from description...`);

              // Extract cluster names from lines like "kmanohar-hubf26 - Deploy Job (SUCCESS)"
              const descText = buildInfo.description
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<[^>]+>/g, ' ')
                .replace(/&nbsp;/g, ' ')
                .trim();

              const descLines = descText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
              const extractedNames = [];
              const extractedRoles = [];

              for (const line of descLines) {
                // Match patterns:
                // 1. "clustername - Deploy Job (SUCCESS)"
                // 2. Just "clustername" on its own line (near kubeconfig/password lines)
                let clusterName = null;

                // Try pattern with "- Deploy Job"
                const deployMatch = line.match(/^([a-zA-Z0-9_-]+)\s*-\s*Deploy Job/i);
                if (deployMatch && deployMatch[1].length >= 2) {
                  clusterName = deployMatch[1];
                }

                // Try standalone cluster name (alphanumeric with dashes/underscores, 2+ chars)
                // Exclude common words like "logs", "login", "password", etc.
                if (!clusterName && /^[a-zA-Z0-9_-]{2,}$/.test(line)) {
                  const excludeWords = ['logs', 'log', 'login', 'password', 'pass', 'pwd', 'kubeconfig', 'console',
                                        'web', 'jenkins', 'slave', 'branch', 'repository', 'repo', 'null', 'none',
                                        'ip', 'ocs', 'ci', 'ocp', 'job', 'build', 'test', 'user', 'admin'];
                  if (!excludeWords.includes(line.toLowerCase())) {
                    clusterName = line;
                  }
                }

                // Try extracting from URLs (Web Console, kubeconfig paths, logs)
                if (!clusterName) {
                  // Pattern 1: console-openshift-console.apps.CLUSTERNAME.domain.com
                  const consoleUrlMatch = line.match(/console-openshift-console\.apps\.([a-zA-Z0-9_-]+)\./);
                  if (consoleUrlMatch && consoleUrlMatch[1].length >= 2) {
                    clusterName = consoleUrlMatch[1];
                  }

                  // Pattern 2: /openshift-clusters/CLUSTERNAME/
                  if (!clusterName) {
                    const clusterPathMatch = line.match(/\/openshift-clusters\/([a-zA-Z0-9_-]+)\//);
                    if (clusterPathMatch && clusterPathMatch[1].length >= 2) {
                      clusterName = clusterPathMatch[1];
                    }
                  }
                }

                if (clusterName) {
                  // Normalize to lowercase for consistency
                  clusterName = clusterName.toLowerCase();

                  // Avoid duplicates
                  if (!extractedNames.includes(clusterName)) {
                    extractedNames.push(clusterName);

                    // Try to infer role from name suffix
                    let role = 'unknown';
                    if (clusterName.match(/hub.*1|hub.*passive|h.*p|.*hpas|passive/i)) {
                      role = 'hub-passive';
                    } else if (clusterName.match(/hub|h[0-9]|acm/i)) {
                      role = 'hub';
                    } else if (clusterName.match(/pf|primary|c1|one|bm.*3|provider/i)) {
                      role = 'primary';
                    } else if (clusterName.match(/sf|secondary|c2|two|bm.*5|client/i)) {
                      role = 'secondary';
                    }
                    extractedRoles.push(role);

                    debugLog(`[Step 1c]   Found cluster: ${clusterName} [${role}]`);
                  }
                }
              }

              if (extractedNames.length > 0) {
                clusterNames = extractedNames;
                clusterRoles = extractedRoles;
                debugLog(`[Step 1c] Extracted ${clusterNames.length} cluster name(s) from description: ${clusterNames.join(', ')}`);
              }
            }

            // Fallback: If still no cluster names, use defaults based on path count
            // (matching bash script logic)
            if (clusterNames.length === 0 && kubeconfigPaths.length > 0) {
              debugLog(`[Step 1c] No cluster names in CLUSTERS_CONFIGURATION or description, using defaults based on ${kubeconfigPaths.length} path(s)...`);

              const numPaths = kubeconfigPaths.length;

              switch (numPaths) {
                case 4:
                  clusterNames = ["hub", "hub_1", "vmware_one", "vmware_two"];
                  clusterRoles = ["hub", "hub-passive", "primary", "secondary"];
                  debugLog(`[Step 1c] Using 4-cluster default: hub, hub_1, vmware_one, vmware_two`);
                  break;
                case 3:
                  clusterNames = ["hub", "vmware_one", "vmware_two"];
                  clusterRoles = ["hub", "primary", "secondary"];
                  debugLog(`[Step 1c] Using 3-cluster default: hub, vmware_one, vmware_two`);
                  break;
                case 2:
                  clusterNames = ["hub", "vmware_one"];
                  clusterRoles = ["hub", "primary"];
                  debugLog(`[Step 1c] Using 2-cluster default: hub, vmware_one`);
                  break;
                default:
                  // Generic names for any other count
                  for (let i = 0; i < numPaths; i++) {
                    clusterNames.push(`cluster_${i}`);
                    clusterRoles.push("unknown");
                  }
                  debugLog(`[Step 1c] Using generic names: ${clusterNames.join(', ')}`);
                  break;
              }
            }

            // Show summary of extracted URLs
            if (Object.keys(extractedUrls).length > 0) {
              debugLog(`[Step 1c] 📋 Console URL Summary:`);
              for (const [clusterName, url] of Object.entries(extractedUrls)) {
                debugLog(`[Step 1c]   • ${clusterName} → ${url}`);
              }
            } else {
              debugLog(`[Step 1c] ⚠️  No console URLs extracted - will use default domain for all clusters`);
            }

            // Parse passwords from description text
            debugLog(`[Step 1c] Parsing passwords from description text...`);
            const passwordsFromDescription = extractPasswordsFromDescription(buildInfo.description, debugLog);
            debugLog(`[Step 1c] Found ${Object.keys(passwordsFromDescription).length} password(s) in description`);

            // Create clusters using passwords from description
            const extractedClusters = createClustersWithPasswords(
              clusterNames,
              clusterRoles,
              passwordsFromDescription,
              jenkinsUrl,
              debugLog,
              customGroupName,
              extractedUrls  // Pass the extracted console URLs
            );

            if (extractedClusters.length > 0) {
              debugLog(`[Step 1c] ✅ Successfully extracted ${extractedClusters.length} cluster(s) with passwords from description!`);
              allClusters.push(...extractedClusters);
            } else {
              debugLog(`[Step 1c] ⚠️ Could not find passwords in description text`);
              debugLog(`[Step 1c] Checked for patterns like "Password: xxxx" near cluster names`);
              debugLog(`[Step 1c] If passwords exist in description, the format may be different`);
              debugLog(`[Step 1c] ✅ Alternative: Use "Paste JSON Directly" above`);
            }
          } else {
            debugLog(`[Step 1c] ⚠️ No kubeconfig paths found in build description`);
          }
        } else {
          debugLog(`[Step 1c] ⚠️ No description field in build info`);
        }

        debugLog("");

        // Step 2: Check for artifacts that might contain cluster info
        if (buildInfo.artifacts && buildInfo.artifacts.length > 0) {
          showImportStatus("info", `📦 Found ${buildInfo.artifacts.length} artifact(s), checking for cluster data...`);
          debugLog(`[Step 2] Found ${buildInfo.artifacts.length} artifact(s):`);

          for (const artifact of buildInfo.artifacts) {
            // Look for JSON/YAML/text files that might have cluster info
            const fileName = artifact.fileName.toLowerCase();
            debugLog(`  - ${artifact.fileName} (${artifact.relativePath})`);

            if (fileName.includes('cluster') || fileName.includes('credential') ||
                fileName.endsWith('.json') || fileName.endsWith('.yaml') ||
                fileName.endsWith('.yml') || fileName.endsWith('.env') ||
                fileName.endsWith('.txt')) {

              try {
                const artifactUrl = `${baseUrl}/artifact/${artifact.relativePath}`;
                debugLog(`[Step 2] Fetching artifact: ${artifactUrl}`);
                const artifactResponse = await corsFetch(artifactUrl, { headers });

                if (artifactResponse.ok) {
                  const content = await artifactResponse.text();
                  debugLog(`[Step 2] Artifact content length: ${content.length} bytes`);
                  const clusters = parseArtifactContent(content, fileName, jenkinsUrl, debugLog);

                  if (clusters.length > 0) {
                    debugLog(`[Step 2] ✅ Found ${clusters.length} cluster(s) in artifact: ${fileName}`);
                    allClusters.push(...clusters);
                  } else {
                    debugLog(`[Step 2] ⚠️ No clusters found in artifact: ${fileName}`);
                  }
                } else {
                  debugLog(`[Step 2] ❌ Failed to fetch artifact (HTTP ${artifactResponse.status})`);
                }
              } catch (e) {
                debugLog(`[Step 2] ❌ Error fetching artifact ${artifact.fileName}: ${e.message}`);
              }
            } else {
              debugLog(`     → Skipped (not a credential file)`);
            }
          }
        }
      } else {
        debugLog(`[Step 1] ❌ Failed to fetch build info (HTTP ${apiResponse.status})`);
      }
    } catch (e) {
      debugLog(`[Step 1] ❌ Error fetching via API: ${e.message}`);
      if (e.name === 'TypeError') {
        debugLog(`[Step 1] ⚠️ Network error - Jenkins may be unreachable or authentication required`);
      }
    }

    debugLog("");

    // Remove duplicates based on URL
    const seen = new Set();
    const uniqueClusters = allClusters.filter(c => {
      if (seen.has(c.url)) {
        debugLog(`[Dedup] Skipping duplicate URL: ${c.url}`);
        return false;
      }
      seen.add(c.url);
      return true;
    });

    debugLog("");
    debugLog(`[Summary] Total credentials found: ${allClusters.length}`);
    debugLog(`[Summary] Unique OpenShift clusters: ${uniqueClusters.length}`);
    debugLog(`[Summary] Duplicates removed: ${allClusters.length - uniqueClusters.length}`);

    if (uniqueClusters.length === 0) {
      // Provide more helpful error message
      const totalFound = allClusters.length;

      debugLog("");
      debugLog(`[Result] ❌ NO CLUSTERS IMPORTED`);
      if (totalFound > 0) {
        debugLog(`[Result] Found ${totalFound} credential(s) but they were all filtered out`);
        debugLog(`[Result] This means the URLs didn't match OpenShift patterns`);
        showImportStatus("error", `❌ Found ${totalFound} credential(s) but they were filtered out (not OpenShift clusters). ${debugMode ? 'Check debug output above' : 'Enable debug mode to see details'}.`);
      } else {
        debugLog(`[Result] No credentials found at all`);
        debugLog(`[Result] Searched entire Jenkins JSON but couldn't find passwords`);
        debugLog(`[Result] Most likely reasons:`);
        debugLog(`  → Passwords stored in separate files (not in API response)`);
        debugLog(`  → Passwords in environment variables not exposed via API`);
        debugLog(`  → Job hasn't completed or credentials not generated yet`);
        debugLog(``);
        debugLog(`[Result] ✅ EASY FIX - Use "Paste JSON Directly" above:`);
        debugLog(`  1. Run: ~/download_kubeconfig_rdr.sh.3 4073`);
        debugLog(`  2. Open: ~/OCS4/autologin/clusters.json`);
        debugLog(`  3. Copy all JSON content`);
        debugLog(`  4. Paste in "Paste JSON Directly" section above`);
        debugLog(`  5. Click "✨ Import JSON" - Done!`);
        debugLog("");
        debugLog(`[Workaround] Use "Paste Console Output Directly" below:`);
        debugLog(`  1. Open Jenkins job in browser`);
        debugLog(`  2. Click "Console Output"`);
        debugLog(`  3. Copy the full output`);
        debugLog(`  4. Paste in the textarea below and click "Parse Console Output"`);
        showImportStatus("error", `❌ No passwords found in Jenkins API response. ${debugMode ? 'Check debug output above for what was searched.' : 'Enable debug mode to see details.'} Use "Paste JSON Directly" instead!`);
      }
      btn.disabled = false;
      btn.textContent = "🔄 Fetch from Jenkins";
      return;
    }

    debugLog("");
    debugLog(`[Result] ✅ SUCCESS - ${uniqueClusters.length} cluster(s) ready to import`);

    // Show preview
    showPreview(uniqueClusters);
    // Status is set inside showPreview()

  } catch (error) {
    console.error("Jenkins fetch error:", error);

    // Provide helpful error message
    if (error.name === 'TypeError' || error.message.includes("NetworkError")) {
      showImportStatus("error", `❌ Cannot access Jenkins - check URL and authentication. Or use "Paste JSON Directly" option above.`);
    } else {
      showImportStatus("error", `❌ Failed to fetch from Jenkins: ${error.message}`);
    }
  } finally {
    btn.disabled = false;
    btn.textContent = "🔄 Fetch from Jenkins";
  }
});

// ── Extract passwords from description text ────
function extractPasswordsFromDescription(htmlDescription, debugLog = console.log) {
  const passwords = {};

  // Strip HTML tags to get plain text
  const text = htmlDescription
    .replace(/<br\s*\/?>/gi, '\n')  // Convert <br> to newlines
    .replace(/<[^>]+>/g, ' ')        // Strip other HTML tags
    .replace(/&nbsp;/g, ' ')         // Replace &nbsp;
    .trim();

  debugLog(`[Password Parser] Searching description text for password patterns...`);
  debugLog(`[Password Parser] Description has ${text.length} chars, ${text.split('\n').length} lines`);

  // Split into lines for easier parsing
  const lines = text.split('\n');

  // Show ALL lines for debugging (filter out empty lines)
  const nonEmptyLines = lines.filter(l => l.trim().length > 0);
  debugLog(`[Password Parser] ALL lines from description (${nonEmptyLines.length} non-empty lines):`);
  for (let i = 0; i < nonEmptyLines.length; i++) {
    debugLog(`  [${i}] ${nonEmptyLines[i]}`);
  }
  debugLog(``);

  // Pattern 1: Look for "Password: xxxx" format
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Match various password formats: Password:, Pass:, pwd:, Pwd:
    // Allow more characters in password: alphanumeric, dash, underscore, special chars
    const passwordMatch = line.match(/(?:Password|Pass|Pwd):\s*([A-Za-z0-9@#$%^&*()_+=\[\]{};:'"<>,.?/\\|-]+)/i);
    if (passwordMatch) {
      const password = passwordMatch[1];

      // Look backwards for cluster name (search up to 20 lines back)
      let clusterName = null;
      for (let j = i - 1; j >= Math.max(0, i - 20); j--) {
        const prevLine = lines[j].trim();

        // First try: Extract from URLs (Web Console or kubeconfig paths)
        // Pattern 1: console-openshift-console.apps.CLUSTERNAME.domain.com
        let urlMatch = prevLine.match(/console-openshift-console\.apps\.([a-zA-Z0-9_-]+)\./);
        if (urlMatch && urlMatch[1].length >= 2) {
          clusterName = urlMatch[1].toLowerCase();
          break;
        }

        // Pattern 2: /openshift-clusters/CLUSTERNAME/
        urlMatch = prevLine.match(/\/openshift-clusters\/([a-zA-Z0-9_-]+)\//);
        if (urlMatch && urlMatch[1].length >= 2) {
          clusterName = urlMatch[1].toLowerCase();
          break;
        }

        // Second try: Standalone cluster name on line
        // Pattern: prsurve-dr26-c2, baremetal3, hub_1, C1, etc.
        // (may be followed by extra text like " - Deploy Job (SUCCESS)")
        const clusterMatch = prevLine.match(/^([a-zA-Z0-9_-]+)(?:\s|$)/);
        if (clusterMatch && clusterMatch[1].length >= 2) {
          const candidate = clusterMatch[1].toLowerCase();
          // Exclude common words that aren't cluster names
          const excludeWords = ['logs', 'log', 'login', 'password', 'pass', 'pwd', 'kubeconfig', 'console',
                                'web', 'jenkins', 'slave', 'branch', 'repository', 'repo', 'null', 'none',
                                'ip', 'ocs', 'ci', 'ocp', 'job', 'build', 'test', 'user', 'admin'];
          if (!excludeWords.includes(candidate)) {
            clusterName = candidate;
            break;
          }
        }
      }

      if (clusterName) {
        passwords[clusterName] = password;
        debugLog(`[Password Parser] Found: ${clusterName} → Password: ${'*'.repeat(password.length)}`);
      } else {
        debugLog(`[Password Parser] Found password but couldn't match to cluster: ${'*'.repeat(password.length)}`);
      }
    }

    // Pattern 2: Look for "Login: kubeadmin" followed by "Password:"
    if (line.match(/Login:\s*kubeadmin/i)) {
      // Check next few lines for password
      for (let j = i + 1; j < Math.min(lines.length, i + 5); j++) {
        const nextLine = lines[j].trim();
        const pwMatch = nextLine.match(/(?:Password|Pass|Pwd):\s*([A-Za-z0-9@#$%^&*()_+=\[\]{};:'"<>,.?/\\|-]+)/i);
        if (pwMatch) {
          const password = pwMatch[1];

          // Look backwards for cluster name (search up to 20 lines back)
          let clusterName = null;
          for (let k = i - 1; k >= Math.max(0, i - 20); k--) {
            const prevLine = lines[k].trim();

            // First try: Extract from URLs (Web Console or kubeconfig paths)
            // Pattern 1: console-openshift-console.apps.CLUSTERNAME.domain.com
            let urlMatch = prevLine.match(/console-openshift-console\.apps\.([a-zA-Z0-9_-]+)\./);
            if (urlMatch && urlMatch[1].length >= 2) {
              clusterName = urlMatch[1].toLowerCase();
              break;
            }

            // Pattern 2: /openshift-clusters/CLUSTERNAME/
            urlMatch = prevLine.match(/\/openshift-clusters\/([a-zA-Z0-9_-]+)\//);
            if (urlMatch && urlMatch[1].length >= 2) {
              clusterName = urlMatch[1].toLowerCase();
              break;
            }

            // Second try: Standalone cluster name on line
            const clusterMatch = prevLine.match(/^([a-zA-Z0-9_-]+)(?:\s|$)/);
            if (clusterMatch && clusterMatch[1].length >= 2) {
              const candidate = clusterMatch[1].toLowerCase();
              // Exclude common words that aren't cluster names
              const excludeWords = ['logs', 'log', 'login', 'password', 'pass', 'pwd', 'kubeconfig', 'console',
                                    'web', 'jenkins', 'slave', 'branch', 'repository', 'repo', 'null', 'none',
                                    'ip', 'ocs', 'ci', 'ocp', 'job', 'build', 'test', 'user', 'admin'];
              if (!excludeWords.includes(candidate)) {
                clusterName = candidate;
                break;
              }
            }
          }

          if (clusterName && !passwords[clusterName]) {
            passwords[clusterName] = password;
            debugLog(`[Password Parser] Found (via Login): ${clusterName} → Password: ${'*'.repeat(password.length)}`);
          }
          break;
        }
      }
    }
  }

  debugLog(``);
  debugLog(`[Password Parser] SUMMARY:`);
  debugLog(`[Password Parser] Total passwords found: ${Object.keys(passwords).length}`);
  for (const [name, pwd] of Object.entries(passwords)) {
    debugLog(`  ✅ ${name} → ${'*'.repeat(pwd.length)}`);
  }

  return passwords;
}

// ── Create clusters using extracted passwords ────
function createClustersWithPasswords(clusterNames, clusterRoles, passwords, jenkinsUrl, debugLog = console.log, customGroupName = '', extractedUrls = {}) {
  const results = [];
  const jobIdMatch = jenkinsUrl.match(/\/job\/([^\/]+)\/(\d+)/);
  const autoGroupId = jobIdMatch ? jobIdMatch[2] : null;

  // Use custom group name if provided, otherwise use auto-detected job ID
  const groupId = customGroupName || autoGroupId;

  debugLog(`[Cluster Builder] Creating ${clusterNames.length} cluster(s) with passwords...`);
  debugLog(`[Cluster Builder] Expected clusters: ${clusterNames.join(', ')}`);
  debugLog(`[Cluster Builder] Available passwords: ${Object.keys(passwords).join(', ')}`);

  if (Object.keys(extractedUrls).length > 0) {
    debugLog(`[Cluster Builder] 📍 Console URLs available for ${Object.keys(extractedUrls).length} cluster(s):`);
    for (const [name, url] of Object.entries(extractedUrls)) {
      debugLog(`[Cluster Builder]   ✅ ${name} → ${url}`);
    }
  } else {
    debugLog(`[Cluster Builder] ⚠️  No console URLs extracted - will construct URLs with default domain`);
  }

  if (customGroupName) {
    debugLog(`[Cluster Builder] Using custom group name: "${customGroupName}"`);
  } else if (autoGroupId) {
    debugLog(`[Cluster Builder] Using auto-detected group ID: "${autoGroupId}"`);
  }
  debugLog(``);

  for (let i = 0; i < clusterNames.length; i++) {
    const clusterName = clusterNames[i];
    const clusterRole = clusterRoles[i] || 'unknown';

    debugLog(`[Cluster Builder] Processing ${i + 1}/${clusterNames.length}: ${clusterName}`);

    // Try to find password for this cluster
    let password = passwords[clusterName];

    if (!password) {
      // Try variations (underscores vs dashes)
      const nameWithDashes = clusterName.replace(/_/g, '-');
      const nameWithUnderscores = clusterName.replace(/-/g, '_');

      password = passwords[nameWithDashes] || passwords[nameWithUnderscores];

      if (password) {
        debugLog(`  → Found password via variation: ${nameWithDashes !== clusterName ? nameWithDashes : nameWithUnderscores}`);
      }
    }

    if (password) {
      // Use extracted console URL if available, otherwise construct one
      // Try lowercase cluster name and variations with dashes/underscores
      const lowerName = clusterName.toLowerCase();
      let consoleUrl = null;
      let urlSource = '';

      // Priority 1: Exact match
      if (extractedUrls[lowerName]) {
        consoleUrl = extractedUrls[lowerName];
        urlSource = 'extracted (exact match)';
      }
      // Priority 2: With dashes instead of underscores
      else if (extractedUrls[lowerName.replace(/_/g, '-')]) {
        consoleUrl = extractedUrls[lowerName.replace(/_/g, '-')];
        urlSource = 'extracted (dash variation)';
      }
      // Priority 3: With underscores instead of dashes
      else if (extractedUrls[lowerName.replace(/-/g, '_')]) {
        consoleUrl = extractedUrls[lowerName.replace(/-/g, '_')];
        urlSource = 'extracted (underscore variation)';
      }
      // Priority 4: Construct with default domain
      else {
        consoleUrl = `https://console-openshift-console.apps.${clusterName}.qe.rh-ocs.com`;
        urlSource = 'constructed (default domain)';
      }

      debugLog(`  → Console URL: ${consoleUrl}`);
      debugLog(`  → Source: ${urlSource}`);
      if (!urlSource.startsWith('extracted')) {
        debugLog(`  ⚠️  Using default domain - no URL found in: CLUSTERS_CONFIGURATION, description, or environment variables`);
        debugLog(`  →  Available extracted URLs: ${Object.keys(extractedUrls).join(', ') || 'none'}`);
      }

      const cluster = {
        name: clusterName,
        url: normalizeURL(consoleUrl),
        user: 'kubeadmin',
        password: password,
        role: clusterRole
      };

      if (groupId) {
        cluster.group = groupId;
      }

      results.push(cluster);
      debugLog(`  ✅ Created cluster: ${clusterName} [${clusterRole}]`);
    } else {
      debugLog(`  ⚠️ No password found for: ${clusterName}`);
    }

    debugLog(``);
  }

  debugLog(`[Cluster Builder] FINAL SUMMARY:`);
  debugLog(`[Cluster Builder] Successfully created: ${results.length}/${clusterNames.length} cluster(s)`);
  if (results.length < clusterNames.length) {
    const missingClusters = clusterNames.filter(name =>
      !results.some(r => r.name === name)
    );
    debugLog(`[Cluster Builder] ❌ Missing passwords for: ${missingClusters.join(', ')}`);
    debugLog(`[Cluster Builder] Check if cluster names in description match expected names above`);
  }

  return results;
}

// ── Extract kubeconfig paths from HTML description ────
function extractKubeconfigPaths(htmlDescription, debugLog = console.log) {
  // Parse HTML to find links containing "/kubeconfig"
  // Similar to bash script: grep "/kubeconfig"

  // Strip HTML tags and extract text
  const text = htmlDescription
    .replace(/>/g, '>\n')
    .replace(/</g, '\n<')
    .split('\n')
    .filter(line => !line.trim().startsWith('<') && line.trim().length > 0)
    .join(' ');

  debugLog(`[Path Extractor] Searching for kubeconfig paths in description...`);

  // Find all paths that contain "/kubeconfig"
  const paths = [];
  const regex = /(https?:\/\/[^\s"'<>]+\/kubeconfig)/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const fullPath = match[1];
    // Extract the path up to (but not including) "/kubeconfig"
    const basePath = fullPath.replace(/\/kubeconfig$/, '');
    if (!paths.includes(basePath)) {
      paths.push(basePath);
      debugLog(`[Path Extractor] Found: ${basePath}`);
    }
  }

  // Also try to find paths in href attributes
  const hrefRegex = /href=["']([^"']+\/kubeconfig)["']/gi;
  while ((match = hrefRegex.exec(htmlDescription)) !== null) {
    const fullPath = match[1];
    const basePath = fullPath.replace(/\/kubeconfig$/, '');
    if (!paths.includes(basePath)) {
      paths.push(basePath);
      debugLog(`[Path Extractor] Found (href): ${basePath}`);
    }
  }

  return paths;
}

// ── Extract cluster credentials from Jenkins JSON (no file downloads) ────

// ── Parse Jenkins build parameters for cluster credentials ────
function parseJenkinsParameters(params, jenkinsUrl, debugLog = console.log) {
  const results = [];

  // Extract Jenkins job ID from URL for grouping
  const jobIdMatch = jenkinsUrl.match(/\/job\/([^\/]+)\/(\d+)/);
  const groupId = jobIdMatch ? `${jobIdMatch[1]}-${jobIdMatch[2]}` : null;

  debugLog(`[Param Parser] Parsing ${Object.keys(params).length} parameters for cluster credentials...`);

  // Special handling for CLUSTERS_CONFIGURATION JSON parameter (common in QE jobs)
  if (params.CLUSTERS_CONFIGURATION) {
    debugLog(`[Param Parser] Found CLUSTERS_CONFIGURATION parameter`);
    debugLog(`[Param Parser] Raw value length: ${params.CLUSTERS_CONFIGURATION.length} chars`);
    debugLog(`[Param Parser] First 200 chars: ${params.CLUSTERS_CONFIGURATION.substring(0, 200)}`);
    debugLog(`[Param Parser] Last 100 chars: ${params.CLUSTERS_CONFIGURATION.substring(Math.max(0, params.CLUSTERS_CONFIGURATION.length - 100))}`);

    try {
      // Detect format: JSON or YAML
      let clustersConfig;
      let configStr = params.CLUSTERS_CONFIGURATION.trim();

      // Check if it's YAML format (starts with "- CLUSTER_NAME:" or similar)
      const isYaml = /^[\s"']*-\s+CLUSTER_NAME:/i.test(configStr);

      if (isYaml) {
        debugLog(`[Param Parser] Detected YAML format`);

        // Simple YAML parsing - extract CLUSTER_NAME fields
        // Match lines like: "- CLUSTER_NAME: dnd-jijoy-h135" or "  CLUSTER_NAME: hub"
        const clusterNameMatches = configStr.matchAll(/CLUSTER_NAME:\s*([a-zA-Z0-9_-]+)/gi);
        const clusterNames = [];
        for (const match of clusterNameMatches) {
          if (match[1]) {
            clusterNames.push(match[1]);
          }
        }

        if (clusterNames.length > 0) {
          debugLog(`[Param Parser] Extracted ${clusterNames.length} cluster name(s) from YAML: ${clusterNames.join(', ')}`);
          // Don't parse passwords from params - they're in description
          // Just return empty for now, description parsing will handle it
          debugLog(`[Param Parser] YAML doesn't contain passwords, will use description parsing`);
        } else {
          debugLog(`[Param Parser] No CLUSTER_NAME fields found in YAML`);
        }

        // Return empty - let description parsing handle this
        return results;

      } else {
        // JSON format - try to parse
        debugLog(`[Param Parser] Attempting JSON parse`);

        // Jenkins sometimes wraps JSON in multiple layers of quotes: """[...]""" or """"""[...]""""""
        // Find where the actual JSON starts and ends (should begin with [ or { and end with ] or })
        const firstBracket = Math.max(
          configStr.indexOf('[') >= 0 ? configStr.indexOf('[') : -1,
          configStr.indexOf('{') >= 0 ? configStr.indexOf('{') : -1
        );
        const lastBracket = Math.max(
          configStr.lastIndexOf(']'),
          configStr.lastIndexOf('}')
        );

        if (firstBracket >= 0 && lastBracket > firstBracket) {
          const strippedQuotes = firstBracket > 0 || lastBracket < configStr.length - 1;
          if (strippedQuotes) {
            const originalLength = configStr.length;
            const leadingChars = firstBracket;
            const trailingChars = originalLength - lastBracket - 1;

            configStr = configStr.substring(firstBracket, lastBracket + 1);
            debugLog(`[Param Parser] Stripped ${leadingChars} leading and ${trailingChars} trailing character(s) to extract JSON`);

            // Unescape any escaped quotes
            configStr = configStr.replace(/\\"/g, '"').replace(/\\'/g, "'");
          }
        }

        clustersConfig = JSON.parse(configStr);
      }

      debugLog(`[Param Parser] Successfully parsed CLUSTERS_CONFIGURATION: ${clustersConfig.length} cluster(s)`);

      for (const clusterObj of clustersConfig) {
        debugLog(`[Param Parser] Processing cluster config:`);
        debugLog(`  - CLUSTER_NAME: ${clusterObj.CLUSTER_NAME || 'N/A'}`);
        debugLog(`  - CLUSTER_TYPE: ${clusterObj.CLUSTER_TYPE || 'N/A'}`);

        // Try to find credentials in the cluster object
        const name = clusterObj.CLUSTER_NAME || clusterObj.name || "Cluster";
        const clusterType = clusterObj.CLUSTER_TYPE || clusterObj.type || "";

        // Check multiple possible field names for credentials
        const rawUrl = clusterObj.CONSOLE_URL || clusterObj.console_url ||
                   clusterObj.CLUSTER_URL || clusterObj.cluster_url ||
                   clusterObj.URL || clusterObj.url ||
                   clusterObj.API_URL || clusterObj.api_url;

        const user = clusterObj.ADMIN_USER || clusterObj.admin_user ||
                    clusterObj.USER || clusterObj.user ||
                    clusterObj.USERNAME || clusterObj.username ||
                    clusterObj.KUBEADMIN_USER || clusterObj.kubeadmin_user;

        const password = clusterObj.ADMIN_PASSWORD || clusterObj.admin_password ||
                        clusterObj.PASSWORD || clusterObj.password ||
                        clusterObj.PASS || clusterObj.pass ||
                        clusterObj.KUBEADMIN_PASSWORD || clusterObj.kubeadmin_password;

        const url = normalizeURL(rawUrl);

        debugLog(`  → URL: ${url || 'NOT FOUND'}`);
        debugLog(`  → User: ${user || 'NOT FOUND'}`);
        debugLog(`  → Password: ${password ? '***' : 'NOT FOUND'}`);

        if (url && user && password) {
          if (isOpenShiftClusterURL(url)) {
            const cluster = { name, url, user, password };

            // Map CLUSTER_TYPE to role
            if (clusterType) {
              const typeMap = {
                'Active ACM': 'hub',
                'Passive ACM': 'hub-passive',
                'Primary': 'primary',
                'Secondary': 'secondary',
                'C1': 'primary',
                'C2': 'secondary'
              };
              cluster.role = typeMap[clusterType] || clusterType.toLowerCase();
            }

            if (groupId) cluster.group = groupId;
            results.push(cluster);
            debugLog(`  ✅ Accepted: ${name} - ${url}`);
          } else {
            debugLog(`  ❌ Filtered out (not OpenShift): ${url}`);
          }
        } else {
          debugLog(`  ⚠️ Incomplete credentials in CLUSTERS_CONFIGURATION object`);
        }
      }

      if (results.length > 0) {
        debugLog(`[Param Parser] Extracted ${results.length} cluster(s) from CLUSTERS_CONFIGURATION`);
        debugLog("");
        return results;
      } else {
        debugLog(`[Param Parser] No complete credentials found in CLUSTERS_CONFIGURATION objects`);
        debugLog(`[Param Parser] Will continue checking for KEY=VALUE style parameters...`);
      }
    } catch (e) {
      debugLog(`[Param Parser] Failed to parse CLUSTERS_CONFIGURATION as JSON: ${e.message}`);
      debugLog(`[Param Parser] Error details: ${e.stack || e}`);

      // Check if the value looks truncated (doesn't end with closing bracket)
      const configStr = params.CLUSTERS_CONFIGURATION.trim();
      if (!configStr.endsWith(']') && !configStr.endsWith('}')) {
        debugLog(`[Param Parser] ⚠️ CLUSTERS_CONFIGURATION appears to be TRUNCATED by Jenkins API`);
        debugLog(`[Param Parser] Value ends with: "${configStr.substring(configStr.length - 20)}"`);
        debugLog(`[Param Parser] Expected it to end with ] or }`);
        debugLog(`[Param Parser] This is a known Jenkins API limitation for long parameters`);
        debugLog(`[Param Parser] WORKAROUND: Check for artifacts or use console output paste`);
      }

      debugLog(`[Param Parser] Will continue checking for KEY=VALUE style parameters...`);
    }
  }

  debugLog("");

  // Find cluster prefixes by looking for URL fields
  const prefixes = new Set();
  for (const key of Object.keys(params)) {
    // Look for URL fields to identify cluster prefixes
    // Common patterns: HUB_URL, C1_CONSOLE_URL, PRIMARY_URL, etc.
    if (key.endsWith('_URL') || key.endsWith('_CONSOLE_URL') || key.endsWith('_CONSOLE') || key.endsWith('_API_URL')) {
      const suffixes = ['_URL', '_CONSOLE_URL', '_CONSOLE', '_API_URL'];
      for (const suffix of suffixes) {
        if (key.endsWith(suffix)) {
          const prefix = key.slice(0, key.length - suffix.length);
          prefixes.add(prefix);
          debugLog(`[Param Parser] Found cluster prefix: ${prefix} (from ${key})`);
          break;
        }
      }
    }
  }

  debugLog(`[Param Parser] Found ${prefixes.size} potential cluster prefix(es)`);

  // For each prefix, try to extract a complete cluster credential set
  for (const prefix of prefixes) {
    const name = params[`${prefix}_NAME`] || params[`${prefix}_CLUSTER_NAME`] ||
                 params[`${prefix}_CLUSTER`] || prefix.toLowerCase().replace(/_/g, '-');

    const rawUrl = params[`${prefix}_URL`] || params[`${prefix}_CONSOLE_URL`] ||
               params[`${prefix}_CONSOLE`] || params[`${prefix}_API_URL`];

    const user = params[`${prefix}_USER`] || params[`${prefix}_USERNAME`] ||
                params[`${prefix}_ADMIN`] || params[`${prefix}_ADMIN_USER`];

    const password = params[`${prefix}_PASSWORD`] || params[`${prefix}_PASS`] ||
                    params[`${prefix}_PWD`] || params[`${prefix}_ADMIN_PASSWORD`];

    const role = params[`${prefix}_ROLE`] || params[`${prefix}_TYPE`];

    const url = normalizeURL(rawUrl);

    debugLog(`[Param Parser] Checking prefix "${prefix}":`);
    debugLog(`  → URL: ${url || 'NOT FOUND'}`);
    debugLog(`  → User: ${user || 'NOT FOUND'}`);
    debugLog(`  → Password: ${password ? '***' : 'NOT FOUND'}`);

    if (url && user && password) {
      if (isOpenShiftClusterURL(url)) {
        const cluster = { name, url, user, password };
        if (role) cluster.role = role.toLowerCase();
        if (groupId) cluster.group = groupId;
        results.push(cluster);
        debugLog(`  ✅ Accepted: ${name} - ${url}`);
      } else {
        debugLog(`  ❌ Filtered out (not OpenShift): ${url}`);
      }
    } else {
      debugLog(`  ⚠️ Incomplete credentials - skipped`);
    }
  }

  debugLog(`[Param Parser] Result: ${results.length} cluster(s) extracted from parameters`);
  debugLog("");

  return results;
}

// ── Check if URL is an OpenShift cluster ─────────────
function isOpenShiftClusterURL(url) {
  if (!url || typeof url !== 'string') return false;

  const urlLower = url.toLowerCase();

  // Must be HTTPS/HTTP URL
  if (!urlLower.startsWith('http://') && !urlLower.startsWith('https://')) return false;

  // Exclude known non-OpenShift services first (higher priority)
  const excludePatterns = [
    'gitlab',
    'github',
    'bitbucket',
    'jenkins',
    'jira',
    'confluence',
    'artifactory',
    'nexus',
    'sonarqube',
    'docker.io',
    'registry.access.redhat.com',
    'quay.io',
  ];

  // Check if it contains any exclude patterns
  for (const pattern of excludePatterns) {
    if (urlLower.includes(pattern)) {
      console.log(`[Filter] Excluding ${url} - matches pattern: ${pattern}`);
      return false;
    }
  }

  // Check for OpenShift-specific patterns in hostname
  const openshiftPatterns = [
    'console-openshift-console',  // Standard OpenShift console
    'console.openshift',          // Alternative console format
    'oauth-openshift',            // OAuth endpoint
    'api.openshift',              // API endpoint
    '.apps.',                     // OpenShift routes domain (with dots on both sides)
    'openshift.com',              // Red Hat hosted
    'openshiftapps.com',          // Red Hat hosted
    'rhcloud.com',                // Red Hat cloud
  ];

  // Check if it contains any OpenShift patterns
  for (const pattern of openshiftPatterns) {
    if (urlLower.includes(pattern)) {
      console.log(`[Filter] Accepting ${url} - matches OpenShift pattern: ${pattern}`);
      return true;
    }
  }

  // Also check if it looks like an OCP cluster URL with typical structure
  // e.g., https://console-openshift-console.apps.cluster-name.domain.com
  // or https://api.cluster-name.domain.com:6443
  if ((urlLower.includes('console') && urlLower.includes('.apps.')) ||
      (urlLower.includes('api.') && urlLower.includes(':6443'))) {
    console.log(`[Filter] Accepting ${url} - looks like OpenShift cluster URL`);
    return true;
  }

  console.log(`[Filter] Excluding ${url} - no OpenShift patterns found`);
  return false;
}

// ── Parse artifact content (JSON/YAML/ENV files) ──────
function parseArtifactContent(content, fileName, jenkinsUrl, debugLog = console.log) {
  const jobIdMatch = jenkinsUrl.match(/\/job\/([^\/]+)\/(\d+)/);
  const groupId = jobIdMatch ? `${jobIdMatch[1]}-${jobIdMatch[2]}` : null;

  let clusters = [];

  // Try parsing as JSON first
  if (fileName.endsWith('.json')) {
    try {
      clusters = parseJSON(content);
      debugLog(`[Artifact Parser] Parsed ${fileName} as JSON: ${clusters.length} cluster(s)`);
    } catch (e) {
      debugLog(`[Artifact Parser] Failed to parse ${fileName} as JSON: ${e.message}`);
    }
  }
  // Try parsing as YAML
  else if (fileName.endsWith('.yaml') || fileName.endsWith('.yml')) {
    try {
      clusters = parseYAML(content);
      debugLog(`[Artifact Parser] Parsed ${fileName} as YAML: ${clusters.length} cluster(s)`);
    } catch (e) {
      debugLog(`[Artifact Parser] Failed to parse ${fileName} as YAML: ${e.message}`);
    }
  }
  // Try parsing as ENV
  else if (fileName.endsWith('.env') || fileName.endsWith('.txt')) {
    try {
      clusters = parseEnv(content);
      debugLog(`[Artifact Parser] Parsed ${fileName} as ENV: ${clusters.length} cluster(s)`);
    } catch (e) {
      debugLog(`[Artifact Parser] Failed to parse ${fileName} as ENV: ${e.message}`);
    }
  }

  // Filter to only OpenShift clusters
  const beforeFilter = clusters.length;
  clusters = clusters.filter(c => {
    const isOCP = isOpenShiftClusterURL(c.url);
    if (!isOCP) {
      debugLog(`[Artifact Parser] ❌ Filtered out (not OpenShift): ${c.url}`);
    } else {
      debugLog(`[Artifact Parser] ✅ Accepted: ${c.url}`);
    }
    return isOCP;
  });

  if (beforeFilter > clusters.length) {
    debugLog(`[Artifact Parser] Filtered ${beforeFilter - clusters.length} non-OpenShift credential(s) from ${fileName}`);
  }

  // Add group ID to all clusters
  if (groupId) {
    clusters.forEach(c => {
      if (!c.group) c.group = groupId;
    });
  }

  return clusters;
}

// ── Parse Jenkins console output for cluster credentials ─
function parseJenkinsConsoleOutput(consoleText, jenkinsUrl, debugLog = console.log) {
  const clusters = [];

  // Extract Jenkins job ID from URL for grouping
  const jobIdMatch = jenkinsUrl.match(/\/job\/([^\/]+)\/(\d+)/);
  const groupId = jobIdMatch ? `${jobIdMatch[1]}-${jobIdMatch[2]}` : null;

  debugLog(`[Parser] Starting to parse console output...`);
  debugLog(`[Parser] Job ID: ${groupId || 'N/A'}`);

  // Common patterns for cluster credentials in Jenkins output
  const patterns = [
    // Pattern 1: KEY=VALUE format (like .env) - case insensitive, more flexible
    {
      name: "env-vars",
      parse: (text) => {
        const vars = {};
        const lines = text.split('\n');

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;

          // Match KEY=VALUE or KEY: VALUE
          const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*[=:]\s*(.+)$/i);
          if (match) {
            const key = match[1].trim().toUpperCase();
            const val = match[2].trim().replace(/^["']|["']$/g, '');
            vars[key] = val;
          }
        }

        // Find cluster prefixes by looking for URL fields
        const prefixes = new Set();
        for (const key of Object.keys(vars)) {
          // Look for URL fields to identify cluster prefixes
          if (key.endsWith('_URL') || key.endsWith('_CONSOLE_URL') || key.endsWith('_CONSOLE')) {
            const suffixes = ['_URL', '_CONSOLE_URL', '_CONSOLE'];
            for (const suffix of suffixes) {
              if (key.endsWith(suffix)) {
                prefixes.add(key.slice(0, key.length - suffix.length));
                break;
              }
            }
          }
        }

        const results = [];
        for (const prefix of prefixes) {
          const name = vars[`${prefix}_NAME`] || vars[`${prefix}_CLUSTER_NAME`] ||
                       vars[`${prefix}_CLUSTER`] || prefix.toLowerCase().replace(/_/g, '-');
          const rawUrl = vars[`${prefix}_URL`] || vars[`${prefix}_CONSOLE_URL`] ||
                     vars[`${prefix}_CONSOLE`] || vars[`${prefix}_API_URL`];
          const user = vars[`${prefix}_USER`] || vars[`${prefix}_USERNAME`] ||
                      vars[`${prefix}_ADMIN`] || vars[`${prefix}_ADMIN_USER`];
          const password = vars[`${prefix}_PASSWORD`] || vars[`${prefix}_PASS`] ||
                          vars[`${prefix}_PWD`] || vars[`${prefix}_ADMIN_PASSWORD`];
          const role = vars[`${prefix}_ROLE`] || vars[`${prefix}_TYPE`];

          const url = normalizeURL(rawUrl);

          if (url && user && password) {
            if (isOpenShiftClusterURL(url)) {
              const cluster = { name, url, user, password };
              if (role) cluster.role = role.toLowerCase();
              if (groupId) cluster.group = groupId;
              results.push(cluster);
              debugLog(`    ✅ Accepted: ${url}`);
            } else {
              debugLog(`    ❌ Filtered out (not OpenShift): ${url}`);
            }
          }
        }

        return results;
      }
    },

    // Pattern 2: JSON blocks in output (nested support)
    {
      name: "json-blocks",
      parse: (text) => {
        const results = [];

        // Try to find JSON arrays or objects
        const jsonBlockRegex = /[\[{][\s\S]*?[\]}]/g;
        const matches = text.match(jsonBlockRegex) || [];

        for (const match of matches) {
          try {
            const parsed = JSON.parse(match);
            const arr = Array.isArray(parsed) ? parsed : [parsed];

            for (const obj of arr) {
              if (obj && typeof obj === 'object') {
                const rawUrl = obj.url || obj.console_url || obj.consoleUrl || obj.api_url;
                const user = obj.user || obj.username || obj.admin || obj.admin_user;
                const password = obj.password || obj.pass || obj.pwd || obj.admin_password;
                const name = obj.name || obj.cluster_name || obj.clusterName || "Cluster";

                const url = normalizeURL(rawUrl);

                if (url && user && password) {
                  if (isOpenShiftClusterURL(url)) {
                    const cluster = { name, url, user, password };
                    if (obj.role) cluster.role = obj.role.toLowerCase();
                    if (groupId) cluster.group = groupId;
                    results.push(cluster);
                    debugLog(`    ✅ Accepted: ${url}`);
                  } else {
                    debugLog(`    ❌ Filtered out (not OpenShift): ${url}`);
                  }
                }
              }
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }

        return results;
      }
    },

    // Pattern 3: Table-like output
    {
      name: "table-format",
      parse: (text) => {
        const results = [];

        // Look for patterns like:
        // Name: HUB  URL: https://...  User: admin  Password: xxx
        // or multi-line blocks
        const blockRegex = /(?:Name|Cluster|CLUSTER_NAME)\s*[:\s]\s*([^\n]+)[\s\S]*?(?:URL|Console|CONSOLE_URL)\s*[:\s]\s*(https?:\/\/[^\s]+)[\s\S]*?(?:User|Username|USER)\s*[:\s]\s*([^\s]+)[\s\S]*?(?:Password|Pass|PASSWORD)\s*[:\s]\s*([^\s]+)/gi;

        let match;
        while ((match = blockRegex.exec(text)) !== null) {
          const url = normalizeURL(match[2].trim());
          if (isOpenShiftClusterURL(url)) {
            const cluster = {
              name: match[1].trim(),
              url: url,
              user: match[3].trim(),
              password: match[4].trim()
            };
            if (groupId) cluster.group = groupId;
            results.push(cluster);
            debugLog(`    ✅ Accepted: ${url}`);
          } else {
            debugLog(`    ❌ Filtered out (not OpenShift): ${url}`);
          }
        }

        return results;
      }
    },

    // Pattern 4: Common script output formats
    {
      name: "script-output",
      parse: (text) => {
        const results = [];

        // Look for echo/print statements with credentials
        // e.g., "Login to https://... with admin / password123"
        const loginRegex = /(?:login to|access|connect to|url is)\s+(https?:\/\/[^\s]+).*?(?:with|using|user|username)\s+([^\s\/]+)\s*[\/]\s*([^\s]+)/gi;

        let match;
        while ((match = loginRegex.exec(text)) !== null) {
          const url = normalizeURL(match[1].trim());
          if (isOpenShiftClusterURL(url)) {
            const cluster = {
              name: "Cluster",
              url: url,
              user: match[2].trim(),
              password: match[3].trim()
            };
            if (groupId) cluster.group = groupId;
            results.push(cluster);
            debugLog(`    ✅ Accepted: ${url}`);
          } else {
            debugLog(`    ❌ Filtered out (not OpenShift): ${url}`);
          }
        }

        return results;
      }
    }
  ];

  debugLog(`[Parser] Trying ${patterns.length} parsing patterns...`);
  debugLog("");

  // Try each pattern
  for (const pattern of patterns) {
    try {
      debugLog(`[Parser] Trying pattern: ${pattern.name}`);
      const parsed = pattern.parse(consoleText);
      if (parsed.length > 0) {
        debugLog(`[Parser] ✅ Pattern "${pattern.name}" found ${parsed.length} cluster(s)`);
        for (const cluster of parsed) {
          debugLog(`  → ${cluster.name}: ${cluster.url}`);
        }
        clusters.push(...parsed);
      } else {
        debugLog(`[Parser] ⚠️ Pattern "${pattern.name}" - no matches`);
      }
    } catch (e) {
      debugLog(`[Parser] ❌ Pattern "${pattern.name}" failed: ${e.message}`);
    }
  }

  debugLog("");

  // Remove duplicates based on URL
  const seen = new Set();
  const unique = clusters.filter(c => {
    if (seen.has(c.url)) return false;
    seen.add(c.url);
    return true;
  });

  debugLog(`[Parser] Total matches: ${clusters.length}, Unique: ${unique.length}`);

  return unique;
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
