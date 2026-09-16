/**
 * Main Application Orchestrator
 * Provincial Assessor's Office Queue System (Dashboard Edition)
 */

import { queueState } from './state.js?v=2.2';
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
    const target = validViews.includes(viewName) ? viewName : 'kiosk';
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
    this.switchView('console');
    const select = document.getElementById('console-counter-select');
    if (select) {
      select.value = counterId;
      consoleController.selectedCounterId = Number(counterId);
      consoleController.render();
    }
  }

  bindNavigation() {
    document.querySelectorAll('.nav-item-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        const view = btn.dataset.view || btn.getAttribute('data-view');
        if (view) this.switchView(view);
      };
    });

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

      return `
        <div class="queue-stream-item" onclick="window.kioskApp.openMobileTrackerSimulator('${t.ticketNumber}')" title="Click to open Live Mobile Tracker for Pass #${t.ticketNumber}">
          <div class="queue-avatar-chip ${t.isPriority ? 'priority' : ''}">
            ${t.isPriority ? '★' : '#' + t.ticketNumber}
          </div>
          <div class="queue-stream-meta">
            <div style="display:flex; align-items:center; gap:5px; margin-bottom:2px;">
              <span class="queue-stream-name">Pass #${t.ticketNumber}</span>
              ${statusBadge}
            </div>
            <div class="queue-stream-sub" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:130px;" title="${t.serviceName}">
              ${t.serviceName}
            </div>
            <div style="margin-top:1px;">
              ${priorityTag}
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
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
  window.mainApp = app;
});
