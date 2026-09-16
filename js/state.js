/**
 * Provincial Assessor's Office - Queue State Manager
 * Full-Stack Hybrid State Engine:
 * - Direct REST API & Server-Sent Events (SSE) for zero-latency multi-device network sync.
 * - BroadcastChannel & LocalStorage fallback for offline resilience.
 * - 13 Official Provincial Assessor Services.
 * Configuration:
 * - Counter 1: All Assessment Services
 * - Counter 2: Priority Courtesy Lane & All Services
 * - Counter 3: All Assessment Services
 */

const STORAGE_KEY = 'provincial_assessor_queue_v1';
const CHANNEL_NAME = 'provincial_assessor_queue_channel';

// 13 Official Provincial Assessor Service Definitions
export const SERVICES = [
  {
    id: 'transfer',
    code: 'TRF',
    name: 'Transfer',
    description: 'Processing transfer of ownership for real property tax declarations.',
    requirements: ['Deed of Sale / Extrajudicial Settlement', 'eCAR from BIR', 'Transfer Tax Receipt', 'Updated RPT Clearance'],
    estTimeMin: 15,
    assignedCounterName: 'COUNTERS 1–3 • ALL SERVICES',
    icon: `<svg class="icon-svg icon-svg-lg" viewBox="0 0 24 24"><path d="M4 22h14a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4"></path><polyline points="14 2 14 8 20 8"></polyline><path d="M2 15h10"></path><path d="m9 18 3-3-3-3"></path></svg>`
  },
  {
    id: 'subdivision_consolidation',
    code: 'SUB',
    name: 'Subdivision/Consolidation',
    description: 'Processing segregation, lot subdivision, or consolidation of tax declarations.',
    requirements: ['Approved Lot Plan', 'Subdivision Agreement / Deed', 'DENR/LRA Technical Description', 'Tax Clearance'],
    estTimeMin: 15,
    assignedCounterName: 'COUNTERS 1–3 • ALL SERVICES',
    icon: `<svg class="icon-svg icon-svg-lg" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>`
  },
  {
    id: 'reclassification_agri_urban',
    code: 'RC-AGR',
    name: 'Reclassification (Agri to Urban)',
    description: 'Reclassification of agricultural land to residential, commercial, or industrial.',
    requirements: ['Sangguniang Bayan/Panlalawigan Ordinance', 'DAR Clearance / Exemption Order', 'Zoning Certification', 'Site Photos'],
    estTimeMin: 12,
    assignedCounterName: 'COUNTERS 1–3 • ALL SERVICES',
    icon: `<svg class="icon-svg icon-svg-lg" viewBox="0 0 24 24"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>`
  },
  {
    id: 'reclassification_urban_urban',
    code: 'RC-URB',
    name: 'Reclassification (Urban to Urban)',
    description: 'Conversion between urban property classifications and market valuation revision.',
    requirements: ['Locational Clearance', 'Business Permit / Occupancy Permit', 'Recent Property Inspection Report'],
    estTimeMin: 12,
    assignedCounterName: 'COUNTERS 1–3 • ALL SERVICES',
    icon: `<svg class="icon-svg icon-svg-lg" viewBox="0 0 24 24"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect><line x1="9" y1="22" x2="9" y2="22.01"></line><line x1="15" y1="22" x2="15" y2="22.01"></line><line x1="9" y1="6" x2="9" y2="6.01"></line><line x1="15" y1="6" x2="15" y2="6.01"></line><line x1="9" y1="10" x2="9" y2="10.01"></line><line x1="15" y1="10" x2="15" y2="10.01"></line><line x1="9" y1="14" x2="9" y2="14.01"></line><line x1="15" y1="14" x2="15" y2="14.01"></line><line x1="9" y1="18" x2="9" y2="18.01"></line><line x1="15" y1="18" x2="15" y2="18.01"></line></svg>`
  },
  {
    id: 'reassessment_dp_pc_dt',
    code: 'REA',
    name: 'Reassessment (DP/PC/DT)',
    description: 'Depreciation (DP), Physical Change (PC), Dispute/Total value re-assessment.',
    requirements: ['Letter Request for Reassessment', 'Building Plan / Cost Breakdown', 'Photos of Physical Condition'],
    estTimeMin: 12,
    assignedCounterName: 'COUNTERS 1–3 • ALL SERVICES',
    icon: `<svg class="icon-svg icon-svg-lg" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>`
  },
  {
    id: 'discovery_new_declaration',
    code: 'DIS',
    name: 'Discovery/New Declaration',
    description: 'First declaration of newly discovered land parcels or undeclared buildings.',
    requirements: ['Proof of Ownership / Title Copy', 'Sworn Statement of True Market Value', 'Barangay Certification of Improvement'],
    estTimeMin: 15,
    assignedCounterName: 'COUNTERS 1–3 • ALL SERVICES',
    icon: `<svg class="icon-svg icon-svg-lg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`
  },
  {
    id: 'certification_ctc_cpc',
    code: 'CTC',
    name: 'Certification/CTC/CPC',
    description: 'Certified True Copy (CTC), Certificate of Property Holdings (CPC), No Improvement.',
    requirements: ['Valid Government ID', 'Latest Real Property Tax (RPT) Official Receipt', 'Authorization Letter (if representative)'],
    estTimeMin: 7,
    assignedCounterName: 'COUNTERS 1–3 • ALL SERVICES',
    icon: `<svg class="icon-svg icon-svg-lg" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`
  },
  {
    id: 'verification_backtracking',
    code: 'VER',
    name: 'Verification/Back Tracking',
    description: 'Historical trace-back of mother titles, previous owners, and tax declarations.',
    requirements: ['Previous Tax Declaration Copy', 'Owner Name / Title Number', 'Valid ID'],
    estTimeMin: 10,
    assignedCounterName: 'COUNTERS 1–3 • ALL SERVICES',
    icon: `<svg class="icon-svg icon-svg-lg" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><polyline points="11 8 11 11 14 11"></polyline></svg>`
  },
  {
    id: 'annotation_cancellation',
    code: 'ANN',
    name: 'Annotation/Cancellation of Annotation',
    description: 'Mortgage annotation, adverse claims, bail bond encumbrances, and cancellations.',
    requirements: ['Real Estate Mortgage / Discharge of Mortgage Document', 'Official Receipt of Fee Payment', 'Valid ID'],
    estTimeMin: 8,
    assignedCounterName: 'COUNTERS 1–3 • ALL SERVICES',
    icon: `<svg class="icon-svg icon-svg-lg" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`
  },
  {
    id: 'ocular_inspection',
    code: 'OCU',
    name: 'Ocular Inspection',
    description: 'On-site field verification, boundary ocular inspection, and building appraisal.',
    requirements: ['Letter Request with Contact Details', 'Location Sketch / Vicinity Map', 'Property Key Person on Site'],
    estTimeMin: 10,
    assignedCounterName: 'COUNTERS 1–3 • ALL SERVICES',
    icon: `<svg class="icon-svg icon-svg-lg" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`
  },
  {
    id: 'cancellation_td',
    code: 'CAN',
    name: 'Cancellation of TD',
    description: 'Cancellation of double assessment, erroneous declaration, or demolished building.',
    requirements: ['Demolition Permit / Certificate of Non-Existence', 'Joint Affidavit of Cancellation', 'Tax Declaration Copies'],
    estTimeMin: 10,
    assignedCounterName: 'COUNTERS 1–3 • ALL SERVICES',
    icon: `<svg class="icon-svg icon-svg-lg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`
  },
  {
    id: 'tmcr_section_maps',
    code: 'MAP',
    name: 'TMCR/Section Map/s',
    description: 'Tax Mapping Control Roll (TMCR), cadastral maps, and PIN verification.',
    requirements: ['TCT/OCT Copy or TD Copy', 'Barangay and Municipality Location', 'Valid ID'],
    estTimeMin: 10,
    assignedCounterName: 'COUNTERS 1–3 • ALL SERVICES',
    icon: `<svg class="icon-svg icon-svg-lg" viewBox="0 0 24 24"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon><line x1="8" y1="2" x2="8" y2="18"></line><line x1="16" y1="6" x2="16" y2="22"></line></svg>`
  },
  {
    id: 'posting',
    code: 'PST',
    name: 'Posting',
    description: 'Official recording and posting of approved assessment transactions into the registry.',
    requirements: ['Approved Assessment Roll Transactions', 'Routing Slip / Assessor Stamp'],
    estTimeMin: 6,
    assignedCounterName: 'COUNTERS 1–3 • ALL SERVICES',
    icon: `<svg class="icon-svg icon-svg-lg" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"></path></svg>`
  }
];

export const ALL_SERVICE_IDS = SERVICES.map(s => s.id);

// Initial Counter Setups: Counter 1 (All), Counter 2 (Priority & All), Counter 3 (All)
export const DEFAULT_COUNTERS = [
  {
    id: 1,
    name: 'Counter 1',
    label: 'All Assessment Services',
    officer: 'Maria Santos (Assessment Officer)',
    status: 'available',
    activeTicketId: null,
    servingServices: ALL_SERVICE_IDS
  },
  {
    id: 2,
    name: 'Counter 2',
    label: 'Priority Lane & All Services',
    officer: 'Engr. Roberto Dela Cruz (Assessment Officer)',
    status: 'available',
    activeTicketId: null,
    servingServices: ALL_SERVICE_IDS
  },
  {
    id: 3,
    name: 'Counter 3',
    label: 'All Assessment Services',
    officer: 'Arch. Elena Gomez (Assessment Officer)',
    status: 'available',
    activeTicketId: null,
    servingServices: ALL_SERVICE_IDS
  }
];

export function getDesignatedCounter(serviceId, isPriority = false) {
  if (isPriority) {
    return { id: 2, name: 'Counter 2', label: 'Counter 2 (Priority Courtesy Lane)' };
  }
  return { id: null, name: 'Counters 1–3', label: 'Counters 1–3 (All Assessment Services)' };
}

class QueueStateManager {
  constructor() {
    this.channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null;
    this.listeners = new Set();
    this.callListeners = new Set();
    this.sseConnection = null;
    this.isServerConnected = false;

    // Listen to local BroadcastChannel
    if (this.channel) {
      this.channel.onmessage = (event) => {
        if (event.data) {
          if (event.data.type === 'STATE_UPDATED') {
            this.notifyListeners();
          } else if (event.data.type === 'TICKET_CALLED') {
            this.notifyCallListeners(event.data.payload);
          }
        }
      };
    }

    // Storage event for multi-tab fallback
    window.addEventListener('storage', (event) => {
      if (event.key === STORAGE_KEY) {
        this.notifyListeners();
      }
    });

    this.ensureInitialized();
    this.fetchServerState();
    this.initServerSync();

    // Lightweight fallback polling only when SSE connection is lost
    if (typeof window !== 'undefined') {
      setInterval(() => {
        if (!this.isServerConnected) {
          this.fetchServerState();
        }
      }, 4000);
    }
  }

  // Initialize Server-Sent Events (SSE) for real-time live network sync
  initServerSync() {
    if (typeof EventSource === 'undefined') return;

    try {
      this.sseConnection = new EventSource('/api/events');

      this.sseConnection.onopen = () => {
        this.isServerConnected = true;
        this.fetchServerState();
      };

      this.sseConnection.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload.type === 'STATE_CHANGED' && payload.data) {
            this.saveLocalCache(payload.data);
            this.notifyListeners();
          } else if (payload.type === 'TICKET_CALLED' && payload.data) {
            this.notifyCallListeners(payload.data);
          } else if (payload.type === 'TICKET_ISSUED') {
            this.fetchServerState();
          }
        } catch (err) {
          console.warn('SSE parse error:', err);
        }
      };

      this.sseConnection.onerror = () => {
        this.isServerConnected = false;
      };
    } catch (e) {
      console.warn('SSE initialization failed:', e);
    }
  }

  async fetchServerState() {
    try {
      const res = await fetch('/api/state');
      if (res.ok) {
        const state = await res.json();
        this.saveLocalCache(state);
        this.notifyListeners();
        return state;
      }
    } catch (e) {
      // Backend offline, fallback to local storage
    }
    return this.getRawState();
  }

  ensureInitialized() {
    const data = this.getRawState();
    const hasAlphaTicket = data && data.tickets && data.tickets.some(t => /[A-Za-z]/.test(t.ticketNumber));
    if (!data || !data.tickets || !data.counters || data.counters.length !== 3 || hasAlphaTicket || typeof data.nextTicketNumber !== 'number') {
      this.seedDemoQueue();
    }
  }

  getRawState() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      console.error('Failed to parse queue state:', e);
      return null;
    }
  }

  saveLocalCache(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (this.channel) {
      this.channel.postMessage({ type: 'STATE_UPDATED', timestamp: Date.now() });
    }
  }

  saveState(state) {
    this.saveLocalCache(state);
    this.notifyListeners();
  }

  seedInitialData() {
    const todayStr = new Date().toLocaleDateString('en-CA');
    const initialState = {
      date: todayStr,
      nextTicketNumber: 1,
      counters: DEFAULT_COUNTERS,
      tickets: [],
      lastCalledTicket: null,
      stats: {
        totalIssued: 0,
        totalServed: 0,
        totalNoShow: 0,
        avgWaitSeconds: 0
      }
    };
    this.saveState(initialState);
  }

  async seedDemoQueue() {
    try {
      const res = await fetch('/api/queue/seed', { method: 'POST' });
      if (res.ok) {
        this.fetchServerState();
        return;
      }
    } catch (e) {}

    const todayStr = new Date().toLocaleDateString('en-CA');
    const sampleTickets = [
      {
        id: 'T-001',
        ticketNumber: '1',
        serviceId: 'certification_ctc_cpc',
        serviceName: 'Certification/CTC/CPC',
        serviceCode: 'CTC',
        isPriority: false,
        priorityType: 'regular',
        status: 'serving',
        counterId: 1,
        counterName: 'Counter 1',
        officer: 'Maria Santos (Assessment Officer)',
        createdAt: Date.now() - 15 * 60000,
        calledAt: Date.now() - 3 * 60000,
        startedAt: Date.now() - 2 * 60000,
        completedAt: null,
        waitSeconds: 720
      },
      {
        id: 'T-002',
        ticketNumber: '2',
        serviceId: 'transfer',
        serviceName: 'Transfer',
        serviceCode: 'TRF',
        isPriority: true,
        priorityType: 'senior',
        status: 'serving',
        counterId: 2,
        counterName: 'Counter 2',
        officer: 'Engr. Roberto Dela Cruz (Assessment Officer)',
        createdAt: Date.now() - 20 * 60000,
        calledAt: Date.now() - 5 * 60000,
        startedAt: Date.now() - 4 * 60000,
        completedAt: null,
        waitSeconds: 900
      },
      {
        id: 'T-003',
        ticketNumber: '3',
        serviceId: 'reassessment_dp_pc_dt',
        serviceName: 'Reassessment (DP/PC/DT)',
        serviceCode: 'REA',
        isPriority: false,
        priorityType: 'regular',
        status: 'calling',
        counterId: 3,
        counterName: 'Counter 3',
        officer: 'Arch. Elena Gomez (Assessment Officer)',
        createdAt: Date.now() - 10 * 60000,
        calledAt: Date.now() - 1 * 60000,
        startedAt: null,
        completedAt: null,
        waitSeconds: 540
      },
      {
        id: 'T-004',
        ticketNumber: '4',
        serviceId: 'subdivision_consolidation',
        serviceName: 'Subdivision/Consolidation',
        serviceCode: 'SUB',
        isPriority: false,
        priorityType: 'regular',
        status: 'waiting',
        counterId: null,
        counterName: 'Counters 1–3',
        officer: null,
        createdAt: Date.now() - 8 * 60000,
        calledAt: null,
        startedAt: null,
        completedAt: null,
        waitSeconds: 0
      },
      {
        id: 'T-005',
        ticketNumber: '5',
        serviceId: 'verification_backtracking',
        serviceName: 'Verification/Back Tracking',
        serviceCode: 'VER',
        isPriority: false,
        priorityType: 'regular',
        status: 'waiting',
        counterId: null,
        counterName: 'Counters 1–3',
        officer: null,
        createdAt: Date.now() - 5 * 60000,
        calledAt: null,
        startedAt: null,
        completedAt: null,
        waitSeconds: 0
      },
      {
        id: 'T-006',
        ticketNumber: '6',
        serviceId: 'posting',
        serviceName: 'Posting',
        serviceCode: 'PST',
        isPriority: true,
        priorityType: 'pwd',
        status: 'waiting',
        counterId: 2,
        counterName: 'Counter 2',
        officer: 'Engr. Roberto Dela Cruz (Assessment Officer)',
        createdAt: Date.now() - 3 * 60000,
        calledAt: null,
        startedAt: null,
        completedAt: null,
        waitSeconds: 0
      }
    ];

    const counters = DEFAULT_COUNTERS.map(c => {
      if (c.id === 1) return { ...c, status: 'serving', activeTicketId: 'T-001' };
      if (c.id === 2) return { ...c, status: 'serving', activeTicketId: 'T-002' };
      if (c.id === 3) return { ...c, status: 'calling', activeTicketId: 'T-003' };
      return { ...c, status: 'available', activeTicketId: null };
    });

    const newState = {
      date: todayStr,
      nextTicketNumber: 7,
      counters: counters,
      tickets: sampleTickets,
      lastCalledTicket: sampleTickets[2],
      stats: {
        totalIssued: 6,
        totalServed: 0,
        totalNoShow: 0,
        avgWaitSeconds: 320
      }
    };

    this.saveState(newState);
  }

  // Create Ticket from Kiosk (Pure Number Sequence starting from 1 with Designated Counter)
  async createTicket({ serviceId, isPriority, priorityType }) {
    const payload = {
      serviceId,
      isPriority: !!isPriority,
      priorityType: priorityType || (isPriority ? 'senior' : 'regular')
    };

    // Try backend REST API
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const resData = await res.json();
        if (resData.ticket) {
          this.fetchServerState();
          return resData.ticket;
        }
      }
    } catch (e) {}

    // Fallback Local Creation
    const state = this.getRawState() || {};
    const service = SERVICES.find(s => s.id === serviceId) || SERVICES[0];

    let seq = typeof state.nextTicketNumber === 'number' ? state.nextTicketNumber : 1;
    const ticketNumber = String(seq);
    state.nextTicketNumber = seq + 1;

    const designated = getDesignatedCounter(service.id, isPriority);
    const ticketId = 'T-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);

    const newTicket = {
      id: ticketId,
      ticketNumber,
      serviceId: service.id,
      serviceName: service.name,
      serviceCode: service.code,
      isPriority: !!isPriority,
      priorityType: priorityType || (isPriority ? 'senior' : 'regular'),
      status: 'waiting',
      counterId: designated.id,
      counterName: designated.name,
      officer: null,
      createdAt: Date.now(),
      calledAt: null,
      startedAt: null,
      completedAt: null
    };

    if (!state.tickets) state.tickets = [];
    state.tickets.push(newTicket);
    state.stats.totalIssued = (state.stats.totalIssued || 0) + 1;

    this.saveState(state);
    return newTicket;
  }

  // Counter calls next ticket
  async callNextTicket(counterId) {
    try {
      const res = await fetch(`/api/counters/${counterId}/call`, { method: 'POST' });
      if (res.ok) {
        const resData = await res.json();
        if (resData.ticket) {
          this.broadcastTicketCall(resData.ticket, resData.counter);
          await this.fetchServerState();
          return { success: true, ticket: resData.ticket, counter: resData.counter };
        }
      }
    } catch (e) {}

    // Fallback Local Logic
    const state = this.getRawState();
    if (!state) return { success: false, message: 'State unavailable' };

    const counter = state.counters.find(c => c.id === Number(counterId));
    if (!counter) return { success: false, message: 'Counter not found' };

    const waitingTickets = state.tickets.filter(t => t.status === 'waiting');
    let nextTicket = null;

    if (Number(counterId) === 2) {
      nextTicket = waitingTickets.find(t => t.isPriority) || waitingTickets[0];
    } else {
      nextTicket = waitingTickets.find(t => !t.isPriority) || waitingTickets[0];
    }

    if (!nextTicket) {
      return { success: false, message: 'No waiting taxpayers in the queue.' };
    }

    nextTicket.status = 'calling';
    nextTicket.counterId = counter.id;
    nextTicket.counterName = counter.name;
    nextTicket.officer = counter.officer;
    nextTicket.calledAt = Date.now();

    counter.status = 'calling';
    counter.activeTicketId = nextTicket.id;
    state.lastCalledTicket = nextTicket;

    this.saveState(state);
    this.broadcastTicketCall(nextTicket, counter);
    return { success: true, ticket: nextTicket, counter };
  }

  // Recall active ticket
  async recallTicket(counterId) {
    try {
      const res = await fetch(`/api/counters/${counterId}/recall`, { method: 'POST' });
      if (res.ok) {
        const resData = await res.json();
        if (resData.ticket) {
          this.broadcastTicketCall(resData.ticket, resData.counter);
          await this.fetchServerState();
          return { success: true, ticket: resData.ticket, counter: resData.counter };
        }
      }
    } catch (e) {}

    const state = this.getRawState();
    if (!state) return { success: false, message: 'State unavailable' };

    const counter = state.counters.find(c => c.id === Number(counterId));
    if (!counter || !counter.activeTicketId) return { success: false, message: 'No active ticket to recall.' };

    const ticket = state.tickets.find(t => t.id === counter.activeTicketId);
    if (!ticket) return { success: false, message: 'Ticket not found' };

    ticket.status = 'calling';
    ticket.calledAt = Date.now();
    counter.status = 'calling';
    state.lastCalledTicket = ticket;

    this.saveState(state);
    this.broadcastTicketCall(ticket, counter);
    return { success: true, ticket, counter };
  }

  // Start serving
  async startServingTicket(counterId) {
    return this.startServing(counterId);
  }

  async startServing(counterId) {
    try {
      const res = await fetch(`/api/counters/${counterId}/serve`, { method: 'POST' });
      if (res.ok) {
        const resData = await res.json();
        await this.fetchServerState();
        return { success: true, ticket: resData.ticket };
      }
    } catch (e) {}

    const state = this.getRawState();
    if (!state) return { success: false, message: 'State unavailable' };

    const counter = state.counters.find(c => c.id === Number(counterId));
    if (!counter || !counter.activeTicketId) return { success: false, message: 'No active ticket at counter.' };

    const ticket = state.tickets.find(t => t.id === counter.activeTicketId);
    if (!ticket) return { success: false, message: 'Ticket not found' };

    ticket.status = 'serving';
    ticket.startedAt = Date.now();
    counter.status = 'serving';

    this.saveState(state);
    return { success: true, ticket, counter };
  }

  // Complete ticket
  async completeTicket(counterId, notes = '') {
    try {
      const res = await fetch(`/api/counters/${counterId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes })
      });
      if (res.ok) {
        const resData = await res.json();
        await this.fetchServerState();
        return { success: true, ticket: resData.ticket };
      }
    } catch (e) {}

    const state = this.getRawState();
    if (!state) return { success: false, message: 'State unavailable' };

    const counter = state.counters.find(c => c.id === Number(counterId));
    if (!counter || !counter.activeTicketId) return { success: false, message: 'No active ticket to complete.' };

    const ticket = state.tickets.find(t => t.id === counter.activeTicketId);
    if (ticket) {
      ticket.status = 'completed';
      ticket.completedAt = Date.now();
      ticket.serviceSeconds = ticket.startedAt ? Math.floor((Date.now() - ticket.startedAt) / 1000) : 0;
      ticket.notes = notes;
      state.stats.totalServed = (state.stats.totalServed || 0) + 1;
    }

    counter.status = 'available';
    counter.activeTicketId = null;

    this.saveState(state);
    return { success: true, ticket, counter };
  }

  // Mark ticket as No-Show
  async noShowTicket(counterId) {
    return this.markNoShow(counterId);
  }

  async markNoShow(counterId) {
    try {
      const res = await fetch(`/api/counters/${counterId}/noshow`, { method: 'POST' });
      if (res.ok) {
        const resData = await res.json();
        await this.fetchServerState();
        return { success: true, ticket: resData.ticket };
      }
    } catch (e) {}

    const state = this.getRawState();
    if (!state) return { success: false, message: 'State unavailable' };

    const counter = state.counters.find(c => c.id === Number(counterId));
    if (!counter || !counter.activeTicketId) return { success: false, message: 'No active ticket to mark as no-show.' };

    const ticket = state.tickets.find(t => t.id === counter.activeTicketId);
    if (ticket) {
      ticket.status = 'noshow';
      ticket.notes = 'Client did not show up';
      state.stats.totalNoShow = (state.stats.totalNoShow || 0) + 1;
    }

    counter.status = 'available';
    counter.activeTicketId = null;

    this.saveState(state);
    return { success: true, ticket, counter };
  }

  // Transfer ticket
  async transferTicket(counterIdOrTicketId, newServiceId) {
    const state = this.getRawState();
    if (!state) return { success: false, message: 'State unavailable' };

    let ticketId = counterIdOrTicketId;
    if (typeof counterIdOrTicketId === 'number' || /^\d+$/.test(counterIdOrTicketId)) {
      const counter = state.counters.find(c => c.id === Number(counterIdOrTicketId));
      if (!counter || !counter.activeTicketId) return { success: false, message: 'No active ticket to transfer.' };
      ticketId = counter.activeTicketId;
    }

    try {
      const res = await fetch(`/api/tickets/${ticketId}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newServiceId })
      });
      if (res.ok) {
        const resData = await res.json();
        await this.fetchServerState();
        return { success: true, ticket: resData.ticket };
      }
    } catch (e) {}

    const ticket = state.tickets.find(t => t.id === ticketId);
    const newService = SERVICES.find(s => s.id === newServiceId);
    if (!ticket || !newService) return { success: false, message: 'Invalid ticket or service' };

    const designated = getDesignatedCounter(newService.id, ticket.isPriority);

    const oldCounter = state.counters.find(c => c.activeTicketId === ticket.id);
    if (oldCounter) {
      oldCounter.status = 'available';
      oldCounter.activeTicketId = null;
    }

    ticket.serviceId = newService.id;
    ticket.serviceName = newService.name;
    ticket.serviceCode = newService.code;
    ticket.counterId = designated.id;
    ticket.counterName = designated.name;
    ticket.status = 'waiting';
    ticket.calledAt = null;
    ticket.startedAt = null;
    ticket.notes = (ticket.notes || '') + ` [Transferred to ${newService.name}]`;

    this.saveState(state);
    return { success: true, ticket };
  }

  // Set counter status
  async setCounterStatus(counterId, status, officerName = null) {
    try {
      await fetch(`/api/counters/${counterId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, officer: officerName })
      });
      this.fetchServerState();
      return;
    } catch (e) {}

    const state = this.getRawState();
    if (!state) return;

    const counter = state.counters.find(c => c.id === Number(counterId));
    if (!counter) return;

    if (status) counter.status = status;
    if (officerName) counter.officer = officerName;

    this.saveState(state);
  }

  // Reset entire queue
  async resetQueue() {
    try {
      const res = await fetch('/api/queue/reset', { method: 'POST' });
      if (res.ok) {
        this.fetchServerState();
        return;
      }
    } catch (e) {}

    this.seedInitialData();
  }

  broadcastTicketCall(ticket, counter) {
    const payload = {
      ticket,
      counter,
      timestamp: Date.now()
    };
    if (this.channel) {
      this.channel.postMessage({ type: 'TICKET_CALLED', payload });
    }
    this.notifyCallListeners(payload);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeCall(listener) {
    this.callListeners.add(listener);
    return () => this.callListeners.delete(listener);
  }

  notifyListeners() {
    const state = this.getRawState();
    this.listeners.forEach(cb => {
      try { cb(state); } catch (e) { console.error('Listener error:', e); }
    });
  }

  notifyCallListeners(payload) {
    this.callListeners.forEach(cb => {
      try { cb(payload); } catch (e) { console.error('Call listener error:', e); }
    });
  }
}

export const queueState = new QueueStateManager();
