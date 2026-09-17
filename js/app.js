/**
 * Main Application Orchestrator
 * Provincial Assessor's Office Queue System (Dashboard Edition)
 */

import { queueState, DEFAULT_USERS, STAGE_DEFINITIONS } from './state.js?v=2.2';
import { audioEngine } from './audio.js?v=2.2';
import { kioskController } from './kiosk.js?v=2.2';
import { displayController } from './display.js?v=2.2';
import { consoleController } from './console.js?v=2.2';
import { adminController } from './admin.js?v=2.2';

window.queueState = queueState;
window.audioEngine = audioEngine;
window.kioskApp = kioskController;
window.displayApp = displayController;
window.consoleApp = consoleController;
window.adminApp = adminController;

class App {
  constructor() {
    this.currentView = 'kiosk';
    this.rightQueueFilter = 'all';
    this.globalSearchTerm = '';
  }

  init() {
    let viewParam = 'kiosk';
    try {
      const urlParams = new URLSearchParams(window.location.search);
      viewParam = urlParams.get('view') || window.location.hash.replace('#', '') || 'kiosk';
    } catch (e) {
      viewParam = window.location.hash.replace('#', '') || 'kiosk';
    }

    this.initTheme();
    this.bindNavigation();
    this.bindRightSidebar();
    this.bindGlobalSearch();
    this.initAuthSync();

    kioskController.init();
    displayController.init();
    consoleController.init();
    adminController.init();

    this.switchView(viewParam);

    // Initial stats and queue stream render
    this.renderTelemetryAndRightQueue();

    queueState.subscribe((state) => {
      this.renderTelemetryAndRightQueue(state);
    });

    // 1-second live ticking timer for right sidebar queue stream
    setInterval(() => {
      this.renderRightQueueList();
    }, 1000);

    // Auto unlock audio
    const unlockAudio = () => {
      audioEngine.getAudioContext();
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
    };
    document.addEventListener('click', unlockAudio, { once: true });
    document.addEventListener('keydown', unlockAudio, { once: true });

    // Multi-window launcher
    const btnDisplayWin = document.getElementById('btn-open-tv-window');
    if (btnDisplayWin) {
      btnDisplayWin.onclick = () => {
        window.open('tv.html', 'ProvincialAssessorDisplay', 'width=1366,height=768,menubar=no,toolbar=no');
      };
    }
  }

  switchView(viewName) {
    const validViews = ['kiosk', 'display', 'console', 'admin'];
    let target = validViews.includes(viewName) ? viewName : 'console';
    const currentUser = queueState.getCurrentUser();

    // Strict Role-Based View Guard
    if (!queueState.canAccessView(target)) {
      const assignedPost = currentUser && currentUser.stationId ? `Station ${currentUser.stationId}` : 'Specialist Desk';
      if (window.consoleApp) {
        window.consoleApp.showToast(`Access Restricted: ${assignedPost} staff cannot access ${target.toUpperCase()}. Restricted to Administrator.`);
      }
      target = 'console';
      if (currentUser && currentUser.stationId) {
        consoleController.selectedCounterId = Number(currentUser.stationId);
      }
    }

    this.currentView = target;

    // Update Nav Buttons
    document.querySelectorAll('.nav-item-btn').forEach(btn => {
      const isTarget = btn.dataset.view === target || btn.getAttribute('data-view') === target;
      btn.classList.toggle('active', isTarget);
    });

    // Update View Sections
    document.querySelectorAll('.view-section').forEach(sec => {
      const isTarget = sec.id === `view-${target}`;
      sec.classList.toggle('active', isTarget);
    });

    // Render target view immediately
    if (target === 'display') {
      displayController.render();
    } else if (target === 'console') {
      consoleController.render();
    } else if (target === 'admin') {
      adminController.render();
    } else if (target === 'kiosk') {
      kioskController.renderServiceCards();
    }

    // Safely update URL
    try {
      if (window.location.protocol !== 'file:') {
        history.replaceState(null, '', `?view=${target}`);
      } else {
        window.location.hash = target;
      }
    } catch (e) {
      // Ignored for file:// security restriction
    }
  }

  initTheme() {
    let savedTheme = 'light';
    try {
      savedTheme = localStorage.getItem('assessor_theme_preference') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    } catch (e) {
      savedTheme = 'light';
    }
    this.setTheme(savedTheme);
  }

  setTheme(theme) {
    this.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('assessor_theme_preference', theme);
    } catch (e) {}

    const darkIcon = document.querySelector('.theme-icon-dark');
    const lightIcon = document.querySelector('.theme-icon-light');
    if (darkIcon && lightIcon) {
      if (theme === 'dark') {
        darkIcon.style.display = 'none';
        lightIcon.style.display = 'inline-block';
      } else {
        darkIcon.style.display = 'inline-block';
        lightIcon.style.display = 'none';
      }
    }
  }

  toggleTheme() {
    const nextTheme = this.theme === 'dark' ? 'light' : 'dark';
    this.setTheme(nextTheme);
  }

  switchToCounter(counterId) {
    const cid = Number(counterId);
    const currentUser = queueState.getCurrentUser();

    // Check station access permission
    if (!queueState.canAccessStation(cid)) {
      if (window.consoleApp) {
        window.consoleApp.showToast(`Station ${cid} is locked to its designated officer. You are assigned to Station ${currentUser?.stationId || 'your post'}.`);
      }
      return;
    }

    consoleController.selectedCounterId = cid;

    this.switchView('console');
    const select = document.getElementById('console-counter-select');
    if (select) {
      select.value = cid;
      consoleController.render();
    }
    this.renderSidebarPermissions(queueState.getCurrentUser());
  }

  bindNavigation() {
    document.querySelectorAll('.nav-item-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        const view = btn.dataset.view || btn.getAttribute('data-view');
        if (view) this.switchView(view);
      };
    });

    const notifBtn = document.getElementById('header-notif-btn');
    if (notifBtn) {
      notifBtn.onclick = () => {
        if (window.consoleApp) {
          window.consoleApp.showToast('All 6 Assessment Workflow Stations are online and syncing in real time.');
        }
      };
    }

    window.onpopstate = () => {
      let viewParam = 'kiosk';
      try {
        const urlParams = new URLSearchParams(window.location.search);
        viewParam = urlParams.get('view') || window.location.hash.replace('#', '') || 'kiosk';
      } catch (e) {
        viewParam = window.location.hash.replace('#', '') || 'kiosk';
      }
      this.switchView(viewParam);
    };

    window.onhashchange = () => {
      const viewParam = window.location.hash.replace('#', '') || 'kiosk';
      this.switchView(viewParam);
    };
  }

  bindRightSidebar() {
    const tabs = document.querySelectorAll('.queue-tab-item');
    tabs.forEach(tab => {
      tab.onclick = () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.rightQueueFilter = tab.dataset.filter || 'all';
        this.renderRightQueueList();
      };
    });
  }

  bindGlobalSearch() {
    const searchInput = document.getElementById('global-search-input');
    if (searchInput) {
      searchInput.oninput = (e) => {
        this.globalSearchTerm = e.target.value.toLowerCase().trim();
        this.renderRightQueueList();
      };
    }
  }

  renderTelemetryAndRightQueue(stateData = null) {
    const state = stateData || queueState.getRawState() || {};
    const tickets = state.tickets || [];

    const servedCount = tickets.filter(t => t.status === 'completed').length;
    const waitingCount = tickets.filter(t => t.status === 'waiting').length;

    const statServed = document.getElementById('stat-served');
    const statWaiting = document.getElementById('stat-waiting');
    const statAvgWait = document.getElementById('stat-avg-wait');

    if (statServed) statServed.innerText = servedCount;
    if (statWaiting) statWaiting.innerText = waitingCount;
    if (statAvgWait) {
      const avgSec = state.stats?.avgWaitSeconds || 0;
      const mins = Math.floor(avgSec / 60);
      statAvgWait.innerText = `${mins}m`;
    }

    const rightBadge = document.getElementById('right-queue-count-badge');
    if (rightBadge) rightBadge.innerText = `${waitingCount} In-Line`;

    this.renderRightQueueList(state);
  }

  renderRightQueueList(stateData = null) {
    const container = document.getElementById('right-queue-stream-list');
    if (!container) return;

    const state = stateData || queueState.getRawState() || {};
    let tickets = [...(state.tickets || [])];

    // Priority sorting: Calling -> Serving -> Waiting (arrival order) -> Completed -> No-show
    const statusPriority = { 'calling': 1, 'serving': 2, 'waiting': 3, 'completed': 4, 'noshow': 5 };
    tickets.sort((a, b) => {
      const pA = statusPriority[a.status] || 99;
      const pB = statusPriority[b.status] || 99;
      if (pA !== pB) return pA - pB;
      if (a.status === 'waiting') return (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0);
      return (Number(b.completedAt || b.startedAt || b.calledAt || b.createdAt) || 0) - (Number(a.completedAt || a.startedAt || a.calledAt || a.createdAt) || 0);
    });

    if (this.rightQueueFilter === 'waiting') {
      tickets = tickets.filter(t => t.status === 'waiting');
    } else if (this.rightQueueFilter === 'priority') {
      tickets = tickets.filter(t => t.isPriority);
    }

    if (this.globalSearchTerm) {
      tickets = tickets.filter(t =>
        String(t.ticketNumber).toLowerCase().includes(this.globalSearchTerm) ||
        (t.serviceName || '').toLowerCase().includes(this.globalSearchTerm) ||
        (t.priorityType || '').toLowerCase().includes(this.globalSearchTerm) ||
        (t.notes || '').toLowerCase().includes(this.globalSearchTerm)
      );
    }

    if (tickets.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 24px 8px; color: var(--color-text-muted); font-size: 12px; background: var(--colors-surface-soft); border-radius: var(--rounded-lg); border: 1px dashed var(--colors-hairline);">
          <div>No active queue records found.</div>
          <div style="font-size: 10px; margin-top: 4px; color: var(--colors-mute);">Issue a ticket from Client Kiosk</div>
        </div>
      `;
      return;
    }

    container.innerHTML = tickets.map(t => {
      let waitSecs = 0;
      let statusBadge = '';
      let timerLabel = '';

      if (t.status === 'serving') {
        const start = t.startedAt || t.calledAt || t.createdAt || Date.now();
        const servSecs = Math.max(0, Math.floor((Date.now() - Number(start)) / 1000));
        const servStr = servSecs >= 60 ? `${Math.floor(servSecs / 60)}m ${servSecs % 60}s` : `${servSecs}s`;
        statusBadge = `<span class="tag-badge" style="background:#2563eb; color:#ffffff; font-size:8.5px; font-weight:700; padding:1px 6px;">SERVING • ${t.counterName || 'Window'}</span>`;
        timerLabel = `<span style="color:#2563eb; font-weight:700;">⏱ ${servStr}</span>`;
      } else if (t.status === 'calling') {
        statusBadge = `<span class="tag-badge" style="background:#000000; color:#ffffff; font-size:8.5px; font-weight:700; padding:1px 6px; animation:alertPulse 1s infinite alternate;">CALLING NOW</span>`;
        timerLabel = `<span style="color:#000000; font-weight:700;">${t.counterName || 'Window'}</span>`;
      } else if (t.status === 'waiting') {
        waitSecs = Math.max(0, Math.floor((Date.now() - Number(t.createdAt)) / 1000));
        const waitStr = waitSecs >= 60 ? `${Math.floor(waitSecs / 60)}m ${waitSecs % 60}s` : `${waitSecs}s`;
        statusBadge = `<span class="tag-badge" style="background:var(--colors-surface-soft); color:var(--colors-charcoal); border:1px solid var(--colors-hairline); font-size:8.5px; font-weight:700; padding:1px 6px;">WAITING</span>`;
        timerLabel = `<span style="color:var(--colors-body);">⏱ ${waitStr}</span>`;
      } else if (t.status === 'completed') {
        const totalSecs = (t.serviceSeconds || 0) + (t.waitSeconds || 0);
        const doneStr = totalSecs >= 60 ? `${Math.floor(totalSecs / 60)}m ${totalSecs % 60}s` : `${totalSecs}s`;
        statusBadge = `<span class="tag-badge" style="background:#ffffff; color:#000000; border:1px solid #000000; font-size:8.5px; font-weight:700; padding:1px 6px;">COMPLETED</span>`;
        timerLabel = `<span style="color:var(--colors-mute);">${doneStr}</span>`;
      } else if (t.status === 'noshow') {
        statusBadge = `<span class="tag-badge" style="background:#f5f5f5; color:#737373; border:1px solid #d4d4d4; font-size:8.5px; font-weight:700; padding:1px 6px;">NO SHOW</span>`;
        timerLabel = `<span style="color:var(--colors-mute);">Cancelled</span>`;
      }

      const priorityTag = t.isPriority ? `<span style="color:#d97706; font-weight:700; font-size:9.5px;">★ ${(t.priorityType || 'Priority').toUpperCase()}</span>` : '<span style="color:var(--colors-mute); font-size:9.5px;">Regular</span>';
      const clientName = t.clientName || 'Juan Dela Cruz';
      const stageName = t.currentStageShortName || t.currentStageName || 'Review';

      return `
        <div class="queue-stream-item" onclick="window.kioskApp.openMobileTrackerSimulator('${t.ticketNumber}')" title="Click to open Live Mobile Tracker for Pass #${t.ticketNumber}">
          <div class="queue-avatar-chip ${t.isPriority ? 'priority' : ''}">
            ${t.isPriority ? '★' : '#' + t.ticketNumber}
          </div>
          <div class="queue-stream-meta">
            <div style="display:flex; align-items:center; gap:5px; margin-bottom:2px;">
              <span class="queue-stream-name" style="font-weight: 800;">${clientName}</span>
              <span style="font-size: 11px; font-family: var(--font-mono); color: var(--colors-body);">#${t.ticketNumber}</span>
              ${statusBadge}
            </div>
            <div class="queue-stream-sub" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:140px;" title="${t.serviceName}">
              ${t.serviceName}
            </div>
            <div style="margin-top:2px; display: flex; align-items: center; gap: 6px;">
              ${priorityTag}
              <span style="font-size: 9.5px; color: #2563eb; font-weight: 600;">• ${stageName}</span>
            </div>
          </div>
          <div style="text-align: right; flex-shrink: 0; margin-left: 6px;">
            <div class="queue-stream-ticket">#${t.ticketNumber}</div>
            <div style="font-size: 9.5px; font-family: var(--font-mono);">${timerLabel}</div>
          </div>
        </div>
      `;
    }).join('');
  }
  // =========================================================================
  // DESIGNATED STAFF AUTH & ACCOUNT SWITCHER
  // =========================================================================

  initAuthSync() {
    queueState.subscribeAuth((user) => {
      this.renderHeaderUserChip(user);
      this.renderAuthModalActiveUser(user);
      this.renderSidebarPermissions(user);

      // If current view is not allowed for newly switched user, navigate to console
      if (!queueState.canAccessView(this.currentView)) {
        this.switchView('console');
      }
    });

    // Initial render
    const currentUser = queueState.getCurrentUser();
    this.renderHeaderUserChip(currentUser);
    this.renderSidebarPermissions(currentUser);
  }

  renderSidebarPermissions(user) {
    const adminBtn = document.querySelector('.nav-item-btn[data-view="admin"]');
    const tvBtn = document.querySelector('.nav-item-btn[data-view="display"]');
    const kioskBtn = document.querySelector('.nav-item-btn[data-view="kiosk"]');
    const quickTvBtn = document.querySelector('.prompt-actions-row button[onclick*="switchView(\'display\')"]');
    const topTvWindowBtn = document.getElementById('btn-open-tv-window');
    const quickPromptCard = document.querySelector('.quick-prompt-card');

    const headerLoginBtn = document.getElementById('header-login-btn');
    const headerLogoutBtn = document.getElementById('header-logout-btn');
    const headerLoginText = document.getElementById('header-login-text');

    const navLoginBtn = document.getElementById('sidebar-login-btn');
    const navLogoutBtn = document.getElementById('sidebar-logout-btn');
    const navLoginText = document.getElementById('sidebar-login-text');

    const isAdmin = user && user.role === 'admin';
    const isStation1 = user && Number(user.stationId) === 1 && !isAdmin;

    // Admin view buttons (Admin only)
    if (adminBtn) adminBtn.style.display = isAdmin ? 'flex' : 'none';
    if (tvBtn) tvBtn.style.display = isAdmin ? 'flex' : 'none';
    if (quickTvBtn) quickTvBtn.style.display = isAdmin ? 'inline-flex' : 'none';
    if (topTvWindowBtn) topTvWindowBtn.style.display = isAdmin ? 'inline-flex' : 'none';

    // Kiosk view & ticket issuing prompt (Station 1 intake & Admin only)
    if (kioskBtn) kioskBtn.style.display = (isAdmin || isStation1) ? 'flex' : 'none';
    if (quickPromptCard) quickPromptCard.style.display = (isAdmin || isStation1) ? 'block' : 'none';

    // Account Switcher / Staff Login (Prominently available for all stations & admin)
    if (headerLoginBtn) {
      headerLoginBtn.style.display = 'inline-flex';
      if (headerLoginText) headerLoginText.textContent = user ? 'Switch Account' : 'Sign In';
    }
    if (headerLogoutBtn) {
      headerLogoutBtn.style.display = user ? 'inline-flex' : 'none';
    }

    if (navLoginBtn) {
      navLoginBtn.style.display = 'flex';
      if (navLoginText) navLoginText.textContent = user ? 'Switch Account' : 'Sign In';
    }
    if (navLogoutBtn) {
      navLogoutBtn.style.display = user ? 'flex' : 'none';
    }

    // Sidebar station list
    const currentSelectedStation = window.consoleApp?.selectedCounterId || (user?.stationId ? Number(user.stationId) : 1);
    const stationChips = document.querySelectorAll('.counter-chip-item');
    stationChips.forEach((chip, index) => {
      const stationId = index + 1;
      const canAccess = queueState.canAccessStation(stationId);

      if (canAccess) {
        chip.style.opacity = '1';
        chip.style.cursor = 'pointer';
        chip.style.filter = 'none';
        chip.style.pointerEvents = 'auto';
        chip.title = `Station ${stationId} • Assigned Post`;
      } else {
        chip.style.opacity = '0.35';
        chip.style.cursor = 'not-allowed';
        chip.style.filter = 'grayscale(0.8)';
        chip.style.pointerEvents = 'none';
        chip.title = `Station ${stationId} • Locked to other designated officer`;
      }

      const isCurrent = this.currentView === 'console' && currentSelectedStation === stationId;
      chip.classList.toggle('active', isCurrent);
    });
  }

  renderHeaderUserChip(user) {
    const avatarEl = document.getElementById('header-user-avatar');
    const nameEl = document.getElementById('header-user-name');
    const roleEl = document.getElementById('header-user-role');
    const headerChip = document.getElementById('header-user-chip');

    if (headerChip) {
      headerChip.style.pointerEvents = 'auto';
      headerChip.style.cursor = 'pointer';
      headerChip.title = user ? `Logged in as ${user.fullName} • Click to Switch Station Account` : 'Click to Sign In / Select Station';
    }

    if (!user) {
      if (avatarEl) avatarEl.textContent = '👤';
      if (nameEl) nameEl.textContent = 'Sign In';
      if (roleEl) {
        roleEl.textContent = 'Select Station Account';
        roleEl.style.color = 'var(--color-text-muted)';
      }
      return;
    }

    if (avatarEl) avatarEl.textContent = user.avatar || (user.fullName ? user.fullName.split(' ').map(n=>n[0]).join('').slice(0, 2) : 'ST');
    if (nameEl) nameEl.textContent = user.fullName || 'Station Officer';
    if (roleEl) {
      if (user.role === 'admin') {
        roleEl.textContent = 'Administrator • All Posts';
        roleEl.style.color = '#7c3aed';
      } else if (user.stationId) {
        roleEl.textContent = `Station ${user.stationId} • ${user.stationKey ? user.stationKey.replace(/_/g, ' ') : 'Review'}`;
        roleEl.style.color = 'var(--color-primary)';
      } else {
        roleEl.textContent = user.title || 'Staff Officer';
      }
    }
  }

  renderAuthModalActiveUser(user) {
    const avatarEl = document.getElementById('auth-current-avatar');
    const nameEl = document.getElementById('auth-current-name');
    const titleEl = document.getElementById('auth-current-title');

    if (!user) {
      if (avatarEl) avatarEl.textContent = '👤';
      if (nameEl) nameEl.textContent = 'No Officer Logged In';
      if (titleEl) titleEl.textContent = 'Please select an account below to sign in';
      return;
    }

    if (avatarEl) avatarEl.textContent = user.avatar || 'ST';
    if (nameEl) nameEl.textContent = user.fullName;
    if (titleEl) {
      titleEl.textContent = `${user.title} • ${user.role === 'admin' ? 'System Administrator' : (user.stationName || 'Assessor Station')}`;
    }
  }

  openAuthModal() {
    const modal = document.getElementById('staff-auth-modal');
    if (!modal) return;

    const currentUser = queueState.getCurrentUser();
    this.renderAuthModalActiveUser(currentUser);
    this.renderAuthAccountsGrid();

    modal.classList.add('active');
  }

  closeAuthModal() {
    const modal = document.getElementById('staff-auth-modal');
    if (modal) modal.classList.remove('active');
  }

  renderAuthAccountsGrid() {
    const grid = document.getElementById('auth-accounts-grid');
    if (!grid) return;

    const users = queueState.getUsers();
    const currentUser = queueState.getCurrentUser();

    grid.innerHTML = users.map(u => {
      const isActive = currentUser && (currentUser.id === u.id || currentUser.username === u.username);
      const isStation = u.stationId !== null && u.stationId !== undefined;
      const badgeColor = isStation ? (STAGE_DEFINITIONS.find(s => s.id === u.stationId)?.color || '#2563eb') : '#7c3aed';
      const badgeLabel = isStation ? `STATION ${u.stationId}` : 'ADMINISTRATOR';

      return `
        <div class="auth-account-card ${isActive ? 'active' : ''}" 
             onclick="window.mainApp.loginAsUser('${u.username}')" 
             style="background: ${isActive ? 'rgba(6, 78, 59, 0.08)' : 'var(--color-surface)'}; border: 1.5px solid ${isActive ? '#059669' : 'var(--color-border-subtle)'}; border-radius: var(--radius-control); padding: 12px; cursor: pointer; transition: all 0.2s ease; display: flex; flex-direction: column; justify-content: space-between; position: relative;">
          
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <div class="avatar-round-sm" style="background: ${badgeColor}; color: #ffffff; font-weight: 700; width: 30px; height: 30px; font-size: 11px;">
                ${u.avatar || 'ST'}
              </div>
              <div>
                <div style="font-weight: 700; font-size: 12.5px; color: var(--color-text-main); line-height: 1.2;">
                  ${u.fullName}
                </div>
                <div style="font-size: 10.5px; color: var(--color-text-secondary); max-width: 170px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${u.title}">
                  ${u.title}
                </div>
              </div>
            </div>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; padding-top: 6px; border-top: 1px dashed var(--color-border-subtle);">
            <span style="background: ${badgeColor}15; color: ${badgeColor}; font-size: 9.5px; font-weight: 800; padding: 2px 6px; border-radius: 4px; font-family: var(--font-mono);">
              ${badgeLabel}
            </span>
            <span style="font-size: 10.5px; font-weight: 600; color: ${isActive ? '#059669' : 'var(--color-primary)'};">
              ${isActive ? '✓ Active Post' : 'Switch Post →'}
            </span>
          </div>
        </div>
      `;
    }).join('');
  }

  async loginAsUser(username) {
    const res = await queueState.login(username);
    if (res && res.success) {
      this.closeAuthModal();
      if (window.consoleApp) {
        window.consoleApp.showToast(`Switched account to ${res.user.fullName} (${res.user.title || 'Staff'})`);
        if (this.currentView === 'console' && res.user.stationId) {
          window.consoleApp.selectedCounterId = Number(res.user.stationId);
          window.consoleApp.render();
        }
      }
    } else {
      if (window.consoleApp) {
        window.consoleApp.showToast(res.message || 'Login failed');
      }
    }
  }

  async handleLoginFormSubmit(event) {
    if (event) event.preventDefault();
    const usernameInput = document.getElementById('auth-username-input');
    const passwordInput = document.getElementById('auth-password-input');
    const username = usernameInput ? usernameInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';

    if (!username) return;

    const res = await queueState.login(username, password);
    if (res && res.success) {
      this.closeAuthModal();
      if (usernameInput) usernameInput.value = '';
      if (window.consoleApp) {
        window.consoleApp.showToast(`Logged in successfully as ${res.user.fullName}`);
        if (this.currentView === 'console' && res.user.stationId) {
          window.consoleApp.selectedCounterId = Number(res.user.stationId);
          window.consoleApp.render();
        }
      }
    } else {
      if (window.consoleApp) {
        window.consoleApp.showToast(res.message || 'Invalid username or password');
      }
    }
  }

  async handleLogout() {
    await queueState.logout();
    this.closeAuthModal();
    if (window.consoleApp) {
      window.consoleApp.showToast('Signed out of station account.');
    }
    this.openAuthModal();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
  window.mainApp = app;
});
