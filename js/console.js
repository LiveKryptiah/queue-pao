/**
 * Staff Multi-Station Processing Console Controller
 * Gives assessor officers across all 6 specialized workflow stations full controls:
 * 1. Document Review & Receiving (Maria Santos)
 * 2. Tax Mapping & TMCR (Engr. Roberto Dela Cruz)
 * 3. Verification & Backtracking (Arch. Elena Gomez)
 * 4. Assessor Approval (Atty. Francis Bautista)
 * 5. Encoding & Assessment Roll (Carla Reyes)
 * 6. Releasing & Issuance (Mark Anthony Ramos)
 * 
 * Supports Client Name & PIN tracking, 6-Step Visual Progress Stepper, Stage Status Updates, and Station Endorsement/Forwarding.
 */

import { SERVICES, STAGE_DEFINITIONS, DEFAULT_STATIONS, queueState } from './state.js';
import { audioEngine } from './audio.js';

class ConsoleController {
  constructor() {
    this.selectedCounterId = 1;
    this.selectedTicketIdByCounter = {};
    this.timerInterval = null;
    this.activeServingStartTime = null;
    this.prevTicketId = null;
    this.lastActionType = null;
    if (typeof window !== 'undefined') {
      window.consoleApp = this;
    }
  }

  selectTicketForProcessing(ticketId) {
    if (!this.selectedTicketIdByCounter) this.selectedTicketIdByCounter = {};
    this.selectedTicketIdByCounter[this.selectedCounterId] = ticketId;
    this.render();
  }

  init() {
    if (typeof window !== 'undefined') {
      window.consoleApp = this;
    }
    this.bindEvents();
    
    // Subscribe to authenticated user changes
    queueState.subscribeAuth((user) => {
      this.onAuthChanged(user);
    });

    this.render();

    queueState.subscribe(() => {
      this.render();
    });

    // Dedicated continuous 1-second stopwatch ticker
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      this.updateLiveDurationDisplay();
    }, 1000);

    // Keyboard shortcuts for Front-Desk citizen receiving only (Station 1)
    window.addEventListener('keydown', (e) => {
      const consoleView = document.getElementById('view-console');
      if (!consoleView || !consoleView.classList.contains('active')) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (this.selectedCounterId !== 1) return; // Stations 2-6 are back workers; no citizen calling hotkeys

      if (e.code === 'Space') {
        e.preventDefault();
        this.handleCallNext();
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        this.handleStartServing();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        this.handleRecall();
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        this.handleComplete();
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        this.handleNoShow();
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        this.openTransferModal();
      }
    });
  }

  onAuthChanged(user) {
    if (!user) return;
    if (user.stationId && user.role !== 'admin') {
      this.selectedCounterId = Number(user.stationId);
    }
    this.render();
    this.updateLiveDurationDisplay();
  }

  bindEvents() {
    const counterSelect = document.getElementById('console-counter-select');
    if (counterSelect) {
      counterSelect.onchange = (e) => {
        this.selectedCounterId = Number(e.target.value);
        this.render();
        this.updateLiveDurationDisplay();
      };
    }

    const officerInput = document.getElementById('console-officer-name');
    if (officerInput) {
      officerInput.onchange = (e) => {
        queueState.setCounterStatus(this.selectedCounterId, null, e.target.value);
      };
    }
  }

  formatWaitTime(ticket) {
    if (!ticket || !ticket.createdAt) return '0s';
    let waitSecs = 0;
    if (ticket.waitSeconds && ticket.waitSeconds > 0) {
      waitSecs = Number(ticket.waitSeconds);
    } else if (ticket.calledAt) {
      waitSecs = Math.max(0, Math.floor((Number(ticket.calledAt) - Number(ticket.createdAt)) / 1000));
    } else {
      waitSecs = Math.max(0, Math.floor((Date.now() - Number(ticket.createdAt)) / 1000));
    }

    if (waitSecs < 60) {
      return `${waitSecs} sec(s)`;
    }
    const m = Math.floor(waitSecs / 60);
    const s = waitSecs % 60;
    return s > 0 ? `${m}m ${s}s` : `${m} min(s)`;
  }

  updateLiveDurationDisplay() {
    const timerElem = document.getElementById('console-live-duration');
    if (!timerElem) return;

    if (!this.activeServingStartTime || isNaN(this.activeServingStartTime)) {
      const status = timerElem.getAttribute('data-status');
      if (status === 'calling') {
        timerElem.textContent = 'Awaiting Client';
      } else if (!status || status === 'available') {
        timerElem.textContent = '--:--';
      }
      return;
    }

    const elapsedSec = Math.max(0, Math.floor((Date.now() - this.activeServingStartTime) / 1000));
    const mins = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
    const secs = String(elapsedSec % 60).padStart(2, '0');
    timerElem.textContent = `${mins}:${secs}`;
  }

  render() {
    const state = queueState.getRawState() || {};
    const counters = (state.counters && state.counters.length > 0) ? state.counters : DEFAULT_STATIONS;
    const tickets = state.tickets || [];
    const currentUser = queueState.getCurrentUser();

    // If designated staff user is logged in, lock to their assigned station
    if (currentUser && currentUser.stationId && currentUser.role !== 'admin') {
      this.selectedCounterId = Number(currentUser.stationId);
    }

    const currentCounter = counters.find(c => c.id === this.selectedCounterId) || counters[0];
    if (!currentCounter) return;
    const isFrontDesk = currentCounter.id === 1;

    // Update Counter / Station Selector & Info
    const counterSelect = document.getElementById('console-counter-select');
    const officerInput = document.getElementById('console-officer-name');
    const counterRoleBadge = document.getElementById('console-counter-role-badge');
    const counterStatusBadge = document.getElementById('console-counter-status-badge');
    const issueTicketBtn = document.getElementById('console-issue-ticket-btn');
    const queueHeading = document.getElementById('console-queue-heading');
    const shortcutsText = document.getElementById('console-shortcuts-text');
    const shortcutsBadge = document.getElementById('console-shortcuts-badge');

    if (counterSelect) {
      counterSelect.value = currentCounter.id;
      // If staff has designated station, lock select
      if (currentUser && currentUser.stationId && currentUser.role !== 'admin') {
        counterSelect.disabled = true;
        counterSelect.title = `Locked to your designated post (${currentUser.stationName})`;
      } else {
        counterSelect.disabled = false;
        counterSelect.title = 'Select workflow station to manage';
      }
    }

    const officerDisplayName = currentUser ? `${currentUser.fullName} (${currentUser.title})` : currentCounter.officer;
    if (officerInput && document.activeElement !== officerInput) {
      officerInput.value = officerDisplayName;
    }
    if (counterRoleBadge) {
      counterRoleBadge.innerText = currentCounter.name || currentCounter.label;
    }

    if (counterStatusBadge) {
      counterStatusBadge.className = `badge-status ${currentCounter.status}`;
      counterStatusBadge.innerText = currentCounter.status.toUpperCase();
    }

    // Only Front-Desk (Station 1) or Admin can issue walk-in tickets
    if (issueTicketBtn) {
      issueTicketBtn.style.display = isFrontDesk || (currentUser && currentUser.role === 'admin') ? 'inline-flex' : 'none';
    }

    // Update queue heading
    if (queueHeading) {
      queueHeading.textContent = isFrontDesk ? 'Taxpayers Waiting in Lobby at Front Desk:' : `Pending File Dockets Queued at ${currentCounter.shortName || currentCounter.name}:`;
    }

    // Update shortcuts banner
    if (shortcutsText && shortcutsBadge) {
      if (isFrontDesk) {
        shortcutsText.innerHTML = '<strong>Front-Desk Hotkeys:</strong> <kbd style="background:#e2e8f0; padding:2px 6px; border-radius:4px;">SPACE</kbd> Call Next | <kbd style="background:#e2e8f0; padding:2px 6px; border-radius:4px;">S</kbd> Start Serving | <kbd style="background:#e2e8f0; padding:2px 6px; border-radius:4px;">C</kbd> Complete | <kbd style="background:#e2e8f0; padding:2px 6px; border-radius:4px;">R</kbd> Recall';
        shortcutsBadge.textContent = 'FRONT-DESK INTAKE ACTIVE';
        shortcutsBadge.style.background = '#2563eb';
      } else {
        shortcutsText.innerHTML = '<strong>Back-Office Specialist Desk:</strong> Process docket tasks using the specialized tools above, then endorse to the next assessor station.';
        shortcutsBadge.textContent = 'BACK-OFFICE DESK ACTIVE';
        shortcutsBadge.style.background = '#000000';
      }
    }

    // Active Ticket Details:
    // Station 1 = Front desk window serving active walk-in taxpayer
    // Stations 2-6 = Back-office processing desk working on endorsed file dockets
    let activeTicket = null;
    if (isFrontDesk) {
      activeTicket = currentCounter.activeTicketId ? tickets.find(t => t.id === currentCounter.activeTicketId) : null;
    } else {
      if (this.selectedTicketIdByCounter && this.selectedTicketIdByCounter[currentCounter.id]) {
        activeTicket = tickets.find(t => t.id === this.selectedTicketIdByCounter[currentCounter.id] && (t.currentStage === currentCounter.key || t.counterId === currentCounter.id) && t.status !== 'completed' && t.status !== 'noshow');
      }
      if (!activeTicket && currentCounter.activeTicketId) {
        activeTicket = tickets.find(t => t.id === currentCounter.activeTicketId && t.status !== 'completed' && t.status !== 'noshow');
      }
      if (!activeTicket) {
        activeTicket = tickets.find(t => (t.currentStage === currentCounter.key || t.counterId === currentCounter.id) && t.status !== 'completed' && t.status !== 'noshow');
      }
    }

    this.renderActiveTicketPanel(activeTicket, currentCounter);

    // Waiting queue for this station
    this.renderWaitingQueueForCounter(tickets, currentCounter, activeTicket);
  }

  getStageStatusOptions(stageKey) {
    switch (stageKey) {
      case 'review':
        return [
          { val: 'in_review', label: 'In Review & Verification' },
          { val: 'reviewed', label: 'Requirements Complete & Validated' },
          { val: 'deficiency', label: 'Deficiency / Lacking Requirements' }
        ];
      case 'tax_mapping':
        return [
          { val: 'in_mapping', label: 'Plotting Cadastral Section Maps' },
          { val: 'lot_plotted', label: 'Lot Boundary Plotted & PIN Verified' },
          { val: 'tmcr_updated', label: 'TMCR Control Roll Updated' }
        ];
      case 'backtracking':
        return [
          { val: 'in_verification', label: 'Backtracking Historical Titles' },
          { val: 'appraisal_done', label: 'Appraisal & Valuation Verified' },
          { val: 'trace_verified', label: 'Mother Title Trace Confirmed' }
        ];
      case 'approval':
        return [
          { val: 'for_signature', label: 'Pending Provincial Assessor Sign-off' },
          { val: 'approved', label: 'Approved & Signed by Provincial Assessor' },
          { val: 'returned_revision', label: 'Returned for Technical Revision' }
        ];
      case 'recording':
        return [
          { val: 'in_encoding', label: 'Encoding to Assessment Roll' },
          { val: 'recorded', label: 'Assessment Roll Encoded' },
          { val: 'td_generated', label: 'New Tax Declaration No. Assigned' }
        ];
      case 'releasing':
        return [
          { val: 'ready_for_release', label: 'Ready for Release & Owner Duplicate Issuance' },
          { val: 'released', label: 'Owner Duplicate Tax Dec Released to Client' }
        ];
      default:
        return [
          { val: 'in_progress', label: 'In Progress' },
          { val: 'verified', label: 'Verified & Approved' },
          { val: 'completed', label: 'Completed' }
        ];
    }
  }

  renderActiveTicketPanel(ticket, counter) {
    const panelContainer = document.getElementById('console-active-panel');
    if (!panelContainer) return;

    // Preserve user notes input if currently focused/typing
    const existingNotesInput = document.getElementById('console-ticket-notes');
    const userTypedNotes = existingNotesInput ? existingNotesInput.value : null;

    // 1. IDLE / AVAILABLE STATE (No active ticket on window)
    if (!ticket) {
      this.activeServingStartTime = null;
      if (counter.id === 1) {
        panelContainer.innerHTML = `
          <div style="text-align: center; padding: 40px 20px; color: var(--colors-body, #737373);">
            <div style="width: 52px; height: 52px; border-radius: 50%; background: var(--colors-surface-soft, #fafafa); border: 1px solid var(--colors-hairline, #e5e5e5); display: inline-flex; align-items: center; justify-content: center; margin-bottom: 12px; color: var(--colors-ink, #000000);">
              <svg class="icon-svg icon-svg-lg" viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
            </div>
            <h3 style="font-size: 19px; font-weight: 700; color: var(--colors-ink, #000000); margin-bottom: 6px;">
              ${counter.name} is Ready
            </h3>
            <p style="font-size: 13px; max-width: 480px; margin: 0 auto 20px; color: var(--colors-body, #737373);">
              Click <strong>"Start Serving"</strong> to begin transaction with the next citizen, or <strong>"Call Next Pass"</strong> to summon with voice chime.
            </p>
            <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
              <button class="btn btn-primary btn-pill" onclick="window.consoleApp.handleStartServing()">
                <svg class="icon-svg icon-svg-sm" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                <span>Start Serving (S)</span>
              </button>
              <button class="btn btn-outline btn-pill" onclick="window.consoleApp.handleCallNext()">
                <svg class="icon-svg icon-svg-sm" viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
                <span>Call Next Pass (Space)</span>
              </button>
            </div>
          </div>
        `;
      } else {
        panelContainer.innerHTML = `
          <div style="text-align: center; padding: 48px 20px; color: var(--colors-body, #737373);">
            <div style="width: 56px; height: 56px; border-radius: 50%; background: var(--colors-surface-soft, #fafafa); border: 1px solid var(--colors-hairline, #e5e5e5); display: inline-flex; align-items: center; justify-content: center; margin-bottom: 14px; color: var(--colors-ink, #000000);">
              <svg class="icon-svg icon-svg-lg" viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
            </div>
            <h3 style="font-size: 19px; font-weight: 700; color: var(--colors-ink, #000000); margin-bottom: 6px;">
              ${counter.name} Desk is Ready
            </h3>
            <p style="font-size: 13.5px; max-width: 500px; margin: 0 auto 10px; color: var(--colors-body, #737373);">
              No pending file dockets currently endorsed to this station.
            </p>
            <p style="font-size: 12px; max-width: 480px; margin: 0 auto; color: var(--colors-mute, #a3a3a3);">
              When Station 1 (Intake) or preceding workflow stations endorse a docket to <strong>${counter.name}</strong>, it will automatically appear here for specialist review and processing.
            </p>
          </div>
        `;
      }
      return;
    }

    // 2. ACTIVE TICKET (CALLING OR SERVING)
    const isServing = ticket.status === 'serving';
    if (isServing) {
      this.activeServingStartTime = Number(ticket.startedAt || ticket.calledAt || ticket.createdAt || Date.now());
    } else {
      this.activeServingStartTime = null;
    }

    const ticketChanged = ticket.id !== this.prevTicketId;
    this.prevTicketId = ticket.id;

    let numTransitionClass = '';
    let cardTransitionClass = '';
    if (this.lastActionType === 'recall') {
      numTransitionClass = 'recall-transition';
      cardTransitionClass = 'recall-transition';
    } else if (this.lastActionType === 'call_next' || ticketChanged) {
      numTransitionClass = 'call-next-transition';
      cardTransitionClass = 'call-next-transition';
    }
    this.lastActionType = null;

    const formattedWait = this.formatWaitTime(ticket);
    const serviceReqs = ticket.serviceRequirements || SERVICES.find(s => s.id === ticket.serviceId)?.requirements || [];
    const ticketChecklist = ticket.checklist || {};
    
    let initialDurationStr = 'Awaiting Client';
    if (isServing && this.activeServingStartTime) {
      const elapsedSec = Math.max(0, Math.floor((Date.now() - this.activeServingStartTime) / 1000));
      const mins = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
      const secs = String(elapsedSec % 60).padStart(2, '0');
      initialDurationStr = `${mins}:${secs}`;
    }

    const preservedNotes = userTypedNotes !== null ? userTypedNotes : (ticket.notes || '');

    // Current stage calculation
    const currentStageKey = ticket.currentStage || counter.key || 'review';
    const currentStageDef = STAGE_DEFINITIONS.find(s => s.key === currentStageKey) || STAGE_DEFINITIONS[0];
    const currentStageIdx = STAGE_DEFINITIONS.findIndex(s => s.key === currentStageKey);

    // Next sequential stage
    const nextStageDef = (currentStageIdx >= 0 && currentStageIdx < STAGE_DEFINITIONS.length - 1)
      ? STAGE_DEFINITIONS[currentStageIdx + 1]
      : STAGE_DEFINITIONS[STAGE_DEFINITIONS.length - 1];

    const statusOptions = this.getStageStatusOptions(currentStageKey);
    const clientName = ticket.clientName || 'Juan Dela Cruz';
    const pinText = ticket.taxDecPin ? `PIN: ${ticket.taxDecPin}` : 'No PIN entered';

    // 6-Stage Progress Stepper Bar HTML
    const stageStepperHtml = `
      <div style="margin-bottom: 20px; padding: 14px 16px; background: var(--colors-surface-soft, #fafafa); border: 1px solid var(--colors-hairline, #e5e5e5); border-radius: var(--rounded-lg, 12px);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <span style="font-size: 11px; font-weight: 700; color: var(--colors-body, #737373); text-transform: uppercase; letter-spacing: 0.5px;">
            WORKFLOW PROGRESSION PIPELINE
          </span>
          <span style="font-size: 11px; font-weight: 700; color: #2563eb; font-family: var(--font-mono, monospace);">
            STAGE ${currentStageIdx + 1} OF 6: ${currentStageDef.shortName.toUpperCase()}
          </span>
        </div>
        <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px;">
          ${STAGE_DEFINITIONS.map((st, idx) => {
            const isCompleted = idx < currentStageIdx || (idx === currentStageIdx && (ticket.stageStatus === 'completed' || ticket.stageStatus === 'released'));
            const isCurrent = idx === currentStageIdx && ticket.stageStatus !== 'released';
            let bg = 'background: var(--colors-canvas, #ffffff); border: 1px solid var(--colors-hairline, #e5e5e5); color: var(--colors-mute, #a3a3a3);';
            let icon = `${idx + 1}`;
            if (isCompleted) {
              bg = 'background: #10b981; border: 1px solid #059669; color: #ffffff; font-weight: 700;';
              icon = '✓';
            } else if (isCurrent) {
              bg = 'background: #000000; border: 1px solid #000000; color: #ffffff; font-weight: 700; box-shadow: 0 0 0 2px rgba(37,99,235,0.3);';
            }
            return `
              <div style="text-align: center; padding: 6px 4px; border-radius: 8px; ${bg}">
                <div style="font-size: 11px; font-family: var(--font-mono, monospace); line-height: 1;">${icon}</div>
                <div style="font-size: 9.5px; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${st.name}">${st.shortName}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    panelContainer.innerHTML = `
      <!-- Top Meta: Ticket & Client Heading -->
      <div class="station-top-meta ${cardTransitionClass}" style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; padding-bottom: 14px; border-bottom: 1px solid var(--colors-hairline, #e5e5e5);">
        <div>
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px; flex-wrap: wrap;">
            <span class="tag-badge primary" style="font-weight: 700;">#${ticket.ticketNumber}</span>
            <span class="tag-badge" style="background: #000000; color: #ffffff; font-weight: 700;">${ticket.serviceCode || 'SVC'}</span>
            ${ticket.isPriority ? '<span class="tag-badge accent" style="font-weight: 700; background: #d97706; color: #fff;">★ PRIORITY PASS</span>' : ''}
            <span class="badge-status ${ticket.status}">${ticket.status.toUpperCase()}</span>
            <span class="tag-badge" style="background: #2563eb; color: #ffffff; font-weight: 700; font-size: 10px;">STAGE: ${currentStageDef.shortName}</span>
          </div>
          
          <div style="font-size: 26px; font-weight: 800; color: var(--colors-ink, #000000); margin: 2px 0; text-transform: uppercase;">
            ${clientName}
          </div>
          <div style="font-size: 12px; color: var(--colors-body, #737373); font-family: var(--font-mono, monospace);">
            ${pinText} • ${ticket.serviceName}
          </div>
        </div>

        <div style="text-align: right;">
          <div class="meta-field-label" style="font-size: 11px; color: var(--colors-body, #737373); text-transform: uppercase; font-weight: 600;">Service Duration</div>
          <div id="console-live-duration" data-status="${ticket.status}" style="font-family: var(--font-mono, monospace); font-size: 28px; font-weight: 800; color: var(--colors-ink, #000000);">
            ${initialDurationStr}
          </div>
        </div>
      </div>

      <!-- 6-Stage Visual Stepper -->
      ${stageStepperHtml}

      <!-- Client & Property Details Grid -->
      <div class="client-meta-box" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; padding: 12px 16px; background: var(--colors-surface-soft, #fafafa); border: 1px solid var(--colors-hairline, #e5e5e5); border-radius: var(--rounded-lg, 12px);">
        <div>
          <div class="meta-field-label" style="font-size: 10.5px; color: var(--colors-body, #737373); text-transform: uppercase; font-weight: 600;">Client / Taxpayer</div>
          <div class="meta-field-val" style="font-size: 13px; font-weight: 700; color: var(--colors-ink, #000000);">${clientName}</div>
        </div>
        <div>
          <div class="meta-field-label" style="font-size: 10.5px; color: var(--colors-body, #737373); text-transform: uppercase; font-weight: 600;">Current Station</div>
          <div class="meta-field-val" style="font-size: 13px; font-weight: 600; color: var(--colors-ink, #000000);">${counter.name}</div>
        </div>
        <div>
          <div class="meta-field-label" style="font-size: 10.5px; color: var(--colors-body, #737373); text-transform: uppercase; font-weight: 600;">Stage Status</div>
          <div class="meta-field-val" style="font-size: 13px; font-weight: 700; color: #2563eb;">${(ticket.stageStatus || 'Pending').replace(/_/g, ' ').toUpperCase()}</div>
        </div>
        <div>
          <div class="meta-field-label" style="font-size: 10.5px; color: var(--colors-body, #737373); text-transform: uppercase; font-weight: 600;">Wait Time</div>
          <div class="meta-field-val" style="font-size: 13px; font-weight: 600; color: var(--colors-ink, #000000);">${formattedWait}</div>
        </div>
      </div>

      <!-- Station Workflow Actions: 1. Update Status & 2. Forward to Next Station -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 16px;">
        
        <!-- Box 1: Update Stage Status -->
        <div style="background: var(--colors-surface-soft, #fafafa); border: 1px solid var(--colors-hairline, #e5e5e5); border-radius: var(--rounded-lg, 12px); padding: 14px 16px;">
          <div style="font-size: 11.5px; font-weight: 700; color: var(--colors-ink, #000000); text-transform: uppercase; margin-bottom: 8px;">
            1. Update Station Processing Status
          </div>
          <div style="display: flex; gap: 8px; margin-bottom: 8px;">
            <select id="console-stage-status-select" class="form-select" style="flex: 1; font-size: 12.5px; font-weight: 600;">
              ${statusOptions.map(opt => `
                <option value="${opt.val}" ${ticket.stageStatus === opt.val ? 'selected' : ''}>${opt.label}</option>
              `).join('')}
            </select>
            <button class="btn btn-primary btn-sm" onclick="window.consoleApp.handleUpdateStageStatus('${ticket.id}')">
              Save Status
            </button>
          </div>
          <div style="font-size: 11px; color: var(--colors-body, #737373);">
            Updates live status displayed on Lobby Monitor & Citizen Tracker.
          </div>
        </div>

        <!-- Box 2: Forward to Another Station -->
        <div style="background: var(--colors-surface-soft, #fafafa); border: 1px solid var(--colors-hairline, #e5e5e5); border-radius: var(--rounded-lg, 12px); padding: 14px 16px;">
          <div style="font-size: 11.5px; font-weight: 700; color: var(--colors-ink, #000000); text-transform: uppercase; margin-bottom: 8px;">
            2. Endorse / Forward to Next Station
          </div>
          <div style="display: flex; gap: 8px; margin-bottom: 8px;">
            <select id="console-forward-stage-select" class="form-select" style="flex: 1; font-size: 12.5px; font-weight: 600;">
              ${STAGE_DEFINITIONS.map(st => `
                <option value="${st.key}" ${st.key === nextStageDef.key ? 'selected' : ''}>→ ${st.name}</option>
              `).join('')}
            </select>
            <button class="btn btn-outline btn-sm" style="font-weight: 700;" onclick="window.consoleApp.handleForwardStage('${ticket.id}')">
              Endorse →
            </button>
          </div>
          <div style="font-size: 11px; color: var(--colors-body, #737373);">
            Hands over transaction to the next assessor desk with timestamped audit log.
          </div>
        </div>

      </div>

      <!-- Station Specialist Operating Toolbox -->
      ${this.renderStationSpecificToolbox(currentStageKey, counter, ticket)}

      <!-- Live Requirements Checklist with Immediate Autosave -->
      <div style="margin-bottom: 16px;">
        <div style="font-size: 11px; font-weight: 700; color: var(--colors-mute, #737373); text-transform: uppercase; margin-bottom: 8px;">
          DOCUMENT REQUIREMENTS CHECKLIST (${serviceReqs.length} Mandatory)
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          ${serviceReqs.map((req) => {
            const isChecked = ticketChecklist[req] === true;
            return `
              <label style="display: flex; align-items: center; gap: 8px; font-size: 12.5px; background: var(--colors-surface-soft, #fafafa); border: 1px solid var(--colors-hairline, #e5e5e5); padding: 8px 12px; border-radius: var(--rounded-md, 8px); cursor: pointer; user-select: none;">
                <input type="checkbox" class="req-checkbox" data-ticket-id="${ticket.id}" data-req-name="${req}" ${isChecked ? 'checked' : ''} onchange="window.consoleApp.handleChecklistChange('${ticket.id}', '${req}', this.checked)" style="width: 16px; height: 16px; accent-color: var(--colors-ink, #000000); cursor: pointer;">
                <span style="font-weight: ${isChecked ? '600' : '400'}; color: ${isChecked ? 'var(--colors-ink, #000000)' : 'var(--colors-body, #737373)'};">${req}</span>
              </label>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Notes Field with Autosave -->
      <div style="margin-bottom: 16px;">
        <label class="meta-field-label" style="display: block; font-size: 11px; color: var(--colors-body, #737373); text-transform: uppercase; font-weight: 600; margin-bottom: 4px;">Assessor Officer Remarks / Transaction Notes</label>
        <textarea id="console-ticket-notes" class="form-input" rows="2" style="width: 100%; resize: vertical;" placeholder="Add remarks, assessment notes, or deficiency details..." oninput="window.consoleApp.handleNotesChange('${ticket.id}', this.value)">${preservedNotes}</textarea>
      </div>

      <!-- Primary Action Controls: Front Desk (Station 1) vs Back-Office Specialist (Stations 2-6) -->
      ${counter.id === 1 ? `
        <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px;">
          ${!isServing ? `
            <button class="btn btn-primary" onclick="window.consoleApp.handleStartServing(this)">
              <svg class="icon-svg icon-svg-sm" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
              <span>Start Serving</span>
            </button>
            <button class="btn btn-outline btn-pill" onclick="window.consoleApp.handleRecall(this)">
              <svg class="icon-svg icon-svg-sm" viewBox="0 0 24 24"><path d="M1 4v6h6"></path><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
              <span>Re-call (R)</span>
            </button>
          ` : `
            <button class="btn btn-primary" onclick="window.consoleApp.handleComplete(this)">
              <svg class="icon-svg icon-svg-sm" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>
              <span>Complete & Release</span>
            </button>
            <button class="btn btn-outline" onclick="window.consoleApp.handleRecall(this)">
              <svg class="icon-svg icon-svg-sm" viewBox="0 0 24 24"><path d="M1 4v6h6"></path><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
              <span>Re-call</span>
            </button>
          `}
          <button class="btn btn-outline" onclick="window.consoleApp.openTransferModal()">
            <svg class="icon-svg icon-svg-sm" viewBox="0 0 24 24"><polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line><line x1="4" y1="4" x2="9" y2="9"></line></svg>
            <span>Transfer Service</span>
          </button>
          <button class="btn btn-outline" style="color: var(--color-danger);" onclick="window.consoleApp.handleNoShow(this)">
            <svg class="icon-svg icon-svg-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
            <span>Mark No-Show</span>
          </button>
        </div>
      ` : `
        <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; align-items: center; justify-content: space-between; background: var(--colors-surface-soft, #fafafa); border: 1px solid var(--colors-hairline, #e5e5e5); padding: 12px 16px; border-radius: var(--rounded-lg, 12px);">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="tag-badge" style="background: #000000; color: #ffffff; font-weight: 700; font-size: 11px;">BACK-OFFICE SPECIALIST DESK</span>
            <span style="font-size: 12.5px; color: var(--colors-body, #737373);">
              Processing file docket for <strong style="color: var(--colors-ink, #000000);">${clientName}</strong> (#${ticket.ticketNumber})
            </span>
          </div>
          <div style="display: flex; gap: 8px; align-items: center;">
            ${counter.id < 6 ? `
              <button class="btn btn-primary btn-sm" onclick="window.consoleApp.handleEndorseNext('${ticket.id}', '${nextStageDef.key}')" style="font-weight: 700; font-size: 12px; padding: 7px 14px;">
                <span>Endorse to ${nextStageDef.name} →</span>
              </button>
            ` : `
              <button class="btn btn-primary btn-sm" onclick="window.consoleApp.handleConfirmRelease('${ticket.id}')" style="background: #16a34a; border-color: #15803d; font-weight: 800; font-size: 12px; padding: 7px 16px;">
                <svg class="icon-svg icon-svg-sm" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>
                <span>Confirm Release & Complete</span>
              </button>
            `}
          </div>
        </div>
      `}

      <!-- Stage History Activity Trail -->
      ${ticket.stageHistory && ticket.stageHistory.length > 0 ? `
        <div style="border-top: 1px solid var(--colors-hairline, #e5e5e5); padding-top: 12px; margin-top: 12px;">
          <div style="font-size: 11px; font-weight: 700; color: var(--colors-body, #737373); text-transform: uppercase; margin-bottom: 8px;">
            Stage History & Endorsement Trail
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            ${ticket.stageHistory.slice().reverse().map(h => {
              const timeStr = h.timestamp ? new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
              return `
                <div style="font-size: 11.5px; background: var(--colors-surface-soft, #fafafa); padding: 6px 10px; border-radius: 6px; border: 1px solid var(--colors-hairline, #e5e5e5); display: flex; justify-content: space-between; align-items: center;">
                  <div>
                    <strong style="color: var(--colors-ink, #000);">${h.stageName || h.stage}:</strong>
                    <span style="color: var(--colors-body, #737373);">${h.remarks || h.status}</span>
                    <span style="color: var(--colors-mute, #a3a3a3); font-size: 10.5px;">(${h.officer || 'Officer'})</span>
                  </div>
                  <span style="font-family: var(--font-mono, monospace); font-size: 10px; color: var(--colors-body, #737373);">${timeStr}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}
    `;

    this.updateLiveDurationDisplay();
  }

  renderStationSpecificToolbox(stageKey, counter, ticket) {
    const sId = counter.id || 1;
    const reqs = ticket.serviceRequirements || SERVICES.find(s => s.id === ticket.serviceId)?.requirements || [];
    const checklist = ticket.checklist || {};
    const checkedCount = reqs.filter(r => checklist[r] === true).length;
    const isAllChecked = reqs.length > 0 && checkedCount === reqs.length;

    // Station 1: Document Review & Receiving (Maria Santos)
    if (sId === 1 || stageKey === 'review') {
      return `
        <div class="station-toolbox-card station-1">
          <div class="station-toolbox-header">
            <div class="station-toolbox-title">
              <svg class="icon-svg icon-svg-sm" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
              <span>Station 1 Desk: Document Intake & Verification</span>
            </div>
            <span class="tag-badge" style="background: ${isAllChecked ? '#10b981' : '#f59e0b'}; color: #fff; font-weight: 700; font-size: 10px;">
              ${checkedCount} of ${reqs.length} Documents Verified
            </span>
          </div>

          <div style="font-size: 12px; color: var(--colors-body, #737373); margin-bottom: 10px;">
            Verify mandatory citizen submissions in the checklist below. If any documents are lacking, generate a Deficiency Notice before endorsing.
          </div>

          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button class="btn btn-outline btn-sm" onclick="window.consoleApp.handleValidateAllChecklist('${ticket.id}')" style="font-weight: 600;">
              ✓ Mark All Verified
            </button>
            <button class="btn btn-outline btn-sm" style="color: #ef4444; border-color: #ef4444;" onclick="window.consoleApp.handleIssueDeficiency('${ticket.id}')">
              ⚠ Issue Notice of Deficiency
            </button>
            <button class="btn btn-primary btn-sm" onclick="window.consoleApp.handleEndorseNext('${ticket.id}', 'tax_mapping')" style="font-weight: 700;">
              Endorse to Station 2 (Tax Mapping) →
            </button>
          </div>
        </div>
      `;
    }

    // Station 2: Tax Mapping & TMCR (Engr. Roberto Dela Cruz)
    if (sId === 2 || stageKey === 'tax_mapping') {
      const currentPin = ticket.taxDecPin || '024-05-0012-003-45';
      return `
        <div class="station-toolbox-card station-2">
          <div class="station-toolbox-header">
            <div class="station-toolbox-title">
              <svg class="icon-svg icon-svg-sm" viewBox="0 0 24 24"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon><line x1="8" y1="2" x2="8" y2="18"></line><line x1="16" y1="6" x2="16" y2="22"></line></svg>
              <span>Station 2 Desk: Cadastral Plotting & TMCR Indexer</span>
            </div>
            <span class="tag-badge" style="background: #7c3aed; color: #fff; font-weight: 700; font-size: 10px;">
              GIS & PARCEL MAPPING
            </span>
          </div>

          <div class="station-tool-grid">
            <div class="station-field-group">
              <label class="station-field-label">Cadastral Section Map (Cad 342-D):</label>
              <select id="station2-sheet-select" class="form-select" style="font-size: 12px; font-weight: 600;">
                <option value="Sheet 01 - Poblacion North">Sheet 01 - Poblacion North (Sec 001)</option>
                <option value="Sheet 02 - Poblacion South" selected>Sheet 02 - Poblacion South (Sec 003)</option>
                <option value="Sheet 03 - Commercial Central">Sheet 03 - Commercial Central (Sec 005)</option>
                <option value="Sheet 04 - Industrial Sub-Zone">Sheet 04 - Industrial Sub-Zone (Sec 008)</option>
                <option value="Sheet 05 - Riverside Sector">Sheet 05 - Riverside Sector (Sec 012)</option>
                <option value="Sheet 06 - Uplands Agro-Forestry">Sheet 06 - Uplands Agro-Forestry (Sec 015)</option>
              </select>
            </div>

            <div class="station-field-group">
              <label class="station-field-label">Cadastral Survey Lot / Plan No.:</label>
              <input type="text" id="station2-lot-input" class="form-input" style="font-size: 12px; font-weight: 600;" value="Lot 104-B-2, Psd-04-019284" placeholder="e.g. Lot 104-B-2, Psd-04-019284">
            </div>

            <div class="station-field-group">
              <label class="station-field-label">Property Index Number (PIN):</label>
              <input type="text" id="station2-pin-input" class="form-input" style="font-size: 12px; font-family: var(--font-mono); font-weight: 700; color: #2563eb;" value="${currentPin}" placeholder="024-05-0012-003-45">
            </div>
          </div>

          <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center; justify-content: space-between;">
            <div style="display: flex; gap: 8px;">
              <button class="btn btn-outline btn-sm" onclick="window.consoleApp.handleSaveTaxMapping('${ticket.id}')" style="font-weight: 700;">
                <svg class="icon-svg icon-svg-sm" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                <span>Plot & Verify PIN</span>
              </button>
              <button class="btn btn-outline btn-sm" onclick="window.consoleApp.handleUpdateTMCR('${ticket.id}')">
                <span>Update TMCR Roll</span>
              </button>
            </div>
            <button class="btn btn-primary btn-sm" onclick="window.consoleApp.handleEndorseNext('${ticket.id}', 'backtracking')" style="font-weight: 700;">
              Endorse to Station 3 (Backtracking) →
            </button>
          </div>
        </div>
      `;
    }

    // Station 3: Verification & Backtracking (Arch. Elena Gomez)
    if (sId === 3 || stageKey === 'backtracking') {
      return `
        <div class="station-toolbox-card station-3">
          <div class="station-toolbox-header">
            <div class="station-toolbox-title">
              <svg class="icon-svg icon-svg-sm" viewBox="0 0 24 24"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
              <span>Station 3 Desk: Mother Title Trace & Appraisal Calculator</span>
            </div>
            <span class="tag-badge" style="background: #0891b2; color: #fff; font-weight: 700; font-size: 10px;">
              VALUATION & APPRAISAL
            </span>
          </div>

          <div class="station-tool-grid">
            <div class="station-field-group">
              <label class="station-field-label">Mother Title / OCT / TCT Reference:</label>
              <input type="text" id="station3-title-input" class="form-input" style="font-size: 12px; font-weight: 600;" value="TCT No. T-491028 (from OCT No. O-1142)" placeholder="e.g. TCT No. T-491028">
            </div>

            <div class="station-field-group">
              <label class="station-field-label">Prior Tax Declaration No. & Owner:</label>
              <input type="text" id="station3-priortd-input" class="form-input" style="font-size: 12px; font-weight: 600;" value="TD No. 2018-05-0012-00912 (Remedios Santos-Cruz)" placeholder="Prior TD / Owner">
            </div>
          </div>

          <!-- Improvement Valuation Calculator -->
          <div style="background: var(--colors-canvas, #ffffff); border: 1px solid var(--colors-hairline, #e5e5e5); border-radius: var(--rounded-md, 8px); padding: 10px 14px; margin-bottom: 12px;">
            <div style="font-size: 11px; font-weight: 700; color: var(--colors-body, #737373); text-transform: uppercase; margin-bottom: 8px;">
              Building & Improvement Depreciation Appraisal
            </div>
            <div style="display: grid; grid-template-columns: 1.4fr 1fr 1fr 1.2fr; gap: 10px; align-items: flex-end;">
              <div class="station-field-group">
                <label class="station-field-label">Structure Classification:</label>
                <select id="station3-calc-class" class="form-select" style="font-size: 11.5px; font-weight: 600;" onchange="window.consoleApp.calculateDepreciation()">
                  <option value="1.5">Class A: Concrete / Steel (1.5%/yr)</option>
                  <option value="2.0">Class B: Semi-Concrete (2.0%/yr)</option>
                  <option value="3.5">Class C: Timber / Light (3.5%/yr)</option>
                </select>
              </div>

              <div class="station-field-group">
                <label class="station-field-label">Base Value (PHP):</label>
                <input type="number" id="station3-calc-base" class="form-input" style="font-size: 12px; font-weight: 600;" value="2500000" oninput="window.consoleApp.calculateDepreciation()">
              </div>

              <div class="station-field-group">
                <label class="station-field-label">Age (Years):</label>
                <input type="number" id="station3-calc-age" class="form-input" style="font-size: 12px; font-weight: 600;" value="8" oninput="window.consoleApp.calculateDepreciation()">
              </div>

              <div class="station-field-group">
                <label class="station-field-label">Depreciated TMV:</label>
                <div id="station3-calc-result" class="station-calc-display" style="font-size: 12.5px; color: #059669;">
                  ₱ 2,200,000
                </div>
              </div>
            </div>
          </div>

          <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center; justify-content: space-between;">
            <button class="btn btn-outline btn-sm" onclick="window.consoleApp.handleSaveAppraisal('${ticket.id}')" style="font-weight: 700;">
              <span>Save Appraisal & Title Trace</span>
            </button>
            <button class="btn btn-primary btn-sm" onclick="window.consoleApp.handleEndorseNext('${ticket.id}', 'approval')" style="font-weight: 700;">
              Endorse to Station 4 (Assessor Approval) →
            </button>
          </div>
        </div>
      `;
    }

    // Station 4: Assessor Approval (Atty. Francis Bautista)
    if (sId === 4 || stageKey === 'approval') {
      return `
        <div class="station-toolbox-card station-4">
          <div class="station-toolbox-header">
            <div class="station-toolbox-title">
              <svg class="icon-svg icon-svg-sm" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
              <span>Station 4 Desk: Executive Assessor Review & Sign-Off</span>
            </div>
            <span class="tag-badge" style="background: #d97706; color: #fff; font-weight: 700; font-size: 10px;">
              PROVINCIAL EXECUTIVE SEAL
            </span>
          </div>

          <div class="station-approval-seal" style="margin-bottom: 12px;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 44px; height: 44px; border-radius: 50%; background: #d97706; color: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 800; border: 2px solid #b45309; flex-shrink: 0;">
                ★
              </div>
              <div>
                <div style="font-size: 13px; font-weight: 800; color: #92400e; line-height: 1.2;">
                  OFFICIAL PROVINCIAL ASSESSOR APPROVAL AUTHORITY
                </div>
                <div style="font-size: 11px; color: #b45309; margin-top: 2px;">
                  Atty. Francis Bautista • Provincial Assessor Sign-Off & Assessment Level Verification
                </div>
              </div>
            </div>
            <div style="text-align: right;">
              <span class="tag-badge" style="background: #92400e; color: #fff; font-size: 10px; font-weight: 700;">
                R.A. 7160 SEC. 219
              </span>
            </div>
          </div>

          <div class="station-tool-grid">
            <div class="station-field-group">
              <label class="station-field-label">Classification & Assessment Level:</label>
              <select id="station4-assessment-level" class="form-select" style="font-size: 12px; font-weight: 600;" onchange="window.consoleApp.calculateAssessedValue()">
                <option value="0.20" selected>Residential Land/Improvement (20% Assessment Level)</option>
                <option value="0.40">Agricultural Land (40% Assessment Level)</option>
                <option value="0.50">Commercial Building/Land (50% Assessment Level)</option>
                <option value="0.50">Industrial Structure (50% Assessment Level)</option>
                <option value="0.10">Special / Government / Cultural (10% Assessment Level)</option>
              </select>
            </div>

            <div class="station-field-group">
              <label class="station-field-label">True Market Value (TMV):</label>
              <input type="number" id="station4-tmv-input" class="form-input" style="font-size: 12px; font-weight: 600;" value="2200000" oninput="window.consoleApp.calculateAssessedValue()">
            </div>

            <div class="station-field-group">
              <label class="station-field-label">Assessed Value (AV):</label>
              <div id="station4-av-result" class="station-calc-display" style="color: #2563eb;">
                ₱ 440,000 (Tax Base)
              </div>
            </div>
          </div>

          <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center; justify-content: space-between;">
            <div style="display: flex; gap: 8px;">
              <button class="btn btn-primary btn-sm" onclick="window.consoleApp.handleAssessorSignOff('${ticket.id}')" style="background: #d97706; border-color: #b45309; font-weight: 700;">
                <span>★ Affix Assessor Seal & Approve</span>
              </button>
              <button class="btn btn-outline btn-sm" style="color: #ef4444; border-color: #ef4444;" onclick="window.consoleApp.handleAssessorReturn('${ticket.id}')">
                <span>Return for Revision</span>
              </button>
            </div>
            <button class="btn btn-primary btn-sm" onclick="window.consoleApp.handleEndorseNext('${ticket.id}', 'recording')" style="font-weight: 700;">
              Endorse to Station 5 (Encoding & Roll) →
            </button>
          </div>
        </div>
      `;
    }

    // Station 5: Encoding & Assessment Roll (Carla Reyes)
    if (sId === 5 || stageKey === 'recording') {
      const suggestedTD = `TD-2026-PAO-${String(Math.floor(10000 + Math.random() * 90000))}`;
      return `
        <div class="station-toolbox-card station-5">
          <div class="station-toolbox-header">
            <div class="station-toolbox-title">
              <svg class="icon-svg icon-svg-sm" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
              <span>Station 5 Desk: Assessment Roll Ledger & TD Generator</span>
            </div>
            <span class="tag-badge" style="background: #059669; color: #fff; font-weight: 700; font-size: 10px;">
              RECORDS & TAX DECLARATION
            </span>
          </div>

          <div class="station-tool-grid">
            <div class="station-field-group">
              <label class="station-field-label">Official Tax Declaration Number:</label>
              <div style="display: flex; gap: 6px;">
                <input type="text" id="station5-td-input" class="form-input" style="font-size: 12px; font-family: var(--font-mono); font-weight: 800; color: #059669;" value="${suggestedTD}">
                <button class="btn btn-outline btn-sm" style="padding: 4px 8px; font-size: 11px;" onclick="window.consoleApp.generateNewTDNumber()">
                  New #
                </button>
              </div>
            </div>

            <div class="station-field-group">
              <label class="station-field-label">Assessment Roll Volume & Page:</label>
              <input type="text" id="station5-roll-input" class="form-input" style="font-size: 12px; font-weight: 600;" value="Volume 2026-B, Page 148, Line 22">
            </div>

            <div class="station-field-group">
              <label class="station-field-label">ARP Record Identifier:</label>
              <input type="text" id="station5-arp-input" class="form-input" style="font-size: 12px; font-family: var(--font-mono); font-weight: 600;" value="ARP-024-0012-0045">
            </div>
          </div>

          <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center; justify-content: space-between;">
            <button class="btn btn-outline btn-sm" onclick="window.consoleApp.handleSaveAssessmentRoll('${ticket.id}')" style="font-weight: 700;">
              <span>Commit to Assessment Roll</span>
            </button>
            <button class="btn btn-primary btn-sm" onclick="window.consoleApp.handleEndorseNext('${ticket.id}', 'releasing')" style="font-weight: 700;">
              Endorse to Station 6 (Releasing & Issuance) →
            </button>
          </div>
        </div>
      `;
    }

    // Station 6: Releasing & Issuance (Mark Anthony Ramos)
    if (sId === 6 || stageKey === 'releasing') {
      return `
        <div class="station-toolbox-card station-6">
          <div class="station-toolbox-header">
            <div class="station-toolbox-title">
              <svg class="icon-svg icon-svg-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>
              <span>Station 6 Desk: Taxpayer Claim Verification & Issuance</span>
            </div>
            <span class="tag-badge" style="background: #16a34a; color: #fff; font-weight: 700; font-size: 10px;">
              FINAL OWNER DUPLICATE RELEASE
            </span>
          </div>

          <div style="background: var(--colors-canvas, #ffffff); border: 1px solid var(--colors-hairline, #e5e5e5); border-radius: var(--rounded-md, 8px); padding: 12px; margin-bottom: 12px;">
            <div style="font-size: 11px; font-weight: 700; color: var(--colors-body, #737373); text-transform: uppercase; margin-bottom: 8px;">
              Claimant Release Verification Checklist
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px;">
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="checkbox" id="station6-chk-id" checked style="width: 15px; height: 15px; accent-color: #16a34a;">
                <span>Taxpayer Valid Government ID Verified</span>
              </label>
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="checkbox" id="station6-chk-spa" checked style="width: 15px; height: 15px; accent-color: #16a34a;">
                <span>Special Power of Attorney (if Representative)</span>
              </label>
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="checkbox" id="station6-chk-or" checked style="width: 15px; height: 15px; accent-color: #16a34a;">
                <span>Official Receipt (OR) for Fees Checked</span>
              </label>
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="checkbox" id="station6-chk-stamp" checked style="width: 15px; height: 15px; accent-color: #16a34a;">
                <span>Owner's Duplicate Stamped & Sealed</span>
              </label>
            </div>
          </div>

          <div class="station-tool-grid">
            <div class="station-field-group">
              <label class="station-field-label">Official Receipt (OR) Number:</label>
              <input type="text" id="station6-or-input" class="form-input" style="font-size: 12px; font-family: var(--font-mono); font-weight: 600;" value="OR #9481029" placeholder="e.g. OR #9481029">
            </div>
            <div class="station-field-group">
              <label class="station-field-label">Claimant / Receiving Person:</label>
              <input type="text" id="station6-recipient-input" class="form-input" style="font-size: 12px; font-weight: 600;" value="${ticket.clientName || 'Juan Dela Cruz'}" placeholder="Name of claimant">
            </div>
          </div>

          <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center; justify-content: flex-end;">
            <button class="btn btn-primary btn-sm" onclick="window.consoleApp.handleConfirmRelease('${ticket.id}')" style="background: #16a34a; border-color: #15803d; font-weight: 800; padding: 8px 18px;">
              <svg class="icon-svg icon-svg-sm" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>
              <span>Confirm Release & Complete Transaction</span>
            </button>
          </div>
        </div>
      `;
    }

    return '';
  }

  renderWaitingQueueForCounter(tickets, counter, activeTicket) {
    const queueContainer = document.getElementById('console-counter-queue');
    if (!queueContainer) return;

    const isFrontDesk = counter.id === 1;
    let waitingTickets = [];
    if (isFrontDesk) {
      waitingTickets = tickets.filter(t => t.status === 'waiting' && t.status !== 'completed' && t.status !== 'noshow');
    } else {
      waitingTickets = tickets.filter(t => (t.currentStage === counter.key || t.counterId === counter.id) && t.status !== 'completed' && t.status !== 'noshow');
    }

    if (waitingTickets.length === 0) {
      queueContainer.innerHTML = `
        <div style="padding: 10px 4px; font-size: 12px; color: var(--colors-body, #737373); font-family: var(--font-mono, monospace);">
          ${isFrontDesk ? 'No taxpayers currently waiting in lobby queue.' : `No pending file dockets queued at ${counter.name}.`}
        </div>
      `;
      return;
    }

    queueContainer.innerHTML = waitingTickets.map(t => {
      const waitTimeStr = this.formatWaitTime(t);
      const cName = t.clientName || 'Juan Dela Cruz';
      const isActive = activeTicket && t.id === activeTicket.id;

      const cardStyle = isActive
        ? 'background: #eff6ff; border: 2px solid #2563eb; box-shadow: 0 2px 6px rgba(37,99,235,0.15);'
        : 'background: var(--colors-canvas, #ffffff); border: 1px solid var(--colors-hairline, #e5e5e5);';

      const cursorStyle = !isFrontDesk ? 'cursor: pointer;' : '';
      const clickHandler = !isFrontDesk ? `onclick="window.consoleApp.selectTicketForProcessing('${t.id}')"` : '';

      return `
        <div ${clickHandler} style="${cardStyle} ${cursorStyle} border-radius: var(--rounded-md, 8px); padding: 8px 12px; min-width: 175px; flex-shrink: 0; display: flex; justify-content: space-between; align-items: center; transition: all 0.15s ease;">
          <div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-family: var(--font-mono, monospace); font-weight: 800; font-size: 14px; color: var(--colors-ink, #000000);">
                #${t.ticketNumber}
              </span>
              <span style="font-weight: 700; font-size: 12px; color: #000000; max-width: 90px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${cName}
              </span>
            </div>
            <div style="font-size: 10px; color: var(--colors-body, #737373); max-width: 130px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${t.serviceName}">
              ${t.serviceName}
            </div>
            <div style="display: flex; align-items: center; gap: 4px; margin-top: 2px;">
              <span style="font-size: 9.5px; color: #2563eb; font-weight: 700;">
                ${t.currentStageShortName || 'Review'}
              </span>
              ${isActive ? '<span class="tag-badge" style="background:#2563eb; color:#fff; font-size:8px; padding:1px 4px; font-weight:700;">ON DESK</span>' : ''}
            </div>
          </div>
          <div style="text-align: right;">
            ${t.isPriority ? '<span class="tag-badge accent" style="font-size:8px; padding:1px 4px; font-weight:700;">PRI</span>' : ''}
            <div style="font-family: var(--font-mono, monospace); font-size: 9.5px; color: var(--colors-body, #737373); margin-top: 4px;">
              ${waitTimeStr}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  async handleUpdateStageStatus(ticketId) {
    const selectEl = document.getElementById('console-stage-status-select');
    const stageStatus = selectEl ? selectEl.value : 'in_progress';
    const optText = selectEl?.options[selectEl.selectedIndex]?.text || stageStatus;
    await this.handleUpdateStageStatusWithVal(ticketId, stageStatus, `Status updated: ${optText}`);
  }

  async handleForwardStage(ticketId) {
    const forwardSelect = document.getElementById('console-forward-stage-select');
    const targetStageKey = forwardSelect ? forwardSelect.value : null;
    if (!targetStageKey) return;
    await this.handleEndorseNext(ticketId, targetStageKey);
  }

  async handleEndorseNext(ticketId, targetStageKey) {
    const targetDef = STAGE_DEFINITIONS.find(s => s.key === targetStageKey);
    const stageName = targetDef ? targetDef.name : targetStageKey;
    const currentUser = queueState.getCurrentUser();
    const officerName = currentUser ? `${currentUser.fullName} (${currentUser.title})` : 'Assessor Officer';
    const notes = document.getElementById('console-ticket-notes')?.value || '';

    // Clear active selection on current station so next docket is loaded
    if (this.selectedTicketIdByCounter) {
      delete this.selectedTicketIdByCounter[this.selectedCounterId];
    }

    const res = await queueState.forwardStage(ticketId, targetStageKey, officerName, notes);
    if (res && res.success) {
      this.showToast(`Pass #${res.ticket?.ticketNumber || ''} successfully endorsed to ${stageName}`);
    } else {
      this.showToast('Could not endorse pass to next station');
    }
    this.render();
  }

  handleValidateAllChecklist(ticketId) {
    const state = queueState.getRawState() || {};
    const ticket = (state.tickets || []).find(t => t.id === ticketId);
    if (ticket) {
      const reqs = ticket.serviceRequirements || SERVICES.find(s => s.id === ticket.serviceId)?.requirements || [];
      if (!ticket.checklist) ticket.checklist = {};
      reqs.forEach(r => { ticket.checklist[r] = true; });
      queueState.saveState(state);
      this.handleUpdateStageStatusWithVal(ticketId, 'reviewed', 'All requirements verified complete');
    }
  }

  async handleIssueDeficiency(ticketId) {
    const state = queueState.getRawState() || {};
    const ticket = (state.tickets || []).find(t => t.id === ticketId);
    const reqs = ticket?.serviceRequirements || SERVICES.find(s => s.id === ticket?.serviceId)?.requirements || [];
    const checklist = ticket?.checklist || {};
    const missing = reqs.filter(r => !checklist[r]);

    const missingStr = missing.length > 0 ? `Lacking: ${missing.join(', ')}` : 'Deficiency in submitted documents';
    const remark = `Deficiency Notice: ${missingStr}`;

    const notesEl = document.getElementById('console-ticket-notes');
    if (notesEl) {
      notesEl.value = (notesEl.value ? notesEl.value + ' | ' : '') + remark;
    }

    await this.handleUpdateStageStatusWithVal(ticketId, 'deficiency', remark);
  }

  async handleSaveTaxMapping(ticketId) {
    const sheet = document.getElementById('station2-sheet-select')?.value || 'Sheet 02';
    const lot = document.getElementById('station2-lot-input')?.value || 'Lot 104-B-2';
    const pin = document.getElementById('station2-pin-input')?.value || '024-05-0012-003-45';

    const state = queueState.getRawState() || {};
    const ticket = (state.tickets || []).find(t => t.id === ticketId);
    if (ticket) {
      ticket.taxDecPin = pin;
      queueState.saveState(state);
    }

    const remark = `Plotted on ${sheet}, Lot: ${lot}, PIN: ${pin}`;
    await this.handleUpdateStageStatusWithVal(ticketId, 'lot_plotted', remark);
  }

  async handleUpdateTMCR(ticketId) {
    await this.handleUpdateStageStatusWithVal(ticketId, 'tmcr_updated', 'Tax Mapping Control Roll (TMCR) Index Updated');
  }

  calculateDepreciation() {
    const rateEl = document.getElementById('station3-calc-class');
    const baseEl = document.getElementById('station3-calc-base');
    const ageEl = document.getElementById('station3-calc-age');
    const resultEl = document.getElementById('station3-calc-result');
    if (!rateEl || !baseEl || !ageEl || !resultEl) return;

    const rate = parseFloat(rateEl.value) || 1.5;
    const base = parseFloat(baseEl.value) || 2500000;
    const age = parseFloat(ageEl.value) || 8;

    const totalDepRate = Math.min(0.70, (rate * age) / 100);
    const depreciatedVal = Math.round(base * (1 - totalDepRate));

    resultEl.textContent = `₱ ${depreciatedVal.toLocaleString()}`;
  }

  async handleSaveAppraisal(ticketId) {
    const title = document.getElementById('station3-title-input')?.value || '';
    const priorTD = document.getElementById('station3-priortd-input')?.value || '';
    const tmv = document.getElementById('station3-calc-result')?.textContent?.trim() || '₱ 2,200,000';

    const remark = `Appraisal Verified. TMV: ${tmv} | Title: ${title} | Prior TD: ${priorTD}`;
    const notesEl = document.getElementById('console-ticket-notes');
    if (notesEl) {
      notesEl.value = (notesEl.value ? notesEl.value + ' | ' : '') + remark;
    }

    await this.handleUpdateStageStatusWithVal(ticketId, 'appraisal_done', remark);
  }

  calculateAssessedValue() {
    const levelEl = document.getElementById('station4-assessment-level');
    const tmvEl = document.getElementById('station4-tmv-input');
    const resultEl = document.getElementById('station4-av-result');
    if (!levelEl || !tmvEl || !resultEl) return;

    const level = parseFloat(levelEl.value) || 0.20;
    const tmv = parseFloat(tmvEl.value) || 2200000;
    const av = Math.round(tmv * level);

    resultEl.textContent = `₱ ${av.toLocaleString()} (Tax Base)`;
  }

  async handleAssessorSignOff(ticketId) {
    const av = document.getElementById('station4-av-result')?.textContent?.trim() || '₱ 440,000';
    const authCode = `PAO-VAL-2026-${Date.now().toString().slice(-6)}`;
    const remark = `Officially Approved by Provincial Assessor (Auth #${authCode}, AV: ${av})`;

    const notesEl = document.getElementById('console-ticket-notes');
    if (notesEl) {
      notesEl.value = (notesEl.value ? notesEl.value + ' | ' : '') + remark;
    }

    await this.handleUpdateStageStatusWithVal(ticketId, 'approved', remark);
  }

  async handleAssessorReturn(ticketId) {
    const remark = 'Returned for Technical Revision / Clarification on Property Boundary';
    await this.handleUpdateStageStatusWithVal(ticketId, 'returned_revision', remark);
  }

  generateNewTDNumber() {
    const input = document.getElementById('station5-td-input');
    if (input) {
      input.value = `TD-2026-PAO-${String(Math.floor(10000 + Math.random() * 90000))}`;
    }
  }

  async handleSaveAssessmentRoll(ticketId) {
    const td = document.getElementById('station5-td-input')?.value || `TD-2026-PAO-48912`;
    const roll = document.getElementById('station5-roll-input')?.value || 'Vol 2026-B';
    const arp = document.getElementById('station5-arp-input')?.value || 'ARP-024';

    const state = queueState.getRawState() || {};
    const ticket = (state.tickets || []).find(t => t.id === ticketId);
    if (ticket) {
      ticket.taxDecPin = td;
      queueState.saveState(state);
    }

    const remark = `Assigned ${td} in Roll ${roll} (${arp})`;
    await this.handleUpdateStageStatusWithVal(ticketId, 'td_generated', remark);
  }

  async handleConfirmRelease(ticketId) {
    const or = document.getElementById('station6-or-input')?.value || 'OR #9481029';
    const recipient = document.getElementById('station6-recipient-input')?.value || 'Taxpayer';
    const remark = `Owner Duplicate Tax Declaration officially released to ${recipient} (${or})`;

    if (this.selectedTicketIdByCounter) {
      delete this.selectedTicketIdByCounter[this.selectedCounterId];
    }
    await this.handleUpdateStageStatusWithVal(ticketId, 'released', remark);
    this.showToast(`Pass completed & owner duplicate released to ${recipient}!`);
  }

  async handleUpdateStageStatusWithVal(ticketId, stageStatus, remarkText) {
    const currentUser = queueState.getCurrentUser();
    const officerInput = document.getElementById('console-officer-name');
    const officerName = currentUser ? `${currentUser.fullName} (${currentUser.title})` : (officerInput ? officerInput.value : 'Assessment Personnel');
    const notes = document.getElementById('console-ticket-notes')?.value || '';

    const res = await queueState.updateStageStatus(ticketId, stageStatus, officerName, remarkText || notes);
    if (res && res.success) {
      this.showToast(`Stage status updated to "${stageStatus.replace(/_/g, ' ').toUpperCase()}"`);
    }
    this.render();
  }

  handleChecklistChange(ticketId, reqName, isChecked) {
    const state = queueState.getRawState() || {};
    const ticket = (state.tickets || []).find(t => t.id === ticketId);
    if (ticket) {
      if (!ticket.checklist) ticket.checklist = {};
      ticket.checklist[reqName] = isChecked;
      queueState.saveState(state);
    }
  }

  handleNotesChange(ticketId, notes) {
    const state = queueState.getRawState() || {};
    const ticket = (state.tickets || []).find(t => t.id === ticketId);
    if (ticket) {
      ticket.notes = notes;
      queueState.saveState(state);
    }
  }

  async handleCallNext(btnElement = null) {
    if (btnElement) {
      btnElement.classList.add('btn-pulse-call');
      setTimeout(() => btnElement.classList.remove('btn-pulse-call'), 800);
    }
    this.lastActionType = 'call_next';
    const res = await queueState.callNextTicket(this.selectedCounterId);
    if (res && res.success && res.ticket) {
      audioEngine.announceTicket(res.ticket, res.counter);
      const cName = res.ticket.clientName ? ` (${res.ticket.clientName})` : '';
      this.showToast(`Summoned Pass #${res.ticket.ticketNumber}${cName} to ${res.counter?.name || 'Station'}`);
    } else if (res && !res.success) {
      this.showToast(res.message || 'No waiting tickets.');
    }
    this.render();
    this.updateLiveDurationDisplay();
  }

  async handleRecall(btnElement = null) {
    if (btnElement) {
      btnElement.classList.add('btn-pulse-recall');
      setTimeout(() => btnElement.classList.remove('btn-pulse-recall'), 800);
    }
    this.lastActionType = 'recall';
    const res = await queueState.recallTicket(this.selectedCounterId);
    if (res && res.success && res.ticket) {
      audioEngine.announceTicket(res.ticket, res.counter);
      this.showToast(`Pass #${res.ticket.ticketNumber} re-announced with chime.`);
    } else if (res && !res.success) {
      this.showToast(res.message || 'No active ticket to recall.');
    }
    this.render();
    this.updateLiveDurationDisplay();
  }

  async handleStartServing() {
    const res = await queueState.startServingTicket(this.selectedCounterId);
    if (res && res.success) {
      this.activeServingStartTime = Date.now();
      const numStr = res.ticket ? `#${res.ticket.ticketNumber}` : 'Pass';
      const cName = res.ticket?.clientName ? ` (${res.ticket.clientName})` : '';
      this.showToast(`${numStr}${cName} is now IN SERVICE at Station ${this.selectedCounterId}`);
    } else if (res && !res.success) {
      this.showToast(res.message || 'Could not start service.');
    }
    this.render();
    this.updateLiveDurationDisplay();
  }

  async handleComplete() {
    const notes = document.getElementById('console-ticket-notes')?.value || '';
    const res = await queueState.completeTicket(this.selectedCounterId, notes);
    this.activeServingStartTime = null;
    if (res && res.success) {
      const numStr = res.ticket ? `#${res.ticket.ticketNumber}` : 'Pass';
      const cName = res.ticket?.clientName ? ` (${res.ticket.clientName})` : '';
      this.showToast(`${numStr}${cName} transaction completed successfully.`);
    } else if (res && !res.success) {
      this.showToast(res.message || 'Could not complete ticket.');
    }
    this.render();
    this.updateLiveDurationDisplay();
  }

  async handleNoShow() {
    if (confirm('Mark this taxpayer as No-Show / Missed Call?')) {
      const res = await queueState.noShowTicket(this.selectedCounterId);
      this.activeServingStartTime = null;
      if (res && res.success) {
        const numStr = res.ticket ? `#${res.ticket.ticketNumber}` : 'Pass';
        this.showToast(`${numStr} marked as No-Show.`);
      } else if (res && !res.success) {
        this.showToast(res.message || 'Could not mark no-show.');
      }
      this.render();
      this.updateLiveDurationDisplay();
    }
  }

  openTransferModal() {
    const modal = document.getElementById('console-transfer-modal');
    const select = document.getElementById('transfer-service-select');
    if (!modal || !select) return;

    select.innerHTML = SERVICES.map(s => `
      <option value="${s.id}">${s.code} - ${s.name}</option>
    `).join('');

    modal.classList.add('active');
  }

  closeTransferModal() {
    const modal = document.getElementById('console-transfer-modal');
    if (modal) modal.classList.remove('active');
  }

  async handleTransferSubmit() {
    const targetServiceId = document.getElementById('transfer-service-select')?.value;
    if (!targetServiceId) return;

    const res = await queueState.transferTicket(this.selectedCounterId, targetServiceId);
    this.activeServingStartTime = null;
    this.closeTransferModal();
    if (res && res.success) {
      this.showToast(`Pass transferred to ${res.ticket?.serviceName || 'new'} queue.`);
    } else if (res && !res.success) {
      this.showToast(res.message || 'Could not transfer ticket.');
    }
    this.render();
    this.updateLiveDurationDisplay();
  }

  toggleBreak() {
    const state = queueState.getRawState() || {};
    const counter = (state.counters || DEFAULT_STATIONS).find(c => c.id === this.selectedCounterId);
    if (!counter) return;

    const newStatus = counter.status === 'break' ? 'available' : 'break';
    queueState.setCounterStatus(this.selectedCounterId, newStatus);
    this.showToast(`${counter.name} status updated to ${newStatus.toUpperCase()}`);
    this.render();
  }

  showToast(message) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.gap = '8px';
    toast.style.background = '#000000';
    toast.style.color = '#ffffff';
    toast.style.padding = '10px 18px';
    toast.style.borderRadius = '9999px';
    toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    toast.style.fontSize = '12.5px';
    toast.style.fontWeight = '500';
    toast.style.marginTop = '8px';
    toast.style.fontFamily = 'var(--font-main, sans-serif)';

    toast.innerHTML = `
      <svg class="icon-svg icon-svg-sm" viewBox="0 0 24 24" style="stroke: #ffffff; flex-shrink: 0;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>
      <span>${message}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-6px)';
      toast.style.transition = 'all 0.2s ease';
      setTimeout(() => toast.remove(), 250);
    }, 3200);
  }
}

export const consoleController = new ConsoleController();
