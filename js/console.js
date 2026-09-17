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
    this.timerInterval = null;
    this.activeServingStartTime = null;
    this.prevTicketId = null;
    this.lastActionType = null;
    if (typeof window !== 'undefined') {
      window.consoleApp = this;
    }
  }

  init() {
    if (typeof window !== 'undefined') {
      window.consoleApp = this;
    }
    this.bindEvents();
    this.render();

    queueState.subscribe(() => {
      this.render();
    });

    // Dedicated continuous 1-second stopwatch ticker
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      this.updateLiveDurationDisplay();
    }, 1000);

    // Keyboard shortcuts for quick station workflow
    window.addEventListener('keydown', (e) => {
      const consoleView = document.getElementById('view-console');
      if (!consoleView || !consoleView.classList.contains('active')) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

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

    const currentCounter = counters.find(c => c.id === this.selectedCounterId) || counters[0];
    if (!currentCounter) return;

    // Update Counter / Station Selector & Info
    const counterSelect = document.getElementById('console-counter-select');
    const officerInput = document.getElementById('console-officer-name');
    const counterRoleBadge = document.getElementById('console-counter-role-badge');
    const counterStatusBadge = document.getElementById('console-counter-status-badge');

    if (counterSelect) counterSelect.value = currentCounter.id;
    if (officerInput && document.activeElement !== officerInput) officerInput.value = currentCounter.officer;
    if (counterRoleBadge) counterRoleBadge.innerText = currentCounter.name || currentCounter.label;

    if (counterStatusBadge) {
      counterStatusBadge.className = `badge-status ${currentCounter.status}`;
      counterStatusBadge.innerText = currentCounter.status.toUpperCase();
    }

    // Active Ticket Details
    const activeTicket = currentCounter.activeTicketId ? tickets.find(t => t.id === currentCounter.activeTicketId) : null;
    this.renderActiveTicketPanel(activeTicket, currentCounter);

    // Waiting queue for this station
    this.renderWaitingQueueForCounter(tickets, currentCounter);
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

      <!-- Primary Action Buttons -->
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

  renderWaitingQueueForCounter(tickets, counter) {
    const queueContainer = document.getElementById('console-counter-queue');
    if (!queueContainer) return;

    // Show tickets at this station or general waiting
    const waitingTickets = tickets.filter(t => t.status === 'waiting' || (t.currentStage === counter.key && t.status !== 'completed' && t.status !== 'noshow'));

    if (waitingTickets.length === 0) {
      queueContainer.innerHTML = `
        <div style="padding: 10px 4px; font-size: 12px; color: var(--colors-body, #737373); font-family: var(--font-mono, monospace);">
          No taxpayers currently waiting at this station.
        </div>
      `;
      return;
    }

    queueContainer.innerHTML = waitingTickets.map(t => {
      const waitTimeStr = this.formatWaitTime(t);
      const cName = t.clientName || 'Juan Dela Cruz';
      return `
        <div style="background: var(--colors-canvas, #ffffff); border: 1px solid var(--colors-hairline, #e5e5e5); border-radius: var(--rounded-md, 8px); padding: 8px 12px; min-width: 170px; flex-shrink: 0; display: flex; justify-content: space-between; align-items: center;">
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
            <div style="font-size: 9.5px; color: #2563eb; font-weight: 600;">
              ${t.currentStageShortName || 'Review'}
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
    const select = document.getElementById('console-stage-status-select');
    const officerInput = document.getElementById('console-officer-name');
    const stageStatus = select ? select.value : 'in_progress';
    const officerName = officerInput ? officerInput.value : 'Assessment Personnel';
    const notes = document.getElementById('console-ticket-notes')?.value || '';

    const res = await queueState.updateStageStatus(ticketId, stageStatus, officerName, notes);
    if (res && res.success) {
      this.showToast(`Stage status updated to "${stageStatus.replace(/_/g, ' ').toUpperCase()}"`);
    } else {
      this.showToast('Could not update stage status');
    }
    this.render();
  }

  async handleForwardStage(ticketId) {
    const select = document.getElementById('console-forward-stage-select');
    const officerInput = document.getElementById('console-officer-name');
    const nextStage = select ? select.value : 'tax_mapping';
    const officerName = officerInput ? officerInput.value : 'Assessment Personnel';
    const notes = document.getElementById('console-ticket-notes')?.value || '';

    const targetDef = STAGE_DEFINITIONS.find(s => s.key === nextStage);
    const stageName = targetDef ? targetDef.name : nextStage;

    const res = await queueState.forwardStage(ticketId, nextStage, officerName, notes);
    if (res && res.success) {
      this.showToast(`Pass #${res.ticket?.ticketNumber || ''} forwarded to ${stageName}`);
    } else {
      this.showToast('Could not forward pass');
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
