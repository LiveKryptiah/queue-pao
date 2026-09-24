/**
 * Admin, Analytics & Configuration Controller
 * Provides real-time metrics, queue audit log, CSV report generation, and administrative tools.
 */

import { SERVICES, STAGE_DEFINITIONS, DEFAULT_USERS, queueState } from './state.js';
import { audioEngine } from './audio.js';

class AdminController {
  constructor() {
    this.searchQuery = '';
    this.statusFilter = 'all';
  }

  init() {
    this.bindEvents();
    this.render();

    queueState.subscribe(() => {
      this.render();
    });
  }

  bindEvents() {
    const searchInput = document.getElementById('admin-search-input');
    const filterSelect = document.getElementById('admin-status-filter');
    const testAudioBtn = document.getElementById('admin-test-audio-btn');
    const resetQueueBtn = document.getElementById('admin-reset-queue-btn');
    const seedDemoBtn = document.getElementById('admin-seed-demo-btn');
    const exportCsvBtn = document.getElementById('admin-export-csv-btn');

    if (searchInput) {
      searchInput.oninput = (e) => {
        this.searchQuery = (e.target.value || '').toLowerCase().trim();
        this.renderTable();
      };
    }

    if (filterSelect) {
      filterSelect.onchange = (e) => {
        this.statusFilter = e.target.value;
        this.renderTable();
      };
    }

    if (testAudioBtn) {
      testAudioBtn.onclick = () => {
        audioEngine.announceTicket(
          { ticketNumber: '1', serviceName: 'Certified True Copy & Certifications' },
          { name: 'Counter 1', label: 'All Assessment Services' }
        );
      };
    }

    if (resetQueueBtn) {
      resetQueueBtn.onclick = async () => {
        if (confirm('Are you sure you want to reset all queue numbers and clear today\'s active queue?')) {
          await queueState.resetQueue();
          this.showToast('Queue system has been reset.');
        }
      };
    }

    if (seedDemoBtn) {
      seedDemoBtn.onclick = async () => {
        await queueState.seedDemoQueue();
        this.showToast('Sample demo queues and transactions loaded.');
      };
    }

    if (exportCsvBtn) {
      exportCsvBtn.onclick = () => {
        this.exportQueueToCSV();
      };
    }
  }

  render() {
    const state = queueState.getRawState() || {};
    const tickets = state.tickets || [];
    const counters = state.counters || [];

    // Calculate metrics
    const totalIssued = tickets.length;
    const totalServed = tickets.filter(t => t.status === 'completed').length;
    const totalWaiting = tickets.filter(t => t.status === 'waiting').length;
    const totalNoShow = tickets.filter(t => t.status === 'noshow').length;

    // Average wait calculation
    const completedTickets = tickets.filter(t => t.status === 'completed' && t.calledAt);
    let totalWaitSec = 0;
    completedTickets.forEach(t => {
      totalWaitSec += Math.floor((t.calledAt - t.createdAt) / 1000);
    });
    const avgWaitSec = completedTickets.length > 0 ? Math.round(totalWaitSec / completedTickets.length) : (state.stats?.avgWaitSeconds || 0);

    const mTotalIssued = document.getElementById('metric-total-issued');
    const mTotalServed = document.getElementById('metric-total-served');
    const mTotalWaiting = document.getElementById('metric-total-waiting');
    const mAvgWait = document.getElementById('metric-avg-wait');

    if (mTotalIssued) mTotalIssued.innerText = totalIssued;
    if (mTotalServed) mTotalServed.innerText = totalServed;
    if (mTotalWaiting) mTotalWaiting.innerText = totalWaiting;
    if (mAvgWait) {
      const mins = Math.floor(avgWaitSec / 60);
      const secs = avgWaitSec % 60;
      mAvgWait.innerText = `${mins}m ${secs}s`;
    }

    // Render Staff Directory
    this.renderStaffDirectory();

    // Render Service Distribution Bars
    this.renderServiceBreakdown(tickets);

    // Render Table
    this.renderTable();
  }

  renderStaffDirectory() {
    const tbody = document.getElementById('admin-staff-directory-body');
    if (!tbody) return;

    const users = queueState.getUsers();
    const currentUser = queueState.getCurrentUser();

    tbody.innerHTML = users.map(u => {
      const isActive = currentUser && (currentUser.id === u.id || currentUser.username === u.username);
      const isStation = u.stationId !== null && u.stationId !== undefined;
      const stageDef = isStation ? STAGE_DEFINITIONS.find(s => s.id === u.stationId) : null;
      const badgeColor = '#000000';
      const postName = isStation ? `Station ${u.stationId}: ${u.stationName}` : 'All Stations (Administrator)';

      return `
        <tr style="${isActive ? 'background: var(--colors-surface-soft, #f0f0f0); font-weight: 600;' : ''}">
          <td>
            <div style="display: flex; align-items: center; gap: 8px;">
              <div class="avatar-round-sm" style="background: ${badgeColor}; color: #ffffff; width: 26px; height: 26px; font-size: 10.5px; font-weight: 700;">
                ${u.avatar || 'ST'}
              </div>
              <span style="font-weight: 700; color: var(--color-text-main); font-size: 13px;">${u.fullName}</span>
              ${isActive ? '<span class="tag-badge primary" style="font-size: 8.5px; padding: 1px 5px;">CURRENT</span>' : ''}
            </div>
          </td>
          <td>
            <code style="background: var(--color-surface-subtle); padding: 2px 6px; border-radius: 4px; font-size: 11px;">${u.username}</code>
          </td>
          <td style="font-size: 12px; color: var(--color-text-secondary);">
            ${u.title}
          </td>
          <td>
            <span style="background: ${badgeColor}15; color: ${badgeColor}; font-weight: 700; font-size: 11px; padding: 2px 8px; border-radius: 4px;">
              ${postName}
            </span>
          </td>
          <td>
            <span class="badge-status available" style="font-size: 10px; padding: 2px 8px;">Active</span>
          </td>
          <td>
            <button class="btn btn-outline btn-sm" style="font-size: 11px; padding: 3px 8px;" onclick="window.mainApp.loginAsUser('${u.username}')">
              ${isActive ? 'Active Post' : 'Switch Post →'}
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  renderServiceBreakdown(tickets) {
    const container = document.getElementById('admin-service-breakdown');
    if (!container) return;

    const total = tickets.length || 1;

    const counts = {};
    SERVICES.forEach(s => { counts[s.id] = 0; });
    tickets.forEach(t => {
      if (counts[t.serviceId] !== undefined) counts[t.serviceId]++;
    });

    container.innerHTML = SERVICES.map(s => {
      const count = counts[s.id] || 0;
      const pct = Math.round((count / total) * 100);
      return `
        <div style="margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; font-size: 12.5px; margin-bottom: 4px;">
            <span style="font-weight: 600; color: var(--colors-ink);">${s.name} (${s.code})</span>
            <span style="font-family: var(--font-mono); color: var(--colors-charcoal); font-weight: 500;">${count} (${pct}%)</span>
          </div>
          <div style="height: 6px; background-color: var(--colors-surface-soft); border-radius: 9999px; overflow: hidden; border: 1px solid var(--colors-hairline);">
            <div style="height: 100%; width: ${pct}%; background: var(--colors-ink); border-radius: 9999px;"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  renderTable() {
    const tbody = document.getElementById('admin-queue-table-body');
    if (!tbody) return;

    const state = queueState.getRawState() || {};
    let tickets = [...(state.tickets || [])].reverse();

    if (this.statusFilter !== 'all') {
      tickets = tickets.filter(t => t.status === this.statusFilter);
    }

    if (this.searchQuery) {
      tickets = tickets.filter(t => 
        String(t.ticketNumber).toLowerCase().includes(this.searchQuery) ||
        (t.serviceName || '').toLowerCase().includes(this.searchQuery) ||
        (t.priorityType || '').toLowerCase().includes(this.searchQuery) ||
        (t.notes || '').toLowerCase().includes(this.searchQuery) ||
        (t.counterName || '').toLowerCase().includes(this.searchQuery)
      );
    }

    if (tickets.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 24px; color: var(--colors-mute); font-size: 13px;">
            No transaction records match the current filter criteria.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = tickets.map(t => {
      const createdStr = new Date(t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const waitTimeMins = t.calledAt ? Math.round((t.calledAt - t.createdAt) / 60000) : Math.round((Date.now() - t.createdAt) / 60000);
      const priorityLabel = t.isPriority ? (t.priorityType || 'Priority').toUpperCase() : 'REGULAR';
      const clientName = t.clientName || 'Juan Dela Cruz';
      const stageName = t.currentStageShortName || t.currentStageName || 'Review';

      return `
        <tr>
          <td style="font-family: var(--font-mono); font-weight: 700; color: var(--colors-ink);">
            ${t.isPriority ? '<span class="tag-badge accent" style="font-size: 9px; padding: 2px 6px; margin-right: 4px;">PRI</span>' : ''}
            #${t.ticketNumber}
          </td>
          <td>
            <div style="font-weight: 700; font-size: 13px; color: var(--colors-ink);">${clientName}</div>
            <span class="tag-badge ${t.isPriority ? 'accent' : ''}" style="font-size: 10px;">${priorityLabel}</span>
          </td>
          <td>
            <span class="tag-badge primary" style="font-size: 10px; margin-right: 4px;">${t.serviceCode}</span>
            <span style="font-size: 13px; font-weight: 500; color: var(--colors-ink);">${t.serviceName}</span>
            <div style="font-size: 10.5px; color: var(--colors-body, #737373); font-weight: 600; margin-top: 2px;">Stage: ${stageName}</div>
          </td>
          <td style="font-size: 13px; font-weight: 500; color: var(--colors-charcoal);">${t.counterName ? `${t.counterName}` : '<span style="color: var(--colors-mute)">Unassigned</span>'}</td>
          <td>
            <span class="badge-status ${t.status}">${t.status.toUpperCase()}</span>
          </td>
          <td style="font-family: var(--font-mono); font-size: 12px; color: var(--colors-charcoal);">${createdStr} <span style="color: var(--colors-mute);">(${waitTimeMins}m wait)</span></td>
          <td style="font-size: 12px; color: var(--colors-body); max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${t.notes || t.staffNotes || '-'}
          </td>
        </tr>
      `;
    }).join('');
  }

  exportQueueToCSV() {
    try {
      window.location.href = '/api/export';
      this.showToast('Downloading CSV audit report...');
      return;
    } catch (e) {}

    const state = queueState.getRawState() || {};
    const tickets = state.tickets || [];

    const headers = [
      'Ticket Number',
      'Client Name',
      'Property PIN',
      'Service Code',
      'Service Name',
      'Current Stage',
      'Stage Status',
      'Priority Qualifier',
      'Station/Window',
      'Officer',
      'Status',
      'Created At',
      'Called At',
      'Completed At',
      'Staff Notes'
    ];

    const rows = tickets.map(t => [
      `"${t.ticketNumber}"`,
      `"${(t.clientName || 'Juan Dela Cruz').replace(/"/g, '""')}"`,
      `"${(t.taxDecPin || '').replace(/"/g, '""')}"`,
      `"${t.serviceCode || ''}"`,
      `"${(t.serviceName || '').replace(/"/g, '""')}"`,
      `"${(t.currentStageName || t.currentStage || 'Review').replace(/"/g, '""')}"`,
      `"${(t.stageStatus || 'pending').replace(/"/g, '""')}"`,
      `"${t.isPriority ? (t.priorityType || 'Priority') : 'Regular'}"`,
      `"${t.counterName || 'N/A'}"`,
      `"${(t.officer || '').replace(/"/g, '""')}"`,
      `"${t.status}"`,
      `"${new Date(t.createdAt).toISOString()}"`,
      `"${t.calledAt ? new Date(t.calledAt).toISOString() : 'N/A'}"`,
      `"${t.completedAt ? new Date(t.completedAt).toISOString() : 'N/A'}"`,
      `"${(t.notes || t.staffNotes || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Provincial_Assessor_Queue_Report_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    this.showToast('CSV report generated successfully.');
  }

  showToast(message) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <svg class="icon-svg icon-svg-sm" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
      <span>${message}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.2s ease';
      setTimeout(() => toast.remove(), 200);
    }, 3000);
  }
}

export const adminController = new AdminController();
