"""
Provincial Assessor's Office - Queue Management Database Module (High Performance Edition)
Thread-safe SQLite Database layer with Real-Time Counter Decision Logging, Action Handlers, Service Duration calculations, Requirements Checklist, and ultra-fast indexing and data insertion.
Configuration:
- Counter 1: All Assessment Services
- Counter 2: Priority Courtesy Lane & All Services
- Counter 3: All Assessment Services
13 Official Provincial Assessor Services.
"""

import sqlite3
import os
import time
import json
import threading
from datetime import datetime

DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'queue.db')
db_lock = threading.RLock()

ALL_SERVICE_IDS = [
    'transfer',
    'subdivision_consolidation',
    'reclassification_agri_urban',
    'reclassification_urban_urban',
    'reassessment_dp_pc_dt',
    'discovery_new_declaration',
    'certification_ctc_cpc',
    'verification_backtracking',
    'annotation_cancellation',
    'ocular_inspection',
    'cancellation_td',
    'tmcr_section_maps',
    'posting'
]

DEFAULT_COUNTERS = [
    {
        'id': 1,
        'name': 'Counter 1',
        'label': 'All Assessment Services',
        'officer': 'Maria Santos (Assessment Officer)',
        'status': 'available',
        'active_ticket_id': None,
        'serving_services': ALL_SERVICE_IDS
    },
    {
        'id': 2,
        'name': 'Counter 2',
        'label': 'Priority Lane & All Services',
        'officer': 'Engr. Roberto Dela Cruz (Assessment Officer)',
        'status': 'available',
        'active_ticket_id': None,
        'serving_services': ALL_SERVICE_IDS
    },
    {
        'id': 3,
        'name': 'Counter 3',
        'label': 'All Assessment Services',
        'officer': 'Arch. Elena Gomez (Assessment Officer)',
        'status': 'available',
        'active_ticket_id': None,
        'serving_services': ALL_SERVICE_IDS
    }
]

SERVICES = [
    {
        'id': 'transfer',
        'code': 'TRF',
        'name': 'Transfer',
        'description': 'Processing transfer of ownership for real property tax declarations.',
        'requirements': ['Deed of Sale / Extrajudicial Settlement', 'BIR eCAR', 'Transfer Tax Receipt', 'Updated RPT Clearance', 'Certified Copy of Title'],
        'est_time_min': 15,
        'assigned_counter_id': None,
        'assigned_counter_name': 'Counters 1, 2 & 3 (All Services)'
    },
    {
        'id': 'subdivision_consolidation',
        'code': 'SUB',
        'name': 'Subdivision/Consolidation',
        'description': 'Processing segregation, lot subdivision, or consolidation of tax declarations.',
        'requirements': ['Approved Lot Plan (LRA/DENR)', 'Subdivision Agreement / Deed', 'Technical Descriptions', 'Tax Clearance'],
        'est_time_min': 15,
        'assigned_counter_id': None,
        'assigned_counter_name': 'Counters 1, 2 & 3 (All Services)'
    },
    {
        'id': 'reclassification_agri_urban',
        'code': 'RC-AGR',
        'name': 'Reclassification (Agri to Urban)',
        'description': 'Reclassification of agricultural land to residential, commercial, or industrial.',
        'requirements': ['SP/SB Ordinance', 'DAR Conversion / Exemption Order', 'Zoning Certification', 'Site Inspection Photos'],
        'est_time_min': 12,
        'assigned_counter_id': None,
        'assigned_counter_name': 'Counters 1, 2 & 3 (All Services)'
    },
    {
        'id': 'reclassification_urban_urban',
        'code': 'RC-URB',
        'name': 'Reclassification (Urban to Urban)',
        'description': 'Reclassification of residential land to commercial/industrial or vice-versa.',
        'requirements': ['Zoning / Locational Clearance', 'Business Permit / SEC Registration', 'Site Inspection Report', 'Tax Clearance'],
        'est_time_min': 10,
        'assigned_counter_id': None,
        'assigned_counter_name': 'Counters 1, 2 & 3 (All Services)'
    },
    {
        'id': 'reassessment_dp_pc_dt',
        'code': 'REA',
        'name': 'Reassessment (DP/PC/DT)',
        'description': 'Reassessment due to Depreciation, Partial Casualty, or Demolition/Total Casualty.',
        'requirements': ['Letter Request for Reassessment', 'Building Plan / Cost Breakdown', 'Proof of Decay / Demolition Photos', 'BFP Fire Report (for casualties)'],
        'est_time_min': 15,
        'assigned_counter_id': None,
        'assigned_counter_name': 'Counters 1, 2 & 3 (All Services)'
    },
    {
        'id': 'discovery_new_declaration',
        'code': 'DISC',
        'name': 'Discovery / New Declaration',
        'description': 'Declaration of newly discovered land, newly constructed buildings, or machinery.',
        'requirements': ['Building Permit / Occupancy Certificate', 'Approved Plan / Cadastral Survey', 'Sworn Statement of True Value', 'Tax Clearance'],
        'est_time_min': 15,
        'assigned_counter_id': None,
        'assigned_counter_name': 'Counters 1, 2 & 3 (All Services)'
    },
    {
        'id': 'certification_ctc_cpc',
        'code': 'CTC',
        'name': 'Certification/CTC/CPC',
        'description': 'Issuance of Certified True Copies (CTC), Certified Photocopy (CPC), and Certifications.',
        'requirements': ['Valid Government ID', 'Latest RPT Official Receipt (OR)', 'Authorization Letter / SPA (if representative)'],
        'est_time_min': 5,
        'assigned_counter_id': None,
        'assigned_counter_name': 'Counters 1, 2 & 3 (All Services)'
    },
    {
        'id': 'verification_backtracking',
        'code': 'VER',
        'name': 'Verification/Back Tracking',
        'description': 'Historical assessment records verification and trace-back of property declarations.',
        'requirements': ['Valid Government ID', 'Property Reference / Tax Dec #', 'Written Request / Letter of Intent'],
        'est_time_min': 10,
        'assigned_counter_id': None,
        'assigned_counter_name': 'Counters 1, 2 & 3 (All Services)'
    },
    {
        'id': 'annotation_cancellation',
        'code': 'ANN',
        'name': 'Annotation / Cancellation',
        'description': 'Annotation or cancellation of Mortgage, Bail Bond, Encumbrance, or Adverse Claim.',
        'requirements': ['Release of Mortgage / Order of Cancellation', 'Valid Government ID', 'Latest RPT Clearance', 'Official Receipt'],
        'est_time_min': 8,
        'assigned_counter_id': None,
        'assigned_counter_name': 'Counters 1, 2 & 3 (All Services)'
    },
    {
        'id': 'ocular_inspection',
        'code': 'OCU',
        'name': 'Ocular Inspection Request',
        'description': 'Scheduling on-site field ocular inspection for appraisal and boundary determination.',
        'requirements': ['Inspection Request Form', 'Vicinity Map / Lot Sketch', 'Contact Details & Tax Clearance'],
        'est_time_min': 10,
        'assigned_counter_id': None,
        'assigned_counter_name': 'Counters 1, 2 & 3 (All Services)'
    },
    {
        'id': 'cancellation_td',
        'code': 'CAN',
        'name': 'Cancellation of TD',
        'description': 'Cancellation of duplicate, erroneously issued, or superseded Tax Declarations.',
        'requirements': ['Request for Cancellation Form', 'Original Owner\'s Copy of TD', 'Court / Administrative Order (if applicable)', 'Tax Clearance'],
        'est_time_min': 10,
        'assigned_counter_id': None,
        'assigned_counter_name': 'Counters 1, 2 & 3 (All Services)'
    },
    {
        'id': 'tmcr_section_maps',
        'code': 'TMCR',
        'name': 'TMCR / Section Maps',
        'description': 'Tax Mapping Control Roll (TMCR) verification, Section Maps, and PIN assignment.',
        'requirements': ['Cadastral Lot Number / Survey Plan', 'Valid Government ID', 'Barangay Location Reference'],
        'est_time_min': 8,
        'assigned_counter_id': None,
        'assigned_counter_name': 'Counters 1, 2 & 3 (All Services)'
    },
    {
        'id': 'posting',
        'code': 'PST',
        'name': 'Posting',
        'description': 'Final posting of assessment transaction and release of owner copy tax declaration.',
        'requirements': ['Approved Assessment Transaction Folder', 'Appraiser & Assessor Signatures', 'Official Receipt (OR)'],
        'est_time_min': 5,
        'assigned_counter_id': None,
        'assigned_counter_name': 'Counters 1, 2 & 3 (All Services)'
    }
]

SERVICES_BY_ID = {s['id']: s for s in SERVICES}


def get_service_by_id(service_id):
    return SERVICES_BY_ID.get(service_id, {
        'id': service_id,
        'code': 'GEN',
        'name': 'General Assessment Service',
        'description': 'Assessment processing service.',
        'requirements': ['Valid Government ID', 'Tax Declaration / Title Reference', 'Official Receipt (OR)'],
        'est_time_min': 10,
        'assigned_counter_id': None,
        'assigned_counter_name': 'Counters 1–3'
    })


def get_preferred_counter_for_ticket(service_id, is_priority=False):
    if is_priority:
        return 2, 'Counter 2', 'Engr. Roberto Dela Cruz (Assessment Officer)'
    return None, 'Counters 1–3', 'Assessor Staff'


def get_db():
    conn = sqlite3.connect(DB_FILE, timeout=15.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode = WAL')
    conn.execute('PRAGMA synchronous = NORMAL')
    conn.execute('PRAGMA cache_size = -64000')
    conn.execute('PRAGMA temp_store = MEMORY')
    conn.execute('PRAGMA busy_timeout = 10000')
    return conn


def init_db():
    with db_lock:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute('''
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )''')

        cursor.execute('''
        CREATE TABLE IF NOT EXISTS counters (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            label TEXT NOT NULL,
            officer TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'available',
            active_ticket_id TEXT,
            serving_services TEXT
        )''')

        cursor.execute('''
        CREATE TABLE IF NOT EXISTS tickets (
            id TEXT PRIMARY KEY,
            ticket_number TEXT NOT NULL,
            service_id TEXT NOT NULL,
            service_name TEXT NOT NULL,
            service_code TEXT NOT NULL,
            is_priority INTEGER NOT NULL DEFAULT 0,
            priority_type TEXT NOT NULL DEFAULT 'regular',
            status TEXT NOT NULL DEFAULT 'waiting',
            counter_id INTEGER,
            counter_name TEXT,
            officer TEXT,
            created_at INTEGER NOT NULL,
            called_at INTEGER,
            started_at INTEGER,
            completed_at INTEGER,
            wait_seconds INTEGER DEFAULT 0,
            service_seconds INTEGER DEFAULT 0,
            notes TEXT DEFAULT '',
            requirements_checklist TEXT DEFAULT '{}'
        )''')

        try:
            cursor.execute("ALTER TABLE tickets ADD COLUMN requirements_checklist TEXT DEFAULT '{}'")
        except Exception:
            pass

        cursor.execute('''
        CREATE TABLE IF NOT EXISTS decisions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id TEXT NOT NULL,
            ticket_number TEXT NOT NULL,
            service_name TEXT NOT NULL,
            is_priority INTEGER NOT NULL DEFAULT 0,
            priority_type TEXT NOT NULL DEFAULT 'regular',
            counter_id INTEGER NOT NULL,
            counter_name TEXT NOT NULL,
            officer TEXT NOT NULL,
            decision_type TEXT NOT NULL,
            decision_label TEXT NOT NULL,
            service_seconds INTEGER DEFAULT 0,
            wait_seconds INTEGER DEFAULT 0,
            notes TEXT DEFAULT '',
            timestamp INTEGER NOT NULL
        )''')

        # High Performance Indexes
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status, is_priority, created_at)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_tickets_counter ON tickets(counter_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_tickets_called_at ON tickets(called_at DESC)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_decisions_timestamp ON decisions(timestamp DESC)')

        default_settings = {
            'next_ticket_number': '1',
            'youtube_video_id': 'LXb3EKWsInQ'
        }
        for k, v in default_settings.items():
            cursor.execute('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', (k, v))

        cursor.execute('SELECT COUNT(*) FROM counters')
        if cursor.fetchone()[0] == 0:
            for c in DEFAULT_COUNTERS:
                cursor.execute('''
                INSERT INTO counters (id, name, label, officer, status, active_ticket_id, serving_services)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ''', (
                    c['id'],
                    c['name'],
                    c['label'],
                    c['officer'],
                    c['status'],
                    c['active_ticket_id'],
                    json.dumps(c['serving_services'])
                ))

        cursor.execute('SELECT COUNT(*) FROM tickets')
        if cursor.fetchone()[0] == 0:
            seed_demo_data(cursor)

        conn.commit()
        conn.close()


def seed_demo_data(cursor=None):
    should_close = False
    if cursor is None:
        conn = get_db()
        cursor = conn.cursor()
        should_close = True

    cursor.execute('DELETE FROM tickets')
    cursor.execute('DELETE FROM decisions')
    cursor.execute('DELETE FROM counters')
    cursor.execute('UPDATE settings SET value = "7" WHERE key = "next_ticket_number"')

    for c in DEFAULT_COUNTERS:
        cursor.execute('''
        INSERT INTO counters (id, name, label, officer, status, active_ticket_id, serving_services)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (
            c['id'],
            c['name'],
            c['label'],
            c['officer'],
            'serving' if c['id'] in [1, 2] else 'calling',
            f'T-00{c["id"]}',
            json.dumps(c['serving_services'])
        ))

    now_ms = int(time.time() * 1000)

    sample_tickets = [
        ('T-001', '1', 'certification_ctc_cpc', 'Certification/CTC/CPC', 'CTC', 0, 'regular', 'serving', 1, 'Counter 1', 'Maria Santos (Assessment Officer)', now_ms - 14 * 60000, now_ms - 3 * 60000, now_ms - 3 * 60000, None, 660, 0, '', json.dumps({'Valid Government ID': True, 'Latest RPT Official Receipt (OR)': True, 'Authorization Letter / SPA (if representative)': False})),
        ('T-002', '2', 'transfer', 'Transfer', 'TRF', 1, 'senior', 'serving', 2, 'Counter 2', 'Engr. Roberto Dela Cruz (Assessment Officer)', now_ms - 18 * 60000, now_ms - 3 * 60000, now_ms - 2 * 60000, None, 900, 0, '', json.dumps({'Deed of Sale / Extrajudicial Settlement': True, 'BIR eCAR': True, 'Transfer Tax Receipt': True, 'Updated RPT Clearance': False, 'Certified Copy of Title': True})),
        ('T-003', '3', 'reassessment_dp_pc_dt', 'Reassessment (DP/PC/DT)', 'REA', 0, 'regular', 'calling', 3, 'Counter 3', 'Arch. Elena Gomez (Assessment Officer)', now_ms - 10 * 60000, now_ms - 1 * 60000, None, None, 540, 0, '', json.dumps({'Letter Request for Reassessment': True, 'Building Plan / Cost Breakdown': False, 'Proof of Decay / Demolition Photos': False})),
        ('T-004', '4', 'subdivision_consolidation', 'Subdivision/Consolidation', 'SUB', 0, 'regular', 'waiting', None, None, None, now_ms - 8 * 60000, None, None, None, 0, 0, '', '{}'),
        ('T-005', '5', 'verification_backtracking', 'Verification/Back Tracking', 'VER', 0, 'regular', 'waiting', None, None, None, now_ms - 5 * 60000, None, None, None, 0, 0, '', '{}'),
        ('T-006', '6', 'posting', 'Posting', 'PST', 1, 'pwd', 'waiting', None, None, None, now_ms - 3 * 60000, None, None, None, 0, 0, '', '{}')
    ]

    for t in sample_tickets:
        cursor.execute('''
        INSERT INTO tickets (id, ticket_number, service_id, service_name, service_code, is_priority, priority_type, status, counter_id, counter_name, officer, created_at, called_at, started_at, completed_at, wait_seconds, service_seconds, notes, requirements_checklist)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', t)

    sample_decisions = [
        ('T-001', '1', 'Certification/CTC/CPC', 0, 'regular', 1, 'Counter 1', 'Maria Santos (Assessment Officer)', 'serving', 'IN-SERVICE', 0, 660, 'Requirements: 2/3 verified', now_ms - 3 * 60000),
        ('T-002', '2', 'Transfer', 1, 'senior', 2, 'Counter 2', 'Engr. Roberto Dela Cruz (Assessment Officer)', 'serving', 'IN-SERVICE', 0, 900, 'Requirements: 4/5 verified', now_ms - 2 * 60000),
        ('T-003', '3', 'Reassessment (DP/PC/DT)', 0, 'regular', 3, 'Counter 3', 'Arch. Elena Gomez (Assessment Officer)', 'called', 'CALLED', 0, 540, 'Summoned to Window 3', now_ms - 1 * 60000)
    ]

    for d in sample_decisions:
        cursor.execute('''
        INSERT INTO decisions (ticket_id, ticket_number, service_name, is_priority, priority_type, counter_id, counter_name, officer, decision_type, decision_label, service_seconds, wait_seconds, notes, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', d)

    if should_close:
        conn.commit()
        conn.close()


def log_decision(ticket, counter, decision_type, decision_label, service_seconds=0, wait_seconds=0, notes=''):
    with db_lock:
        conn = get_db()
        cursor = conn.cursor()
        now_ms = int(time.time() * 1000)

        t_id = ticket['id'] if isinstance(ticket, dict) else ticket['id']
        t_num = ticket['ticketNumber'] if 'ticketNumber' in ticket else ticket['ticket_number']
        s_name = ticket['serviceName'] if 'serviceName' in ticket else ticket['service_name']
        is_pri = 1 if (ticket.get('isPriority') or ticket.get('is_priority')) else 0
        pri_type = ticket.get('priorityType') or ticket.get('priority_type') or 'regular'

        c_id = counter['id'] if isinstance(counter, dict) else counter['id']
        c_name = counter['name'] if isinstance(counter, dict) else counter['name']
        c_officer = counter['officer'] if isinstance(counter, dict) else counter['officer']

        cursor.execute('''
        INSERT INTO decisions (ticket_id, ticket_number, service_name, is_priority, priority_type, counter_id, counter_name, officer, decision_type, decision_label, service_seconds, wait_seconds, notes, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (t_id, str(t_num), s_name, is_pri, pri_type, c_id, c_name, c_officer, decision_type, decision_label, service_seconds, wait_seconds, notes, now_ms))

        conn.commit()
        conn.close()


def get_queue_state():
    with db_lock:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute('SELECT key, value FROM settings')
        settings = dict(cursor.fetchall())

        cursor.execute('SELECT * FROM counters ORDER BY id ASC')
        counters_raw = cursor.fetchall()
        counters = []
        for row in counters_raw:
            counters.append({
                'id': row['id'],
                'name': row['name'],
                'label': row['label'],
                'officer': row['officer'],
                'status': row['status'],
                'activeTicketId': row['active_ticket_id'],
                'servingServices': json.loads(row['serving_services']) if row['serving_services'] else ALL_SERVICE_IDS
            })

        cursor.execute('SELECT * FROM tickets ORDER BY created_at ASC')
        tickets_raw = cursor.fetchall()
        tickets = []
        last_called_ticket = None
        latest_called_time = -1

        for row in tickets_raw:
            svc_info = get_service_by_id(row['service_id'])
            reqs = svc_info.get('requirements', [])
            
            checklist_dict = {}
            if 'requirements_checklist' in row.keys() and row['requirements_checklist']:
                try:
                    checklist_dict = json.loads(row['requirements_checklist'])
                except Exception:
                    checklist_dict = {}

            t_obj = {
                'id': row['id'],
                'ticketNumber': row['ticket_number'],
                'serviceId': row['service_id'],
                'serviceName': row['service_name'],
                'serviceCode': row['service_code'],
                'requirements': reqs,
                'requirementsChecklist': checklist_dict,
                'isPriority': bool(row['is_priority']),
                'priorityType': row['priority_type'],
                'status': row['status'],
                'counterId': row['counter_id'],
                'counterName': row['counter_name'],
                'officer': row['officer'],
                'createdAt': row['created_at'],
                'calledAt': row['called_at'],
                'startedAt': row['started_at'],
                'completedAt': row['completed_at'],
                'waitSeconds': row['wait_seconds'] or 0,
                'serviceSeconds': row['service_seconds'] or 0,
                'notes': row['notes'] or ''
            }
            tickets.append(t_obj)

            if row['called_at'] and row['called_at'] > latest_called_time:
                latest_called_time = row['called_at']
                last_called_ticket = t_obj

        # Single-pass metrics computation
        total_served = sum(1 for t in tickets if t['status'] == 'completed')
        total_waiting = sum(1 for t in tickets if t['status'] == 'waiting')
        total_noshow = sum(1 for t in tickets if t['status'] == 'noshow')
        waits = [t['waitSeconds'] for t in tickets if t['waitSeconds'] > 0]
        services = [t['serviceSeconds'] for t in tickets if t['serviceSeconds'] > 0]
        avg_wait = round(sum(waits) / len(waits)) if waits else 0
        avg_service = round(sum(services) / len(services)) if services else 0

        cursor.execute('SELECT * FROM decisions ORDER BY timestamp DESC LIMIT 6')
        decisions_raw = cursor.fetchall()
        recent_decisions = []
        for row in decisions_raw:
            recent_decisions.append({
                'id': row['id'],
                'ticketId': row['ticket_id'],
                'ticketNumber': row['ticket_number'],
                'serviceName': row['service_name'],
                'isPriority': bool(row['is_priority']),
                'priorityType': row['priority_type'],
                'counterId': row['counter_id'],
                'counterName': row['counter_name'],
                'officer': row['officer'],
                'decisionType': row['decision_type'],
                'decisionLabel': row['decision_label'],
                'serviceSeconds': row['service_seconds'] or 0,
                'waitSeconds': row['wait_seconds'] or 0,
                'notes': row['notes'] or '',
                'timestamp': row['timestamp']
            })

        conn.close()

        return {
            'counters': counters,
            'tickets': tickets,
            'recentDecisions': recent_decisions,
            'lastCalledTicket': last_called_ticket,
            'services': SERVICES,
            'nextTicketNumber': int(settings.get('next_ticket_number', 1)),
            'stats': {
                'totalIssued': len(tickets),
                'totalServed': total_served,
                'totalWaiting': total_waiting,
                'totalNoShow': total_noshow,
                'avgWaitSeconds': avg_wait,
                'avgServiceSeconds': avg_service
            },
            'youtubeVideoId': settings.get('youtube_video_id', 'LXb3EKWsInQ')
        }


def update_ticket_checklist(ticket_id, checklist_dict, notes=None):
    with db_lock:
        conn = get_db()
        cursor = conn.cursor()
        
        checklist_json = json.dumps(checklist_dict) if isinstance(checklist_dict, dict) else str(checklist_dict)
        if notes is not None:
            cursor.execute('UPDATE tickets SET requirements_checklist = ?, notes = ? WHERE id = ?', (checklist_json, notes, ticket_id))
        else:
            cursor.execute('UPDATE tickets SET requirements_checklist = ? WHERE id = ?', (checklist_json, ticket_id))
        
        conn.commit()
        conn.close()
        return True


def create_ticket(data):
    """Ultra-fast ticket creation with direct in-memory dictionary construction"""
    service_id = data.get('serviceId') or data.get('service_id') or 'certification_ctc_cpc'
    is_priority = bool(data.get('isPriority') or data.get('is_priority'))
    priority_type = data.get('priorityType') or data.get('priority_type') or ('senior' if is_priority else 'regular')

    with db_lock:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute('SELECT value FROM settings WHERE key = "next_ticket_number"')
        num_row = cursor.fetchone()
        next_num = int(num_row['value']) if num_row else 1

        cursor.execute('UPDATE settings SET value = ? WHERE key = "next_ticket_number"', (str(next_num + 1),))

        service = get_service_by_id(service_id)
        now_ms = int(time.time() * 1000)
        ticket_id = f'T-{str(next_num).zfill(3)}'

        cursor.execute('''
        INSERT INTO tickets (id, ticket_number, service_id, service_name, service_code, is_priority, priority_type, status, created_at, requirements_checklist)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'waiting', ?, '{}')
        ''', (
            ticket_id,
            str(next_num),
            service['id'],
            service['name'],
            service['code'],
            1 if is_priority else 0,
            priority_type if is_priority else 'regular',
            now_ms
        ))

        conn.commit()
        conn.close()

        # Build in-memory ticket instantly (< 0.1ms) without slow queries
        return {
            'id': ticket_id,
            'ticketNumber': str(next_num),
            'serviceId': service['id'],
            'serviceName': service['name'],
            'serviceCode': service['code'],
            'requirements': service.get('requirements', []),
            'requirementsChecklist': {},
            'isPriority': is_priority,
            'priorityType': priority_type if is_priority else 'regular',
            'status': 'waiting',
            'counterId': None,
            'counterName': None,
            'officer': None,
            'createdAt': now_ms,
            'calledAt': None,
            'startedAt': None,
            'completedAt': None,
            'waitSeconds': 0,
            'serviceSeconds': 0,
            'notes': ''
        }


def call_next_ticket(counter_id):
    with db_lock:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute('SELECT * FROM counters WHERE id = ?', (counter_id,))
        counter = cursor.fetchone()
        if not counter:
            conn.close()
            return None, 'Counter not found'

        cursor.execute("SELECT * FROM tickets WHERE status = 'waiting' ORDER BY is_priority DESC, created_at ASC LIMIT 1")
        candidate = cursor.fetchone()

        if not candidate:
            conn.close()
            return None, 'No waiting tickets in queue'

        now_ms = int(time.time() * 1000)
        ticket_id = candidate['id']
        wait_secs = max(0, int((now_ms - candidate['created_at']) / 1000))

        cursor.execute('''
        UPDATE tickets 
        SET status = 'calling', counter_id = ?, counter_name = ?, officer = ?, called_at = ?, wait_seconds = ?
        WHERE id = ?
        ''', (counter['id'], counter['name'], counter['officer'], now_ms, wait_secs, ticket_id))

        cursor.execute('''
        UPDATE counters
        SET status = 'calling', active_ticket_id = ?
        WHERE id = ?
        ''', (ticket_id, counter_id))

        conn.commit()
        conn.close()

        state = get_queue_state()
        called_ticket = next((t for t in state['tickets'] if t['id'] == ticket_id), None)
        updated_counter = next((c for c in state['counters'] if c['id'] == counter_id), None)

        log_decision(called_ticket, updated_counter, 'called', 'CALLED', 0, wait_secs, 'Summoned to Counter')

        return {'ticket': called_ticket, 'counter': updated_counter}, None


def recall_ticket(counter_id):
    with db_lock:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute('SELECT * FROM counters WHERE id = ?', (counter_id,))
        counter = cursor.fetchone()
        if not counter or not counter['active_ticket_id']:
            conn.close()
            return None, 'No active ticket on this counter'

        ticket_id = counter['active_ticket_id']
        now_ms = int(time.time() * 1000)

        cursor.execute('UPDATE tickets SET called_at = ? WHERE id = ?', (now_ms, ticket_id))
        conn.commit()
        conn.close()

        state = get_queue_state()
        recalled_ticket = next((t for t in state['tickets'] if t['id'] == ticket_id), None)
        updated_counter = next((c for c in state['counters'] if c['id'] == counter_id), None)

        log_decision(recalled_ticket, updated_counter, 'recall', 'RECALL', 0, recalled_ticket['waitSeconds'], 'Re-announced with vocal chime')

        return {'ticket': recalled_ticket, 'counter': updated_counter}, None


def start_serving_ticket(counter_id):
    with db_lock:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute('SELECT * FROM counters WHERE id = ?', (counter_id,))
        counter = cursor.fetchone()
        if not counter:
            conn.close()
            return None, 'Counter not found'

        ticket_id = counter['active_ticket_id']
        now_ms = int(time.time() * 1000)

        if not ticket_id:
            cursor.execute("SELECT * FROM tickets WHERE status = 'waiting' ORDER BY is_priority DESC, created_at ASC LIMIT 1")
            candidate = cursor.fetchone()
            if not candidate:
                conn.close()
                return None, 'No waiting tickets to serve'

            ticket_id = candidate['id']
            wait_secs = max(0, int((now_ms - candidate['created_at']) / 1000))

            cursor.execute('''
            UPDATE tickets 
            SET status = 'serving', counter_id = ?, counter_name = ?, officer = ?, called_at = ?, started_at = ?, wait_seconds = ?
            WHERE id = ?
            ''', (counter['id'], counter['name'], counter['officer'], now_ms, now_ms, wait_secs, ticket_id))

            cursor.execute('''
            UPDATE counters
            SET status = 'serving', active_ticket_id = ?
            WHERE id = ?
            ''', (ticket_id, counter_id))

        else:
            cursor.execute('SELECT * FROM tickets WHERE id = ?', (ticket_id,))
            ticket = cursor.fetchone()
            started_at = ticket['started_at'] or now_ms

            cursor.execute('''
            UPDATE tickets 
            SET status = 'serving', started_at = ?
            WHERE id = ?
            ''', (started_at, ticket_id))

            cursor.execute('''
            UPDATE counters
            SET status = 'serving'
            WHERE id = ?
            ''', (counter_id,))

        conn.commit()
        conn.close()

        state = get_queue_state()
        serving_ticket = next((t for t in state['tickets'] if t['id'] == ticket_id), None)
        updated_counter = next((c for c in state['counters'] if c['id'] == counter_id), None)

        log_decision(serving_ticket, updated_counter, 'serving', 'IN-SERVICE', 0, serving_ticket['waitSeconds'], 'In Service at Counter')

        return {'ticket': serving_ticket, 'counter': updated_counter}, None


def complete_ticket(counter_id, notes=''):
    with db_lock:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute('SELECT * FROM counters WHERE id = ?', (counter_id,))
        counter = cursor.fetchone()
        if not counter or not counter['active_ticket_id']:
            conn.close()
            return None, 'No active ticket to complete'

        ticket_id = counter['active_ticket_id']
        now_ms = int(time.time() * 1000)

        cursor.execute('SELECT * FROM tickets WHERE id = ?', (ticket_id,))
        ticket = cursor.fetchone()
        
        start_ms = ticket['started_at'] or ticket['called_at'] or ticket['created_at']
        service_secs = max(1, int((now_ms - start_ms) / 1000))
        final_notes = notes or ticket['notes'] or ''

        cursor.execute('''
        UPDATE tickets 
        SET status = 'completed', completed_at = ?, service_seconds = ?, notes = ?
        WHERE id = ?
        ''', (now_ms, service_secs, final_notes, ticket_id))

        cursor.execute('''
        UPDATE counters
        SET status = 'available', active_ticket_id = NULL
        WHERE id = ?
        ''', (counter_id,))

        conn.commit()
        conn.close()

        state = get_queue_state()
        completed_ticket = next((t for t in state['tickets'] if t['id'] == ticket_id), None)
        updated_counter = next((c for c in state['counters'] if c['id'] == counter_id), None)

        log_decision(completed_ticket, updated_counter, 'completed', 'COMPLETED', service_secs, completed_ticket['waitSeconds'], final_notes or 'Transaction finalized')

        return {'ticket': completed_ticket, 'counter': updated_counter}, None


def no_show_ticket(counter_id):
    with db_lock:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute('SELECT * FROM counters WHERE id = ?', (counter_id,))
        counter = cursor.fetchone()
        if not counter or not counter['active_ticket_id']:
            conn.close()
            return None, 'No active ticket to mark as no-show'

        ticket_id = counter['active_ticket_id']
        now_ms = int(time.time() * 1000)

        cursor.execute('''
        UPDATE tickets 
        SET status = 'noshow', completed_at = ?, notes = 'Client did not show up'
        WHERE id = ?
        ''', (now_ms, ticket_id))

        cursor.execute('''
        UPDATE counters
        SET status = 'available', active_ticket_id = NULL
        WHERE id = ?
        ''', (counter_id,))

        conn.commit()
        conn.close()

        state = get_queue_state()
        noshow_ticket = next((t for t in state['tickets'] if t['id'] == ticket_id), None)
        updated_counter = next((c for c in state['counters'] if c['id'] == counter_id), None)

        log_decision(noshow_ticket, updated_counter, 'noshow', 'NO-SHOW', 0, noshow_ticket['waitSeconds'], 'Taxpayer did not respond to summon')

        return {'ticket': noshow_ticket, 'counter': updated_counter}, None


def transfer_ticket(counter_id_or_ticket_id, target_service_id):
    with db_lock:
        conn = get_db()
        cursor = conn.cursor()

        # Try finding by counter_id first
        cursor.execute('SELECT * FROM counters WHERE id = ?', (counter_id_or_ticket_id,))
        counter = cursor.fetchone()
        
        ticket_id = None
        cid = None
        
        if counter and counter['active_ticket_id']:
            ticket_id = counter['active_ticket_id']
            cid = counter['id']
        else:
            # Check by ticket_id or ticket_number
            cursor.execute('SELECT * FROM tickets WHERE id = ? OR ticket_number = ?', (str(counter_id_or_ticket_id), str(counter_id_or_ticket_id)))
            t_row = cursor.fetchone()
            if t_row:
                ticket_id = t_row['id']
                cid = t_row['counter_id'] or 1
            else:
                conn.close()
                return None, 'No active ticket to transfer'

        target_service = get_service_by_id(target_service_id)

        cursor.execute('''
        UPDATE tickets 
        SET service_id = ?, service_name = ?, service_code = ?, status = 'waiting',
            counter_id = NULL, counter_name = NULL, officer = NULL, called_at = NULL, started_at = NULL,
            notes = notes || ' [Transferred to ' || ? || ']'
        WHERE id = ?
        ''', (target_service['id'], target_service['name'], target_service['code'], target_service['name'], ticket_id))

        if cid:
            cursor.execute('''
            UPDATE counters
            SET status = 'available', active_ticket_id = NULL
            WHERE id = ?
            ''', (cid,))

        conn.commit()
        conn.close()

        state = get_queue_state()
        transferred_ticket = next((t for t in state['tickets'] if t['id'] == ticket_id), None)
        updated_counter = next((c for c in state['counters'] if c['id'] == cid), (state['counters'][0] if state['counters'] else None))

        if transferred_ticket:
            log_decision(transferred_ticket, updated_counter or {'id': 1, 'name': 'Counter 1', 'officer': 'Assessor Staff'}, 'transferred', 'TRANSFERRED', 0, 0, f'Transferred to {target_service["name"]}')

        return {'ticket': transferred_ticket, 'counter': updated_counter}, None


def update_counter_status(counter_id, status=None, officer=None):
    with db_lock:
        conn = get_db()
        cursor = conn.cursor()

        if status and officer:
            cursor.execute('UPDATE counters SET status = ?, officer = ? WHERE id = ?', (status, officer, counter_id))
        elif status:
            cursor.execute('UPDATE counters SET status = ? WHERE id = ?', (status, counter_id))
        elif officer:
            cursor.execute('UPDATE counters SET officer = ? WHERE id = ?', (officer, counter_id))

        conn.commit()
        conn.close()
        return get_queue_state()


def update_settings(key, value):
    with db_lock:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', (key, str(value)))
        conn.commit()
        conn.close()
        return True


def reset_queue():
    with db_lock:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute('DELETE FROM tickets')
        cursor.execute('DELETE FROM decisions')
        cursor.execute('UPDATE settings SET value = "1" WHERE key = "next_ticket_number"')

        for c in DEFAULT_COUNTERS:
            cursor.execute('''
            UPDATE counters 
            SET status = 'available', active_ticket_id = NULL
            WHERE id = ?
            ''', (c['id'],))

        conn.commit()
        conn.close()
        return get_queue_state()
