/**
 * Main Application Orchestrator
 * Provincial Assessor's Office Queue System (Dashboard Edition)
 */

import { queueState, DEFAULT_USERS, STAGE_DEFINITIONS, SERVICES } from './state.js?v=2.3';
import { audioEngine } from './audio.js?v=2.3';
import { kioskController } from './kiosk.js?v=2.3';
import { displayController } from './display.js?v=2.3';
import { consoleController } from './console.js?v=2.3';
import { adminController } from './admin.js?v=2.3';

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

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeCharterModal();
        this.closeAuthModal();
      }
    });

    // Multi-window launcher
    const btnDisplayWin = document.getElementById('btn-open-tv-window') || document.getElementById('tv-popout-window-btn');
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

    // Update Desktop Nav Buttons
    document.querySelectorAll('.nav-item-btn').forEach(btn => {
      const isTarget = btn.dataset.view === target || btn.getAttribute('data-view') === target;
      btn.classList.toggle('active', isTarget);
    });

    // Update Android Mobile Bottom Nav Buttons
    document.querySelectorAll('.mobile-nav-btn[data-view]').forEach(btn => {
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
        const filter = tab.dataset.filter || 'all';
        this.rightQueueFilter = filter;
        document.querySelectorAll('.queue-tab-item').forEach(t => {
          t.classList.toggle('active', (t.dataset.filter || 'all') === filter);
        });
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

  toggleMobileStationDrawer() {
    const drawer = document.getElementById('mobile-station-drawer');
    const backdrop = document.getElementById('mobile-station-drawer-backdrop');
    if (drawer && backdrop) {
      const isActive = drawer.classList.contains('active');
      this.closeMobileDrawers();
      if (!isActive) {
        drawer.classList.add('active');
        backdrop.classList.add('active');
      }
    }
  }

  toggleMobileQueueDrawer() {
    const drawer = document.getElementById('mobile-queue-drawer');
    const backdrop = document.getElementById('mobile-queue-drawer-backdrop');
    if (drawer && backdrop) {
      const isActive = drawer.classList.contains('active');
      this.closeMobileDrawers();
      if (!isActive) {
        drawer.classList.add('active');
        backdrop.classList.add('active');
        this.renderRightQueueList();
      }
    }
  }

  closeMobileDrawers() {
    const stationDrawer = document.getElementById('mobile-station-drawer');
    const stationBackdrop = document.getElementById('mobile-station-drawer-backdrop');
    const queueDrawer = document.getElementById('mobile-queue-drawer');
    const queueBackdrop = document.getElementById('mobile-queue-drawer-backdrop');
    if (stationDrawer) stationDrawer.classList.remove('active');
    if (stationBackdrop) stationBackdrop.classList.remove('active');
    if (queueDrawer) queueDrawer.classList.remove('active');
    if (queueBackdrop) queueBackdrop.classList.remove('active');
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

    // Android Mobile Drawer Stats
    const mobServed = document.getElementById('mobile-stat-served');
    const mobWaiting = document.getElementById('mobile-stat-waiting');
    const mobAvgWait = document.getElementById('mobile-stat-avg-wait');
    if (mobServed) mobServed.innerText = servedCount;
    if (mobWaiting) mobWaiting.innerText = waitingCount;
    if (mobAvgWait) {
      const avgSec = state.stats?.avgWaitSeconds || 0;
      const mins = Math.floor(avgSec / 60);
      mobAvgWait.innerText = `${mins}m`;
    }

    const rightBadge = document.getElementById('right-queue-count-badge');
    if (rightBadge) rightBadge.innerText = `${waitingCount} In-Line`;

    const mobQueueBadge = document.getElementById('mobile-queue-count-badge');
    if (mobQueueBadge) mobQueueBadge.innerText = waitingCount;

    this.renderRightQueueList(state);
  }

  renderRightQueueList(stateData = null) {
    const container = document.getElementById('right-queue-stream-list');
    const mobContainer = document.getElementById('mobile-queue-stream-list');

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

    const emptyHtml = `
      <div style="text-align: center; padding: 24px 8px; color: var(--color-text-muted); font-size: 12px; background: var(--colors-surface-soft); border-radius: var(--rounded-lg); border: 1px dashed var(--colors-hairline);">
        <div>No active queue records found.</div>
        <div style="font-size: 10px; margin-top: 4px; color: var(--colors-mute);">Issue a ticket from Client Kiosk</div>
      </div>
    `;

    if (tickets.length === 0) {
      if (container) container.innerHTML = emptyHtml;
      if (mobContainer) mobContainer.innerHTML = emptyHtml;
      return;
    }

    const itemsHtml = tickets.map(t => {
      let waitSecs = 0;
      let statusBadge = '';
      let timerLabel = '';

      if (t.status === 'serving') {
        const start = t.startedAt || t.calledAt || t.createdAt || Date.now();
        const servSecs = Math.max(0, Math.floor((Date.now() - Number(start)) / 1000));
        const servStr = servSecs >= 60 ? `${Math.floor(servSecs / 60)}m ${servSecs % 60}s` : `${servSecs}s`;
        statusBadge = `<span class="tag-badge" style="background:#000000; color:#ffffff; font-size:8.5px; font-weight:700; padding:1px 6px;">SERVING • ${t.counterName || 'Window'}</span>`;
        timerLabel = `<span style="color:var(--colors-ink, #000000); font-weight:700;">⏱ ${servStr}</span>`;
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

      const priorityTag = t.isPriority ? `<span style="color:var(--colors-ink, #000000); font-weight:700; font-size:9.5px;">${(t.priorityType || 'Priority').toUpperCase()}</span>` : '<span style="color:var(--colors-mute); font-size:9.5px;">Regular</span>';
      const clientName = t.clientName || 'Juan Dela Cruz';
      const stageName = t.currentStageShortName || t.currentStageName || 'Review';

      return `
        <div class="queue-stream-item" onclick="window.kioskApp.openMobileTrackerSimulator('${t.ticketNumber}')" title="Click to open Live Mobile Tracker for Pass #${t.ticketNumber}">
          <div class="queue-avatar-chip ${t.isPriority ? 'priority' : ''}">
            ${t.isPriority ? 'PRI' : '#' + t.ticketNumber}
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
              <span style="font-size: 9.5px; color: var(--colors-body, #737373); font-weight: 600;">• ${stageName}</span>
            </div>
          </div>
          <div style="text-align: right; flex-shrink: 0; margin-left: 6px;">
            <div class="queue-stream-ticket">#${t.ticketNumber}</div>
            <div style="font-size: 9.5px; font-family: var(--font-mono);">${timerLabel}</div>
          </div>
        </div>
      `;
    }).join('');

    if (container) container.innerHTML = itemsHtml;
    if (mobContainer) mobContainer.innerHTML = itemsHtml;
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
    const topTvWindowBtn = document.getElementById('btn-open-tv-window') || document.getElementById('tv-popout-window-btn');
    const quickPromptCard = document.querySelector('.quick-prompt-card');
    const isAdmin = user && user.role === 'admin';
    const isStation1 = user && Number(user.stationId) === 1 && !isAdmin;

    // Admin view buttons (Admin only)
    if (adminBtn) adminBtn.style.display = isAdmin ? 'flex' : 'none';
    if (tvBtn) tvBtn.style.display = isAdmin ? 'flex' : 'none';
    if (topTvWindowBtn) topTvWindowBtn.style.display = isAdmin ? 'inline-flex' : 'none';

    // Kiosk view & ticket issuing prompt (Station 1 intake & Admin only)
    if (kioskBtn) kioskBtn.style.display = (isAdmin || isStation1) ? 'flex' : 'none';
    if (quickPromptCard) quickPromptCard.style.display = (isAdmin || isStation1) ? 'block' : 'none';

    // Android Mobile Bottom Navigation Permissions
    const mobileKioskBtn = document.querySelector('.mobile-nav-btn[data-view="kiosk"]');
    const mobileTvBtn = document.getElementById('mobile-bottom-tv-btn');
    const mobileDrawerLogoutBtn = document.getElementById('mobile-drawer-logout-btn');

    if (mobileKioskBtn) mobileKioskBtn.style.display = (isAdmin || isStation1) ? 'flex' : 'none';
    if (mobileTvBtn) mobileTvBtn.style.display = isAdmin ? 'flex' : 'none';
    if (mobileDrawerLogoutBtn) mobileDrawerLogoutBtn.style.display = user ? 'inline-flex' : 'none';

    // Sidebar station list
    const currentSelectedStation = window.consoleApp?.selectedCounterId || (user?.stationId ? Number(user.stationId) : 1);
    const stationChips = document.querySelectorAll('.counter-chip-item');
    stationChips.forEach((chip, index) => {
      const stationId = (index % 6) + 1;
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

    // Update station-specific responsive phone controls (Station 1 vs Other Stations)
    this.updateStationClasses(currentSelectedStation);
  }

  updateStationClasses(stationId) {
    const isStation1 = Number(stationId) === 1;
    document.body.classList.toggle('is-station-1', isStation1);
    document.body.classList.toggle('is-other-station', !isStation1);
    document.body.setAttribute('data-active-station', String(stationId));

    // Dynamic visibility checks for responsive phone controls
    const fabBtn = document.getElementById('mobile-android-fab');
    if (fabBtn) {
      if (!isStation1) {
        fabBtn.style.setProperty('display', 'none', 'important');
      } else {
        fabBtn.style.removeProperty('display');
      }
    }

    const quickPromptCard = document.querySelector('.quick-prompt-card');
    if (quickPromptCard) {
      if (!isStation1) {
        quickPromptCard.style.setProperty('display', 'none', 'important');
      } else {
        quickPromptCard.style.removeProperty('display');
      }
    }

    const mobileKioskBtn = document.querySelector('.mobile-nav-btn[data-view="kiosk"]');
    if (mobileKioskBtn) {
      if (!isStation1) {
        mobileKioskBtn.style.setProperty('display', 'none', 'important');
      } else {
        mobileKioskBtn.style.removeProperty('display');
      }
    }

    const mobileStationsBtn = document.getElementById('mobile-bottom-stations-btn');
    if (mobileStationsBtn) {
      if (!isStation1) {
        mobileStationsBtn.style.setProperty('display', 'none', 'important');
      } else {
        mobileStationsBtn.style.removeProperty('display');
      }
    }

    const mobileStationCarousel = document.querySelector('.mobile-station-carousel');
    if (mobileStationCarousel) {
      if (!isStation1) {
        mobileStationCarousel.style.setProperty('display', 'none', 'important');
      } else {
        mobileStationCarousel.style.removeProperty('display');
      }
    }

    const mobileDrawerStationsWrap = document.getElementById('mobile-drawer-stations-wrap');
    if (mobileDrawerStationsWrap) {
      if (!isStation1) {
        mobileDrawerStationsWrap.style.setProperty('display', 'none', 'important');
      } else {
        mobileDrawerStationsWrap.style.removeProperty('display');
      }
    }
  }

  renderHeaderUserChip(user) {
    const avatarEl = document.getElementById('header-user-avatar');
    const nameEl = document.getElementById('header-user-name');
    const roleEl = document.getElementById('header-user-role');
    const headerChip = document.getElementById('header-user-chip');

    // Mobile Drawer Profile Elements
    const mobAvatar = document.getElementById('mobile-drawer-avatar');
    const mobName = document.getElementById('mobile-drawer-officer-name');
    const mobRole = document.getElementById('mobile-drawer-officer-role');

    if (headerChip) {
      headerChip.style.pointerEvents = 'auto';
      headerChip.style.cursor = 'pointer';
      headerChip.title = user ? `Logged in as ${user.fullName} • Click to Switch Station Account` : 'Click to Sign In / Select Station';
    }

    if (!user) {
      if (avatarEl) avatarEl.textContent = 'ST';
      if (nameEl) nameEl.textContent = 'Sign In';
      if (roleEl) {
        roleEl.textContent = 'Select Station Account';
        roleEl.style.color = 'var(--color-text-muted)';
      }
      if (mobAvatar) mobAvatar.textContent = 'ST';
      if (mobName) mobName.textContent = 'No Officer Logged In';
      if (mobRole) mobRole.textContent = 'Click Switch Account to select station';
      return;
    }

    const avStr = user.avatar || (user.fullName ? user.fullName.split(' ').map(n=>n[0]).join('').slice(0, 2) : 'ST');
    const nameStr = user.fullName || 'Station Officer';
    let roleStr = user.title || 'Staff Officer';

    if (user.role === 'admin') {
      roleStr = 'Administrator • All Posts';
    } else if (user.stationId) {
      roleStr = `Station ${user.stationId} • ${user.stationKey ? user.stationKey.replace(/_/g, ' ') : 'Review'}`;
    }

    if (avatarEl) avatarEl.textContent = avStr;
    if (nameEl) nameEl.textContent = nameStr;
    if (roleEl) {
      roleEl.textContent = roleStr;
      roleEl.style.color = 'var(--colors-body, #737373)';
    }

    if (mobAvatar) mobAvatar.textContent = avStr;
    if (mobName) mobName.textContent = nameStr;
    if (mobRole) {
      mobRole.textContent = roleStr;
      mobRole.style.color = 'var(--colors-body, #737373)';
    }
  }

  renderAuthModalActiveUser(user) {
    const avatarEl = document.getElementById('auth-current-avatar');
    const nameEl = document.getElementById('auth-current-name');
    const titleEl = document.getElementById('auth-current-title');

    if (!user) {
      if (avatarEl) avatarEl.textContent = 'ST';
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

  openCharterModal() {
    const modal = document.getElementById('charter-modal');
    if (modal) {
      modal.classList.add('active');
      const searchInput = document.getElementById('charter-search-input');
      if (searchInput) searchInput.value = '';
      this.renderCharterList();
    }
  }

  closeCharterModal() {
    const modal = document.getElementById('charter-modal');
    if (modal) modal.classList.remove('active');
  }

  filterCharterList(query) {
    this.renderCharterList(query);
  }

  renderCharterList(filter = '') {
    const container = document.getElementById('charter-list-container');
    if (!container) return;

    const q = (filter || '').toLowerCase().trim();
    const filtered = SERVICES.filter(s => {
      if (!q) return true;
      const combined = `${s.name} ${s.code} ${s.description} ${s.estimation || ''} ${(s.estimationDetails || []).map(d => d.type + ' ' + d.time).join(' ')}`.toLowerCase();
      return combined.includes(q);
    });

    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 32px 16px; color: var(--colors-body, #737373);">
          <div style="font-size: 13px; font-weight: 700; margin-bottom: 4px;">No matching transactions found</div>
          <div style="font-size: 11.5px;">Try searching for another service name, turnaround duration, or keyword.</div>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(s => {
      const details = s.estimationDetails || [];
      return `
        <div style="background: var(--colors-canvas, #ffffff); border: 1px solid var(--colors-hairline, #e5e5e5); border-radius: var(--rounded-md, 8px); padding: 12px 14px; display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; flex-wrap: wrap;">
            <div>
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 2px;">
                <span class="service-code-pill" style="font-size: 10.5px; font-weight: 800; font-family: var(--font-mono, monospace); background: #000000; color: #ffffff; padding: 2px 7px; border-radius: 4px;">[${s.code}]</span>
                <span style="font-size: 13.5px; font-weight: 800; color: var(--colors-ink, #000000); text-transform: uppercase;">${s.name}</span>
              </div>
              <div style="font-size: 11.5px; color: var(--colors-body, #737373); line-height: 1.4;">${s.description}</div>
            </div>
            <button class="btn btn-primary btn-sm" style="font-size: 11px; padding: 4px 10px;" onclick="window.mainApp.closeCharterModal(); window.kioskApp.openClientModal('${s.id}')">
              Select Pass →
            </button>
          </div>

          <!-- Estimation & Turnaround Box -->
          <div style="background: var(--colors-surface-soft, #fafafa); border: 1px solid var(--colors-hairline, #e5e5e5); border-radius: 6px; padding: 8px 12px;">
            <div style="font-size: 10px; font-weight: 800; color: var(--colors-body, #737373); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px;">
              <span>Official Turnaround Standard</span>
              <span class="tv-docket-est-pill" style="font-size: 11px;">${s.estimation}</span>
            </div>
            ${details.length > 0 ? `
              <div style="display: flex; flex-direction: column; gap: 4px; font-size: 11px; font-family: var(--font-mono, monospace); color: var(--colors-ink, #000000); margin-top: 4px;">
                ${details.map(d => `
                  <div style="display: flex; justify-content: space-between; align-items: center; padding: 2px 0; border-top: 1px dashed var(--colors-hairline, #e5e5e5);">
                    <span style="color: var(--colors-body, #525252); font-weight: 600;">• ${d.type}:</span>
                    <span style="font-weight: 800; color: var(--colors-ink, #000000); text-align: right;">${d.time}</span>
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>

          <!-- Requirements Summary -->
          <div style="font-size: 10.5px; color: var(--colors-mute, #737373); line-height: 1.4;">
            <strong>Required Documents:</strong> ${(s.requirements || []).join(' • ')}
          </div>
        </div>
      `;
    }).join('');
  }

  renderAuthAccountsGrid() {
    const grid = document.getElementById('auth-accounts-grid');
    if (!grid) return;

    const users = queueState.getUsers();
    const currentUser = queueState.getCurrentUser();

    grid.innerHTML = users.map(u => {
      const isActive = currentUser && (currentUser.id === u.id || currentUser.username === u.username);
      const isStation = u.stationId !== null && u.stationId !== undefined;
      const badgeColor = '#000000';
      const badgeLabel = isStation ? `STATION ${u.stationId}` : 'ADMINISTRATOR';

      return `
        <div class="auth-account-card ${isActive ? 'active' : ''}" 
             onclick="window.mainApp.loginAsUser('${u.username}')" 
             style="background: ${isActive ? 'var(--colors-surface-soft, #fafafa)' : 'var(--color-surface)'}; border: 1.5px solid ${isActive ? '#000000' : 'var(--color-border-subtle)'}; border-radius: var(--rounded-lg, 12px); padding: 12px; cursor: pointer; transition: all 0.2s ease; display: flex; flex-direction: column; justify-content: space-between; position: relative;">
          
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
            <span style="background: #f0f0f0; color: #000000; border: 1px solid #d4d4d4; font-size: 9.5px; font-weight: 800; padding: 2px 6px; border-radius: 4px; font-family: var(--font-mono);">
              ${badgeLabel}
            </span>
            <span style="font-size: 10.5px; font-weight: 600; color: ${isActive ? '#000000' : 'var(--color-primary)'};">
              ${isActive ? 'Active Post' : 'Switch Post →'}
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
