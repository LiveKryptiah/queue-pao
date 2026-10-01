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
    name: 'Transfer of Real Property',
    description: 'Processing transfer of ownership for real property tax declarations.',
    requirements: ['Deed of Sale / Extrajudicial Settlement', 'eCAR from BIR', 'Transfer Tax Receipt', 'Updated RPT Clearance'],
    estTimeMin: 15,
    estimation: 'New: 6h–11h | Old: 3d 3h–6d 6h / parcel',
    estimationDetails: [
      { type: 'New Cancellation', time: '6 hours up to 11 hours per parcel' },
      { type: 'Old Cancellation', time: '3 days and 3 hours up to 6 days and 6 hours per parcel' }
    ],
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
    estimation: '5h 30m – 10h per parcel',
    estimationDetails: [
      { type: 'Subdivision, Consolidation & Reclassification', time: '5 hours and 30 mins up to 10 hours per parcel' }
    ],
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
    estimation: '5h 30m – 10h per parcel',
    estimationDetails: [
      { type: 'Subdivision, Consolidation & Reclassification', time: '5 hours and 30 mins up to 10 hours per parcel' }
    ],
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
    estimation: '5h 30m – 10h per parcel',
    estimationDetails: [
      { type: 'Subdivision, Consolidation & Reclassification', time: '5 hours and 30 mins up to 10 hours per parcel' }
    ],
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
    estimation: 'New: 5h 30m–10h | Old: 3d 2h 30m–6d 5h / parcel',
    estimationDetails: [
      { type: 'New Cancellation', time: '5 hours and 30 mins up to 10 hours per parcel' },
      { type: 'Old Cancellation', time: '3 days 2 hours and 30 mins up to 6 days and 5 hours per parcel' }
    ],
    assignedCounterName: 'COUNTERS 1–3 • ALL SERVICES',
    icon: `<svg class="icon-svg icon-svg-lg" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>`
  },
  {
    id: 'discovery_new_declaration',
    code: 'DIS',
    name: 'New Declaration / Discovery',
    description: 'First declaration of newly discovered land parcels or undeclared buildings.',
    requirements: ['Proof of Ownership / Title Copy', 'Sworn Statement of True Market Value', 'Barangay Certification of Improvement'],
    estTimeMin: 15,
    estimation: 'New: 5h 30m–10h | Old: 3d 2h 30m–6d 5h / parcel',
    estimationDetails: [
      { type: 'New Cancellation', time: '5 hours and 30 mins up to 10 hours per parcel' },
      { type: 'Old Cancellation', time: '3 days 2 hours and 30 mins up to 6 days and 5 hours per parcel' }
    ],
    assignedCounterName: 'COUNTERS 1–3 • ALL SERVICES',
    icon: `<svg class="icon-svg icon-svg-lg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`
  },
  {
    id: 'certification_ctc_cpc',
    code: 'CTC',
    name: 'Certifications (CTC/CPC)',
    description: 'Certified True Copy (CTC), Certificate of Property Holdings (CPC), No Improvement.',
    requirements: ['Valid Government ID', 'Latest Real Property Tax (RPT) Official Receipt', 'Authorization Letter (if representative)'],
    estTimeMin: 7,
    estimation: 'New: 4h–7h | Old: 3d 1h–6d 2h / doc',
    estimationDetails: [
      { type: 'New Cancellation', time: '4 hours up to 7 hours per document' },
      { type: 'Old Cancellation', time: '3 days and 1 hour up to 6 days and 2 hours per document' }
    ],
    assignedCounterName: 'COUNTERS 1–3 • ALL SERVICES',
    icon: `<svg class="icon-svg icon-svg-lg" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`
  },
  {
    id: 'verification_backtracking',
    code: 'VER',
    name: 'Property History Verification',
    description: 'Historical trace-back of mother titles, previous owners, and tax declarations.',
    requirements: ['Previous Tax Declaration Copy', 'Owner Name / Title Number', 'Valid ID'],
    estTimeMin: 10,
    estimation: '3 days – 6 days per parcel',
    estimationDetails: [
      { type: 'Property History Verification', time: '3 days up to 6 days per parcel' }
    ],
    assignedCounterName: 'COUNTERS 1–3 • ALL SERVICES',
    icon: `<svg class="icon-svg icon-svg-lg" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><polyline points="11 8 11 11 14 11"></polyline></svg>`
  },
  {
    id: 'annotation_cancellation',
    code: 'ANN',
    name: 'Annotation/Cancellation',
    description: 'Mortgage annotation, adverse claims, bail bond encumbrances, and cancellations.',
    requirements: ['Real Estate Mortgage / Discharge of Mortgage Document', 'Official Receipt of Fee Payment', 'Valid ID'],
    estTimeMin: 8,
    estimation: '2 hours – 4 hours',
    estimationDetails: [
      { type: 'Annotation & Cancellation', time: '2 hours up to 4 hours' }
    ],
    assignedCounterName: 'COUNTERS 1–3 • ALL SERVICES',
    icon: `<svg class="icon-svg icon-svg-lg" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`
  },
  {
    id: 'ocular_inspection',
    code: 'OCU',
    name: 'Appraisal Committee Inspection',
    description: 'On-site field verification, boundary ocular inspection, and building appraisal.',
    requirements: ['Letter Request with Contact Details', 'Location Sketch / Vicinity Map', 'Property Key Person on Site'],
    estTimeMin: 10,
    estimation: '12 days – 19 days',
    estimationDetails: [
      { type: 'Appraisal Committee Inspection', time: '12 days up to 19 days' }
    ],
    assignedCounterName: 'COUNTERS 1–3 • ALL SERVICES',
    icon: `<svg class="icon-svg icon-svg-lg" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`
  },
  {
    id: 'cancellation_td',
    code: 'CAN',
    name: 'Cancellation of Duplicate/Retired',
    description: 'Cancellation of double assessment, erroneous declaration, or demolished building.',
    requirements: ['Demolition Permit / Certificate of Non-Existence', 'Joint Affidavit of Cancellation', 'Tax Declaration Copies'],
    estTimeMin: 10,
    estimation: '3 hours – 6 hours',
    estimationDetails: [
      { type: 'Cancellation of Duplicate / Retired TD', time: '3 hours up to 6 hours' }
    ],
    assignedCounterName: 'COUNTERS 1–3 • ALL SERVICES',
    icon: `<svg class="icon-svg icon-svg-lg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`
  },
  {
    id: 'tmcr_section_maps',
    code: 'MAP',
    name: 'TMCR/Section Maps',
    description: 'Tax Mapping Control Roll (TMCR), cadastral maps, and PIN verification.',
    requirements: ['TCT/OCT Copy or TD Copy', 'Barangay and Municipality Location', 'Valid ID'],
    estTimeMin: 10,
    estimation: 'Photocopy: 2h–4h | Certified: 4h–6h',
    estimationDetails: [
      { type: 'Photocopy', time: '2 hours up to 4 hours' },
      { type: 'Certified Copy', time: '4 hours up to 6 hours' }
    ],
    assignedCounterName: 'COUNTERS 1–3 • ALL SERVICES',
    icon: `<svg class="icon-svg icon-svg-lg" viewBox="0 0 24 24"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon><line x1="8" y1="2" x2="8" y2="18"></line><line x1="16" y1="6" x2="16" y2="22"></line></svg>`
  },
  {
    id: 'posting',
    code: 'PST',
    name: 'Bulletin Board Posting',
    description: 'Official recording and posting of approved assessment transactions into the registry.',
    requirements: ['Approved Assessment Roll Transactions', 'Routing Slip / Assessor Stamp'],
    estTimeMin: 6,
    estimation: '1 hour – 2 hours',
    estimationDetails: [
      { type: 'Office Bulletin Board Posting', time: '1 hour up to 2 hours' }
    ],
    assignedCounterName: 'COUNTERS 1–3 • ALL SERVICES',
    icon: `<svg class="icon-svg icon-svg-lg" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"></path></svg>`
  }
];

export const ALL_SERVICE_IDS = SERVICES.map(s => s.id);

export const STAGE_DEFINITIONS = [
  { key: 'review', id: 1, name: 'Window 1: Assessment Officer (Intake)', shortName: 'Window 1 (Intake)', order: 1, color: '#000000' },
  { key: 'tax_mapping', id: 2, name: 'Window 2: Tax Mapping', shortName: 'Window 2 (Tax Map)', order: 2, color: '#000000' },
  { key: 'appraisal', id: 3, name: 'Window 3: Appraisal/Assessment', shortName: 'Window 3 (Appraisal)', order: 3, color: '#000000' },
  { key: 'approval', id: 4, name: 'Window 4: Provincial Assessor Approval', shortName: 'Window 4 (Approval)', order: 4, color: '#000000' },
  { key: 'recording', id: 5, name: 'Recording Desk (Assessment Roll)', shortName: 'Recording Desk', order: 5, color: '#000000' },
  { key: 'releasing', id: 6, name: 'Window 5: Document Releasing', shortName: 'Window 5 (Releasing)', order: 6, color: '#000000' }
];

export const DEFAULT_STATIONS = [
  {
    id: 1,
    key: 'review',
    name: 'Window 1: Assessment Officer',
    shortName: 'Window 1 (Intake)',
    label: 'Window 1 • Front Desk Intake & Document Review',
    officer: 'Maria Santos (Assessment Officer)',
    status: 'available',
    activeTicketId: null,
    servingServices: ALL_SERVICE_IDS
  },
  {
    id: 2,
    key: 'tax_mapping',
    name: 'Window 2: Tax Mapping',
    shortName: 'Window 2 (Tax Map)',
    label: 'Window 2 • Section Maps & Lot Boundary Plotting',
    officer: 'Engr. Roberto Dela Cruz (Tax Mapping Officer)',
    status: 'available',
    activeTicketId: null,
    servingServices: ALL_SERVICE_IDS
  },
  {
    id: 3,
    key: 'appraisal',
    name: 'Window 3: Appraisal/Assessment',
    shortName: 'Window 3 (Appraisal)',
    label: 'Window 3 • Historical Title Trace & Property Valuation',
    officer: 'Arch. Elena Gomez (Appraisal Officer)',
    status: 'available',
    activeTicketId: null,
    servingServices: ALL_SERVICE_IDS
  },
  {
    id: 4,
    key: 'approval',
    name: 'Window 4: Approval',
    shortName: 'Window 4 (Approval)',
    label: 'Executive Desk • Official Sign-off & Assessment Approval',
    officer: 'Atty. Francis Bautista (Provincial Assessor)',
    status: 'available',
    activeTicketId: null,
    servingServices: ALL_SERVICE_IDS
  },
  {
    id: 5,
    key: 'recording',
    name: 'Recording Desk',
    shortName: 'Recording Desk',
    label: 'Recording Desk • System Encoding & Assessment Roll',
    officer: 'Carla Reyes (Records Officer)',
    status: 'available',
    activeTicketId: null,
    servingServices: ALL_SERVICE_IDS
  },
  {
    id: 6,
    key: 'releasing',
    name: 'Window 5: Releasing',
    shortName: 'Window 5 (Releasing)',
    label: 'Window 5 • Owner Duplicate Releasing & Handover',
    officer: 'Mark Anthony Ramos (Releasing Officer)',
    status: 'available',
    activeTicketId: null,
    servingServices: ALL_SERVICE_IDS
  }
];

export const DEFAULT_COUNTERS = DEFAULT_STATIONS;

export function isTransferSubdivisionReclass(ticketOrServiceId, serviceName = '', serviceCode = '') {
  let s = '';
  if (typeof ticketOrServiceId === 'object' && ticketOrServiceId !== null) {
    s = `${ticketOrServiceId.serviceId || ''} ${ticketOrServiceId.serviceName || ''} ${ticketOrServiceId.serviceCode || ''}`.toLowerCase();
  } else {
    s = `${ticketOrServiceId || ''} ${serviceName} ${serviceCode}`.toLowerCase();
  }
  return (
    s.includes('transfer') ||
    s.includes('subdivision') ||
    s.includes('consolidation') ||
    s.includes('reclassification') ||
    s.includes('reclass') ||
    s.includes('rc-agr') ||
    s.includes('rc-urb') ||
    s.includes('trf') ||
    s.includes('sub')
  );
}

export function getNextStageForTicket(ticket) {
  if (!ticket) return STAGE_DEFINITIONS[1] || STAGE_DEFINITIONS[0];
  const currStageKey = ticket.currentStage || 'review';

  // 1 - 3 - 2 - 4 - Recording - 5 endorsement process for Transfer, Subdivision, Consolidation, and Reclassification
  if (isTransferSubdivisionReclass(ticket)) {
    const flow = ['review', 'appraisal', 'tax_mapping', 'approval', 'recording', 'releasing'];
    if (flow.includes(currStageKey)) {
      const idx = flow.indexOf(currStageKey);
      if (idx < flow.length - 1) {
        const nextKey = flow[idx + 1];
        return STAGE_DEFINITIONS.find(s => s.key === nextKey) || STAGE_DEFINITIONS[STAGE_DEFINITIONS.length - 1];
      }
      return STAGE_DEFINITIONS.find(s => s.key === 'releasing') || STAGE_DEFINITIONS[STAGE_DEFINITIONS.length - 1];
    }
  }

  // Standard sequential flow for other services
  const defaultFlow = ['review', 'tax_mapping', 'appraisal', 'approval', 'recording', 'releasing'];
  const currIdx = defaultFlow.indexOf(currStageKey);
  if (currIdx >= 0 && currIdx < defaultFlow.length - 1) {
    const nextKey = defaultFlow[currIdx + 1];
    return STAGE_DEFINITIONS.find(s => s.key === nextKey) || STAGE_DEFINITIONS[STAGE_DEFINITIONS.length - 1];
  }
  return STAGE_DEFINITIONS.find(s => s.key === 'releasing') || STAGE_DEFINITIONS[STAGE_DEFINITIONS.length - 1];
}

export const DEFAULT_USERS = [
  {
    id: 1,
    username: 'maria.santos',
    password: 'password123',
    fullName: 'Maria Santos',
    title: 'Assessment Officer / Document Reviewer',
    role: 'staff',
    stationId: 1,
    stationKey: 'review',
    stationName: 'Window 1: Assessment Officer',
    allowedViews: ['console', 'kiosk'],
    allowedStations: [1],
    canAccessAdmin: false,
    canAccessTV: false,
    avatar: 'MS',
    email: 'maria.santos@assessor.gov.ph',
    status: 'active'
  },
  {
    id: 2,
    username: 'roberto.delacruz',
    password: 'password123',
    fullName: 'Engr. Roberto Dela Cruz',
    title: 'Tax Mapping Specialist / Cadastral Engineer',
    role: 'staff',
    stationId: 2,
    stationKey: 'tax_mapping',
    stationName: 'Window 2: Tax Mapping',
    allowedViews: ['console'],
    allowedStations: [2],
    canAccessAdmin: false,
    canAccessTV: false,
    avatar: 'RD',
    email: 'roberto.delacruz@assessor.gov.ph',
    status: 'active'
  },
  {
    id: 3,
    username: 'elena.gomez',
    password: 'password123',
    fullName: 'Arch. Elena Gomez',
    title: 'Appraisal & Assessment Valuation Officer',
    role: 'staff',
    stationId: 3,
    stationKey: 'appraisal',
    stationName: 'Window 3: Appraisal/Assessment',
    allowedViews: ['console'],
    allowedStations: [3],
    canAccessAdmin: false,
    canAccessTV: false,
    avatar: 'EG',
    email: 'elena.gomez@assessor.gov.ph',
    status: 'active'
  },
  {
    id: 4,
    username: 'francis.bautista',
    password: 'password123',
    fullName: 'Atty. Francis Bautista',
    title: 'Provincial Assessor',
    role: 'staff',
    stationId: 4,
    stationKey: 'approval',
    stationName: 'Window 4: Approval',
    allowedViews: ['console'],
    allowedStations: [4],
    canAccessAdmin: false,
    canAccessTV: false,
    avatar: 'FB',
    email: 'francis.bautista@assessor.gov.ph',
    status: 'active'
  },
  {
    id: 5,
    username: 'carla.reyes',
    password: 'password123',
    fullName: 'Carla Reyes',
    title: 'Records Specialist & Assessment Roll Clerk',
    role: 'staff',
    stationId: 5,
    stationKey: 'recording',
    stationName: 'Recording Desk',
    allowedViews: ['console'],
    allowedStations: [5],
    canAccessAdmin: false,
    canAccessTV: false,
    avatar: 'CR',
    email: 'carla.reyes@assessor.gov.ph',
    status: 'active'
  },
  {
    id: 6,
    username: 'mark.ramos',
    password: 'password123',
    fullName: 'Mark Anthony Ramos',
    title: 'Releasing & Issuance Officer',
    role: 'staff',
    stationId: 6,
    stationKey: 'releasing',
    stationName: 'Window 5: Releasing',
    allowedViews: ['console'],
    allowedStations: [6],
    canAccessAdmin: false,
    canAccessTV: false,
    avatar: 'MR',
    email: 'mark.ramos@assessor.gov.ph',
    status: 'active'
  },
  {
    id: 7,
    username: 'admin',
    password: 'password123',
    fullName: 'Atty. Cristina Ramos',
    title: 'Provincial Assessor Administrator',
    role: 'admin',
    stationId: null,
    stationKey: 'all',
    stationName: 'All Stations (Administrator)',
    allowedViews: ['console', 'kiosk', 'display', 'admin'],
    allowedStations: [1, 2, 3, 4, 5, 6],
    canAccessAdmin: true,
    canAccessTV: true,
    avatar: 'PA',
    email: 'cristina.ramos@assessor.gov.ph',
    status: 'active'
  }
];

export function getDesignatedCounter(serviceId, isPriority = false) {
  if (isPriority) {
    return { id: 2, name: 'Window 2: Tax Mapping (Priority Courtesy Lane)', label: 'Window 2 • Priority Courtesy Lane' };
  }
  return { id: 1, name: 'Window 1: Assessment Officer', label: 'Window 1 • Assessment Officer' };
}

class QueueStateManager {
  constructor() {
    this.channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null;
    this.listeners = new Set();
    this.callListeners = new Set();
    this.sseConnection = null;
    this.isServerConnected = false;

    this.authListeners = new Set();
    this.currentUser = null;

    // Listen to local BroadcastChannel
    if (this.channel) {
      this.channel.onmessage = (event) => {
        if (event.data) {
          if (event.data.type === 'STATE_UPDATED') {
            this.notifyListeners();
          } else if (event.data.type === 'TICKET_CALLED') {
            this.notifyCallListeners(event.data.payload);
          } else if (event.data.type === 'AUTH_CHANGED') {
            this.currentUser = event.data.payload;
            this.notifyAuthListeners();
          }
        }
      };
    }

    // Storage event for multi-tab fallback
    window.addEventListener('storage', (event) => {
      if (event.key === STORAGE_KEY) {
        this.notifyListeners();
      } else if (event.key === 'queue_pao_auth_user') {
        try {
          this.currentUser = event.newValue ? JSON.parse(event.newValue) : null;
          this.notifyAuthListeners();
        } catch (e) {}
      }
    });

    this.initAuth();
    this.ensureInitialized();
    this.fetchServerState();
    this.initServerSync();

    // Adaptive real-time polling to ensure instant multi-device sync on Vercel / serverless
    if (typeof window !== 'undefined') {
      setInterval(() => {
        // Run fast sync every 1.5s if SSE is not connected (e.g. Vercel), or every 3s as heartbeat
        this.fetchServerState();
      }, 1500);
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
        const stateStr = JSON.stringify(state);
        const prevStr = localStorage.getItem(STORAGE_KEY);

        // Only re-render when data actually changed to prevent DOM flicker
        if (stateStr !== prevStr) {
          let prev = null;
          try { prev = prevStr ? JSON.parse(prevStr) : null; } catch (e) {}

          const prevCallTime = prev && prev.lastCalledTicket ? (prev.lastCalledTicket.calledAt || prev.lastCalledTicket.createdAt || 0) : 0;
          const newCallTime = state && state.lastCalledTicket ? (state.lastCalledTicket.calledAt || state.lastCalledTicket.createdAt || 0) : 0;

          this.saveLocalCache(state);
          this.notifyListeners();

          // Announce ticket on TV display if newly called
          if (state.lastCalledTicket && newCallTime > prevCallTime) {
            const counter = state.counters ? state.counters.find(c => c.id === state.lastCalledTicket.counterId) : null;
            this.notifyCallListeners({ ticket: state.lastCalledTicket, counter, isRecall: false });
          }
        }
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
    if (!data || !data.tickets || !data.counters || data.counters.length !== DEFAULT_COUNTERS.length || hasAlphaTicket || typeof data.nextTicketNumber !== 'number') {
      this.seedInitialData();
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
      counters: DEFAULT_COUNTERS.map(c => ({ ...c, status: 'available', activeTicketId: null })),
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
    await this.resetQueue();
  }


  // Create Ticket from Kiosk (with Client Name, PIN, and initial Review Station)
  async createTicket({ serviceId, isPriority, priorityType, clientName, taxDecPin }) {
    const payload = {
      serviceId,
      isPriority: !!isPriority,
      priorityType: priorityType || (isPriority ? 'senior' : 'regular'),
      clientName: (clientName || 'Walk-in Client').trim(),
      taxDecPin: (taxDecPin || '').trim()
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

    const now = Date.now();
    const newTicket = {
      id: ticketId,
      ticketNumber,
      clientName: payload.clientName,
      taxDecPin: payload.taxDecPin,
      serviceId: service.id,
      serviceName: service.name,
      serviceCode: service.code,
      estimation: service.estimation || '',
      estimationDetails: service.estimationDetails || [],
      isPriority: !!isPriority,
      priorityType: priorityType || (isPriority ? 'senior' : 'regular'),
      status: 'serving',
      currentStage: 'review',
      currentStageName: 'Document Review & Receiving',
      currentStageShortName: 'Review & Receiving',
      stageStatus: 'in_progress',
      stageHistory: [
        {
          stage: 'review',
          stageName: 'Document Review & Receiving',
          status: 'serving',
          officer: designated.officer || 'Maria Santos',
          timestamp: now,
          remarks: `Queue slip issued; auto-started serving for ${payload.clientName} - ${service.name}`
        }
      ],
      stageProgressPercent: 15,
      counterId: designated.id,
      counterName: designated.name,
      officer: designated.officer || 'Maria Santos',
      createdAt: now,
      updatedAt: now,
      calledAt: now,
      startedAt: now,
      completedAt: null
    };

    if (!state.tickets) state.tickets = [];
    state.tickets.push(newTicket);
    state.stats.totalIssued = (state.stats.totalIssued || 0) + 1;

    // Auto-assign to designated counter as active serving ticket
    const counter = (state.counters || []).find(c => c.id === designated.id);
    if (counter) {
      counter.status = 'serving';
      counter.activeTicketId = newTicket.id;
      counter.activeTicket = newTicket;
    }
    state.lastCalledTicket = newTicket;

    this.saveState(state);
    return newTicket;
  }

  // Forward ticket to another processing stage / station
  async forwardStage(ticketId, nextStageKey, officerName = '', remarks = '') {
    try {
      const res = await fetch(`/api/tickets/${ticketId}/forward`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nextStage: nextStageKey, officer: officerName, remarks })
      });
      if (res.ok) {
        const resData = await res.json();
        await this.fetchServerState();
        return { success: true, ticket: resData.ticket };
      }
    } catch (e) {}

    // Fallback Local
    const state = this.getRawState() || {};
    const ticket = (state.tickets || []).find(t => t.id === ticketId || t.ticketNumber === String(ticketId));
    if (!ticket) return { success: false, message: 'Ticket not found' };

    const isReleasing = nextStageKey === 'releasing';
    const targetDef = STAGE_DEFINITIONS.find(s => s.key === nextStageKey) || STAGE_DEFINITIONS[0];
    const prevCounterId = ticket.counterId;
    const now = Date.now();
    ticket.currentStage = targetDef.key;
    ticket.currentStageName = isReleasing ? 'Window 5: Releasing' : targetDef.name;
    ticket.currentStageShortName = targetDef.shortName;
    ticket.counterId = isReleasing ? 6 : targetDef.id;
    ticket.counterName = isReleasing ? 'Window 5: Releasing' : targetDef.name;
    ticket.stageStatus = isReleasing ? 'ready_for_release' : 'in_progress';
    ticket.status = isReleasing ? 'waiting' : 'serving';
    ticket.startedAt = isReleasing ? ticket.startedAt : now;
    ticket.updatedAt = now;
    if (!ticket.stageHistory) ticket.stageHistory = [];
    ticket.stageHistory.push({
      stage: targetDef.key,
      stageName: ticket.counterName,
      status: ticket.stageStatus,
      officer: officerName || (isReleasing ? 'Mark Anthony Ramos (Releasing Officer)' : (targetDef.key === 'recording' ? 'Carla Reyes (Records Officer)' : 'Assessor Personnel')),
      timestamp: now,
      remarks: remarks || (isReleasing ? 'Endorsed to Window 5 for Document Release' : targetDef.key === 'recording' ? 'Endorsed to Recording Desk for Assessment Roll' : `Endorsed to ${targetDef.shortName}`)
    });

    if (prevCounterId && state.counters) {
      const prevCounter = state.counters.find(c => c.id === prevCounterId);
      if (prevCounter && prevCounter.activeTicketId === ticket.id) {
        prevCounter.activeTicketId = null;
        prevCounter.status = 'available';
      }
    }
    if (state.counters && !isReleasing) {
      const targetCounter = state.counters.find(c => c.id === targetDef.id);
      if (targetCounter) {
        targetCounter.activeTicketId = ticket.id;
        targetCounter.status = 'serving';
      }
    }

    this.saveState(state);
    return { success: true, ticket };
  }

  // Update status within current stage (e.g. in_progress, lot_plotted, approved, ready_for_release, released)
  async updateStageStatus(ticketId, stageStatus, officerName = '', remarks = '') {
    try {
      const res = await fetch(`/api/tickets/${ticketId}/stage-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageStatus, officer: officerName, remarks })
      });
      if (res.ok) {
        const resData = await res.json();
        await this.fetchServerState();
        return { success: true, ticket: resData.ticket };
      }
    } catch (e) {}

    // Fallback Local
    const state = this.getRawState() || {};
    const ticket = (state.tickets || []).find(t => t.id === ticketId || t.ticketNumber === String(ticketId));
    if (!ticket) return { success: false, message: 'Ticket not found' };

    const now = Date.now();
    ticket.stageStatus = stageStatus;
    ticket.updatedAt = now;
    if (stageStatus === 'released' || stageStatus === 'completed') {
      ticket.status = 'completed';
      ticket.completedAt = now;
    }
    if (!ticket.stageHistory) ticket.stageHistory = [];
    ticket.stageHistory.push({
      stage: ticket.currentStage || 'review',
      stageName: ticket.currentStageName || 'Document Review',
      status: stageStatus,
      officer: officerName || ticket.officer || 'Assessor Officer',
      timestamp: now,
      remarks: remarks || `Status updated to ${stageStatus}`
    });

    this.saveState(state);
    return { success: true, ticket };
  }

  // Counter calls next ticket
  async callNextTicket(counterId, mode = null) {
    try {
      const res = await fetch(`/api/counters/${counterId}/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
      });
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

    const stationKey = counter.key || (Number(counterId) === 1 ? 'review' : 'tax_mapping');
    let waitingTickets = [];
    if (Number(counterId) === 1) {
      if (mode === 'releasing') {
        waitingTickets = (state.tickets || []).filter(t => t.status === 'waiting' && (t.currentStage === 'releasing' || t.stageStatus === 'ready_for_release'));
      } else if (mode === 'intake') {
        waitingTickets = (state.tickets || []).filter(t => t.status === 'waiting' && (!t.currentStage || t.currentStage === 'review'));
      } else {
        waitingTickets = (state.tickets || []).filter(t => t.status === 'waiting' && (!t.currentStage || t.currentStage === 'review'));
        if (waitingTickets.length === 0) {
          waitingTickets = (state.tickets || []).filter(t => t.status === 'waiting' && (t.currentStage === 'releasing' || t.stageStatus === 'ready_for_release'));
        }
      }
    } else {
      waitingTickets = (state.tickets || []).filter(t => t.status === 'waiting' && (t.currentStage === stationKey || t.counterId === counter.id));
    }

    let nextTicket = null;
    if (counter.servingServices && counter.servingServices.includes('priority')) {
      nextTicket = waitingTickets.find(t => t.isPriority) || waitingTickets[0];
    } else {
      nextTicket = waitingTickets.find(t => t.isPriority) || waitingTickets[0];
    }

    if (!nextTicket) {
      return { success: false, message: 'No waiting taxpayers in the queue.' };
    }

    const isReleasing = nextTicket.currentStage === 'releasing' || nextTicket.stageStatus === 'ready_for_release';
    const now = Date.now();
    nextTicket.status = 'calling';
    nextTicket.counterId = counter.id;
    nextTicket.counterName = isReleasing ? 'Assessment Officer (Releasing)' : counter.name;
    nextTicket.officer = counter.officer;
    nextTicket.calledAt = now;
    nextTicket.updatedAt = now;

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

    const now = Date.now();
    ticket.status = 'calling';
    ticket.calledAt = now;
    ticket.updatedAt = now;
    counter.status = 'calling';
    state.lastCalledTicket = ticket;

    this.saveState(state);
    this.broadcastTicketCall(ticket, counter);
    return { success: true, ticket, counter };
  }

  // Start serving
  async startServingTicket(counterId, ticketId = null) {
    return this.startServing(counterId, ticketId);
  }

  async startServing(counterId, ticketId = null) {
    try {
      const res = await fetch(`/api/counters/${counterId}/serve`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId })
      });
      if (res.ok) {
        const resData = await res.json();
        await this.fetchServerState();
        return { success: true, ticket: resData.ticket, counter: resData.counter };
      }
    } catch (e) {}

    const state = this.getRawState();
    if (!state) return { success: false, message: 'State unavailable' };

    const counter = state.counters.find(c => c.id === Number(counterId));
    if (!counter) return { success: false, message: 'Counter not found.' };

    const targetTicketId = ticketId || counter.activeTicketId;
    let ticket = null;

    if (targetTicketId) {
      ticket = (state.tickets || []).find(t => t.id === targetTicketId || String(t.id) === String(targetTicketId));
    }

    if (!ticket) {
      ticket = (state.tickets || []).find(t => t.status === 'waiting' && (!t.currentStage || t.currentStage === 'review'));
      if (!ticket && Number(counterId) === 1) {
        ticket = (state.tickets || []).find(t => t.status === 'waiting' && (t.currentStage === 'releasing' || t.stageStatus === 'ready_for_release'));
      }
    }

    if (!ticket) return { success: false, message: 'No waiting ticket found to serve.' };

    const now = Date.now();
    const isReleasing = ticket.currentStage === 'releasing' || ticket.stageStatus === 'ready_for_release';
    ticket.status = 'serving';
    ticket.stageStatus = isReleasing ? 'ready_for_release' : 'in_progress';
    ticket.startedAt = now;
    ticket.updatedAt = now;
    ticket.counterId = counter.id;
    ticket.counterName = isReleasing ? 'Assessment Officer (Releasing)' : counter.name;
    ticket.officer = counter.officer;

    counter.status = 'serving';
    counter.activeTicketId = ticket.id;

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
      const now = Date.now();
      const isReleasing = ticket.currentStage === 'releasing' || ticket.stageStatus === 'ready_for_release';
      ticket.status = 'completed';
      ticket.stageStatus = isReleasing ? 'released' : 'completed';
      ticket.completedAt = now;
      ticket.updatedAt = now;
      ticket.serviceSeconds = ticket.startedAt ? Math.floor((now - ticket.startedAt) / 1000) : 0;
      ticket.notes = notes;
      if (!ticket.stageHistory) ticket.stageHistory = [];
      ticket.stageHistory.push({
        stage: ticket.currentStage || 'review',
        stageName: isReleasing ? 'Assessment Officer (Releasing)' : (counter.name || 'Station 1'),
        status: ticket.stageStatus,
        officer: counter.officer || 'Assessment Officer',
        timestamp: now,
        remarks: notes || (isReleasing ? 'Owner Duplicate Tax Declaration officially released to client' : 'Transaction completed')
      });
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
  initAuth() {
    try {
      const stored = localStorage.getItem('queue_pao_auth_user');
      if (stored !== null && stored !== undefined) {
        this.currentUser = JSON.parse(stored);
      } else {
        this.currentUser = DEFAULT_USERS[0]; // Default to Station 1: Maria Santos on initial visit
        localStorage.setItem('queue_pao_auth_user', JSON.stringify(this.currentUser));
      }
    } catch (e) {
      this.currentUser = DEFAULT_USERS[0];
    }
    this.notifyAuthListeners();
  }

  getCurrentUser() {
    if (this.currentUser === undefined) {
      this.initAuth();
    }
    return this.currentUser;
  }

  setCurrentUser(user) {
    this.currentUser = user || null;
    try {
      if (user) {
        localStorage.setItem('queue_pao_auth_user', JSON.stringify(user));
      } else {
        localStorage.setItem('queue_pao_auth_user', 'null');
      }
    } catch (e) {}

    if (this.channel) {
      this.channel.postMessage({ type: 'AUTH_CHANGED', payload: this.currentUser });
    }
    this.notifyAuthListeners();
  }

  getUsers() {
    const raw = this.getRawState();
    if (raw && raw.users && raw.users.length > 0) {
      return raw.users;
    }
    return DEFAULT_USERS;
  }

  async login(username, password = null) {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok && data.success && data.user) {
        this.setCurrentUser(data.user);
        return { success: true, user: data.user, message: data.message };
      } else {
        return { success: false, message: data.message || 'Login failed' };
      }
    } catch (e) {
      // Offline fallback
      const found = DEFAULT_USERS.find(u => u.username.toLowerCase() === String(username).toLowerCase().trim());
      if (found) {
        this.setCurrentUser(found);
        return { success: true, user: found, message: `Welcome, ${found.fullName}` };
      }
      return { success: false, message: 'Invalid credentials or user not found' };
    }
  }

  async logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {}
    this.setCurrentUser(null);
    return { success: true };
  }

  subscribeAuth(listener) {
    this.authListeners.add(listener);
    try { listener(this.currentUser !== undefined ? this.currentUser : this.getCurrentUser()); } catch (e) {}
    return () => this.authListeners.delete(listener);
  }

  notifyAuthListeners() {
    this.authListeners.forEach(cb => {
      try { cb(this.currentUser); } catch (e) { console.error('Auth listener error:', e); }
    });
  }

  canAccessView(viewName) {
    const user = this.getCurrentUser();
    if (!user || user.role === 'admin') return true;

    // Station 1 has Console + Kiosk
    if (Number(user.stationId) === 1) {
      return viewName === 'console' || viewName === 'kiosk';
    }

    // Stations 2-6 are strictly restricted to Staff Console
    if (Number(user.stationId) >= 2 && Number(user.stationId) <= 6) {
      return viewName === 'console';
    }

    return viewName === 'console';
  }

  canAccessStation(stationId) {
    const user = this.getCurrentUser();
    if (!user || user.role === 'admin') return true;
    return Number(user.stationId) === Number(stationId);
  }

  canIssueTicket() {
    const user = this.getCurrentUser();
    if (!user || user.role === 'admin') return true;
    return Number(user.stationId) === 1;
  }

  canSwitchPost() {
    const user = this.getCurrentUser();
    if (!user || user.role === 'admin') return true;
    return Number(user.stationId) === 1;
  }

  canAccessTV() {
    const user = this.getCurrentUser();
    if (!user || user.role === 'admin') return true;
    return false;
  }
}

export const queueState = new QueueStateManager();
