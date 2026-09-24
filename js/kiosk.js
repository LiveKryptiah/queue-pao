/**
 * Kiosk Module - Self-Service Ticket Dispenser & Mobile Tracker
 * Configuration:
 * - Counter 1: All Assessment Services
 * - Counter 2: Priority Courtesy Lane & All Services
 * - Counter 3: All Assessment Services
 * 13 Official Provincial Assessor Services.
 */

import { SERVICES, queueState, getDesignatedCounter } from './state.js';

class KioskController {
  constructor() {
    this.selectedService = null;
    this.currentGeneratedTicket = null;
  }

  init() {
    this.renderServiceCards();
    this.bindEvents();
  }

  renderServiceCards() {
    const container = document.getElementById('kiosk-services-grid');
    if (!container) return;

    container.innerHTML = SERVICES.map(srv => `
      <div class="kiosk-service-card">
        <div>
          <div class="service-card-top">
            <div class="service-icon-box">${srv.icon}</div>
            <span class="tag-badge primary">${srv.assignedCounterName}</span>
          </div>
          <h3 class="service-card-title">${srv.name}</h3>
          <p class="service-card-desc">${srv.description}</p>
          <div class="service-card-checklist">
            <strong>Checklist Requirements:</strong>
            ${srv.requirements.map(r => `• ${r}`).join('<br>')}
          </div>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 12px; border-top: 1px solid var(--colors-hairline); margin-top: 12px;">
          <span style="font-size: 11.5px; color: var(--colors-body); font-family: var(--font-mono);">Est: ~${srv.estTimeMin}m</span>
          <button class="btn btn-primary btn-sm" onclick="window.kioskApp.openClientModal('${srv.id}')">
            Select →
          </button>
        </div>
      </div>
    `).join('');
  }

  bindEvents() {
    const modal = document.getElementById('kiosk-modal');
    const form = document.getElementById('kiosk-ticket-form');
    const closeBtn = document.getElementById('kiosk-modal-close');
    const cancelBtn = document.getElementById('kiosk-modal-cancel');
    const priorityRadios = document.querySelectorAll('input[name="priorityType"]');
    const serviceSelect = document.getElementById('kiosk-service-select');

    if (serviceSelect) {
      serviceSelect.innerHTML = SERVICES.map(srv => `
        <option value="${srv.id}">[${srv.code}] ${srv.name}</option>
      `).join('');

      serviceSelect.onchange = (e) => {
        this.selectedService = SERVICES.find(s => s.id === e.target.value) || SERVICES[0];
        const title = document.getElementById('kiosk-modal-title');
        if (title) title.innerText = `Get Pass: ${this.selectedService.name}`;
        this.updateModalCounterDisplay();
      };
    }

    if (closeBtn) closeBtn.onclick = () => this.closeModal();
    if (cancelBtn) cancelBtn.onclick = () => this.closeModal();

    if (priorityRadios) {
      priorityRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
          document.querySelectorAll('.radio-card').forEach(c => c.classList.remove('selected'));
          const parent = e.target.closest('.radio-card');
          if (parent) parent.classList.add('selected');
          this.updateModalCounterDisplay();
        });
      });
    }

    if (form) {
      form.onsubmit = (e) => {
        e.preventDefault();
        this.handleFormSubmit();
      };
    }
  }

  updateModalCounterDisplay() {
    const counterDisp = document.getElementById('kiosk-assigned-counter-display');
    if (!counterDisp || !this.selectedService) return;

    const priorityType = document.querySelector('input[name="priorityType"]:checked')?.value || 'regular';
    const isPriority = priorityType !== 'regular';

    const designated = getDesignatedCounter(this.selectedService.id, isPriority);
    counterDisp.innerText = isPriority ? 'Counter 2 (Priority Courtesy Lane)' : 'Counters 1, 2 & 3 (All Services)';
  }

  openClientModal(serviceId, isPriorityPreselect = false) {
    let srv = null;
    if (serviceId) {
      const sid = String(serviceId).toLowerCase().trim();
      srv = SERVICES.find(s => 
        s.id.toLowerCase() === sid || 
        s.code.toLowerCase() === sid ||
        (sid === 'ctc' && s.id === 'certification_ctc_cpc') ||
        (sid === 'appraisal' && (s.id === 'reassessment_dp_pc_dt' || s.id === 'ocular_inspection')) ||
        (sid === 'mapping' && s.id === 'tmcr_section_maps')
      );
    }
    this.selectedService = srv || SERVICES[0];
    const modal = document.getElementById('kiosk-modal');
    const title = document.getElementById('kiosk-modal-title');
    const serviceSelect = document.getElementById('kiosk-service-select');
    const ticketNoDisp = document.getElementById('kiosk-ticket-no-display');

    if (title) title.innerText = `Get Pass: ${this.selectedService.name}`;
    if (serviceSelect) serviceSelect.value = this.selectedService.id;

    // Read immediately from in-memory state in 0ms
    const state = queueState.getRawState() || {};
    let nextNum = state.nextTicketNumber;
    if (!nextNum && state.tickets && state.tickets.length > 0) {
      const maxNum = Math.max(...state.tickets.map(t => parseInt(t.ticketNumber) || 0));
      nextNum = maxNum + 1;
    }
    if (!nextNum) nextNum = 1;
    if (ticketNoDisp) ticketNoDisp.innerText = nextNum;

    if (isPriorityPreselect) {
      const seniorRadio = document.querySelector('input[name="priorityType"][value="senior"]');
      if (seniorRadio) {
        seniorRadio.checked = true;
        document.querySelectorAll('.radio-card').forEach(c => c.classList.remove('selected'));
        seniorRadio.closest('.radio-card').classList.add('selected');
      }
    } else {
      const regRadio = document.querySelector('input[name="priorityType"][value="regular"]');
      if (regRadio) {
        regRadio.checked = true;
        document.querySelectorAll('.radio-card').forEach(c => c.classList.remove('selected'));
        regRadio.closest('.radio-card')?.classList.add('selected');
      }
    }

    this.updateModalCounterDisplay();

    if (modal) modal.classList.add('active');
  }

  closeModal() {
    const modal = document.getElementById('kiosk-modal');
    if (modal) modal.classList.remove('active');
  }

  async handleFormSubmit() {
    const submitBtn = document.querySelector('#kiosk-ticket-form button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    const clientNameInput = document.getElementById('kiosk-client-name');
    const clientName = (clientNameInput && clientNameInput.value.trim()) ? clientNameInput.value.trim() : 'Walk-in Client';
    const taxDecPinInput = document.getElementById('kiosk-tax-pin');
    const taxDecPin = taxDecPinInput ? taxDecPinInput.value.trim() : '';

    const priorityType = document.querySelector('input[name="priorityType"]:checked')?.value || 'regular';
    const isPriority = priorityType !== 'regular';
    const serviceSelect = document.getElementById('kiosk-service-select');
    const chosenServiceId = (serviceSelect && serviceSelect.value) ? serviceSelect.value : (this.selectedService ? this.selectedService.id : 'transfer');

    try {
      const ticket = await queueState.createTicket({
        serviceId: chosenServiceId,
        isPriority,
        priorityType,
        clientName,
        taxDecPin
      });

      this.currentGeneratedTicket = ticket;
      this.closeModal();
      this.showTicketPrintModal(ticket);

      // Reset form
      document.getElementById('kiosk-ticket-form')?.reset();
      if (clientNameInput) clientNameInput.value = '';
      if (taxDecPinInput) taxDecPinInput.value = '';
      const regRadio = document.querySelector('input[name="priorityType"][value="regular"]');
      if (regRadio) {
        regRadio.checked = true;
        document.querySelectorAll('.radio-card').forEach(c => c.classList.remove('selected'));
        regRadio.closest('.radio-card')?.classList.add('selected');
      }
    } catch (err) {
      console.error('Error creating ticket:', err);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  showTicketPrintModal(ticket) {
    const modal = document.getElementById('ticket-result-modal');
    const container = document.getElementById('ticket-print-area');
    if (!modal || !container) return;

    const state = queueState.getRawState() || {};
    const waitingTickets = state.tickets ? state.tickets.filter(t => t.status === 'waiting' && t.id !== ticket.id) : [];
    const aheadInLine = waitingTickets.length;
    const estWaitMins = (aheadInLine + 1) * 7;

    const now = new Date(ticket.createdAt);
    const dateFormatted = now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const timeFormatted = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    const stageName = ticket.currentStageName || 'Document Review & Receiving';
    const clientName = ticket.clientName || 'Juan Dela Cruz';
    const pinInfo = ticket.taxDecPin ? `<div><strong>Property PIN / TD:</strong> ${ticket.taxDecPin}</div>` : '';

    container.innerHTML = `
      <div style="background: #ffffff; padding: 20px; border-radius: 12px; border: 1px dashed #d4d4d4; text-align: center; font-family: var(--font-mono); color: #000000;">
        <img src="logo.png" alt="Office of the Provincial Assessor Logo" style="width: 52px; height: 52px; object-fit: contain; border-radius: 50%; margin-bottom: 6px; display: inline-block;">
        <div style="font-size: 11px; font-weight: 700; line-height: 1.3; margin-bottom: 2px;">
          REPUBLIC OF THE PHILIPPINES<br>
          PROVINCIAL ASSESSOR'S OFFICE
        </div>
        <div style="font-size: 9.5px; color: #737373; padding-bottom: 6px; border-bottom: 1px dashed #e5e5e5; margin-bottom: 8px;">
          CITIZEN QUEUE PASS • CAPITOL COMPOUND
        </div>

        <div style="font-size: 10px; font-weight: 700; color: #737373; text-transform: uppercase;">
          ${ticket.isPriority ? '★ PRIORITY COURTESY PASS ★' : 'REGULAR ASSESSMENT PASS'}
        </div>

        <div style="font-size: 44px; font-weight: 800; color: #000000; margin: 4px 0; letter-spacing: -1px;">
          #${ticket.ticketNumber}
        </div>

        <div style="font-size: 15px; font-weight: 800; color: #000000; margin-bottom: 2px; text-transform: uppercase;">
          ${clientName}
        </div>

        <div style="font-weight: 600; font-size: 12.5px; margin-bottom: 8px; color: #404040;">
          ${ticket.serviceName}
        </div>

        <div style="font-size: 11px; text-align: left; background: #fafafa; padding: 10px 12px; border-radius: 6px; border: 1px solid #e5e5e5; margin-bottom: 10px; line-height: 1.7;">
          <div><strong>Taxpayer / Client:</strong> ${clientName}</div>
          ${pinInfo}
          <div><strong>Initial Station:</strong> Window 1 • ${stageName}</div>
          <div><strong>Priority Qualifier:</strong> ${ticket.isPriority ? (ticket.priorityType || 'Priority').toUpperCase() : 'REGULAR'}</div>
          <div><strong>Ahead in Line:</strong> ${aheadInLine} pass(es)</div>
          <div><strong>Estimated Wait:</strong> ~${estWaitMins} mins</div>
          <div><strong>Issued:</strong> ${dateFormatted} • ${timeFormatted}</div>
        </div>

        <div style="width: 80px; height: 80px; margin: 0 auto 6px; border: 1px solid #000; padding: 2px; background:#fff;">
          <svg width="100%" height="100%" viewBox="0 0 29 29" shape-rendering="crispEdges">
            <rect width="29" height="29" fill="#ffffff" />
            <rect x="0" y="0" width="7" height="7" fill="#000000" />
            <rect x="1" y="1" width="5" height="5" fill="#ffffff" />
            <rect x="2" y="2" width="3" height="3" fill="#000000" />
            <rect x="22" y="0" width="7" height="7" fill="#000000" />
            <rect x="23" y="1" width="5" height="5" fill="#ffffff" />
            <rect x="24" y="2" width="3" height="3" fill="#000000" />
            <rect x="0" y="22" width="7" height="7" fill="#000000" />
            <rect x="1" y="23" width="5" height="5" fill="#ffffff" />
            <rect x="2" y="24" width="3" height="3" fill="#000000" />
            <rect x="8" y="2" width="2" height="2" fill="#000" />
            <rect x="12" y="4" width="3" height="2" fill="#000" />
            <rect x="16" y="2" width="2" height="4" fill="#000" />
            <rect x="10" y="8" width="4" height="2" fill="#000" />
            <rect x="16" y="10" width="3" height="3" fill="#000" />
            <rect x="9" y="13" width="2" height="5" fill="#000" />
            <rect x="13" y="14" width="4" height="2" fill="#000" />
            <rect x="20" y="14" width="5" height="2" fill="#000" />
            <rect x="10" y="20" width="3" height="2" fill="#000" />
          </svg>
        </div>
        <div style="font-size: 10px; font-weight: 600; color: #000000; margin-bottom: 2px;">
          Track Live on Mobile: /track.html?ticket=${ticket.ticketNumber}
        </div>
        <div style="font-size: 9.5px; color: #737373;">Please watch the lobby display screen</div>
      </div>
    `;

    modal.classList.add('active');
  }

  closeTicketPrintModal() {
    const modal = document.getElementById('ticket-result-modal');
    if (modal) modal.classList.remove('active');
  }

  printTicket() {
    window.print();
  }

  openMobileTrackerSimulator(ticketNumber = null) {
    const num = ticketNumber || (this.currentGeneratedTicket ? this.currentGeneratedTicket.ticketNumber : '1');
    window.open(`track.html?ticket=${encodeURIComponent(num)}`, '_blank', 'width=440,height=720,menubar=no,toolbar=no');
  }
}

export const kioskController = new KioskController();
