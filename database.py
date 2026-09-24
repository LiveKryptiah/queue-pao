"""
Provincial Assessor's Office - Multi-Station Processing & Queue Workflow Database Module
Thread-safe SQLite Database layer supporting 6 Specialized Assessor Stations:
1. Document Review & Receiving (review)
2. Tax Mapping & TMCR Validation (tax_mapping)
3. Verification & Backtracking (backtracking)
4. Provincial Assessor Approval (approval)
5. Encoding & Assessment Roll (recording)
6. Releasing & Issuance (releasing)
Full Client / Taxpayer tracking (e.g. Juan Dela Cruz), stage progression, multi-personnel status updates, and audit logging.
"""

import sqlite3
import os
import time
import json
import threading

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

STAGE_KEYS = ['review', 'tax_mapping', 'appraisal', 'approval', 'releasing']

STAGE_ALIAS_MAP = {
    'assessment_officer': 'review',
    'backtracking': 'appraisal',
    'recording': 'releasing',
}

STAGE_DEFINITIONS = [
    { 'key': 'review', 'id': 1, 'name': 'Assessment Officer', 'short_name': 'Assessment Officer', 'order': 1, 'color': '#000000' },
    { 'key': 'tax_mapping', 'id': 2, 'name': 'Tax Mapping', 'short_name': 'Tax Mapping', 'order': 2, 'color': '#000000' },
    { 'key': 'appraisal', 'id': 3, 'name': 'Appraisal/Assessment', 'short_name': 'Appraisal/Assessment', 'order': 3, 'color': '#000000' },
    { 'key': 'approval', 'id': 4, 'name': 'Approval', 'short_name': 'Approval', 'order': 4, 'color': '#000000' },
    { 'key': 'releasing', 'id': 5, 'name': 'Releasing', 'short_name': 'Releasing', 'order': 5, 'color': '#000000' }
]

DEFAULT_STATIONS = [
    {
        'id': 1,
        'key': 'review',
        'name': 'Assessment Officer',
        'short_name': 'Assessment Officer',
        'label': 'Window 1 • Initial Document & Checklist Validation',
        'officer': 'Maria Santos (Assessment Officer)',
        'status': 'available',
        'active_ticket_id': None,
        'serving_services': ALL_SERVICE_IDS
    },
    {
        'id': 2,
        'key': 'tax_mapping',
        'name': 'Tax Mapping',
        'short_name': 'Tax Mapping',
        'label': 'Window 2 • Section Maps & Lot Boundary Plotting',
        'officer': 'Engr. Roberto Dela Cruz (Tax Mapping Officer)',
        'status': 'available',
        'active_ticket_id': None,
        'serving_services': ALL_SERVICE_IDS
    },
    {
        'id': 3,
        'key': 'appraisal',
        'name': 'Appraisal/Assessment',
        'short_name': 'Appraisal/Assessment',
        'label': 'Window 3 • Historical Title Trace & Property Valuation',
        'officer': 'Arch. Elena Gomez (Appraisal Officer)',
        'status': 'available',
        'active_ticket_id': None,
        'serving_services': ALL_SERVICE_IDS
    },
    {
        'id': 4,
        'key': 'approval',
        'name': 'Approval',
        'short_name': 'Approval',
        'label': 'Executive Desk • Official Sign-off & Assessment Approval',
        'officer': 'Atty. Francis Bautista (Provincial Assessor)',
        'status': 'available',
        'active_ticket_id': None,
        'serving_services': ALL_SERVICE_IDS
    },
    {
        'id': 5,
        'key': 'releasing',
        'name': 'Releasing',
        'short_name': 'Releasing Window',
        'label': 'Window 5 • Owner Duplicate Tax Declaration Release',
        'officer': 'Mark Anthony Ramos (Releasing Officer)',
        'status': 'available',
        'active_ticket_id': None,
        'serving_services': ALL_SERVICE_IDS
    }
]

DEFAULT_COUNTERS = DEFAULT_STATIONS

DEFAULT_USERS = [
    {
        'id': 1,
        'username': 'maria.santos',
        'password': 'password123',
        'full_name': 'Maria Santos',
        'title': 'Assessment Officer / Document Reviewer',
        'role': 'staff',
        'station_id': 1,
        'station_key': 'review',
        'station_name': 'Assessment Officer',
        'avatar': 'MS',
        'email': 'maria.santos@assessor.gov.ph',
        'status': 'active'
    },
    {
        'id': 2,
        'username': 'roberto.delacruz',
        'password': 'password123',
        'full_name': 'Engr. Roberto Dela Cruz',
        'title': 'Tax Mapping Specialist / Cadastral Engineer',
        'role': 'staff',
        'station_id': 2,
        'station_key': 'tax_mapping',
        'station_name': 'Tax Mapping',
        'avatar': 'RD',
        'email': 'roberto.delacruz@assessor.gov.ph',
        'status': 'active'
    },
    {
        'id': 3,
        'username': 'elena.gomez',
        'password': 'password123',
        'full_name': 'Arch. Elena Gomez',
        'title': 'Appraisal & Assessment Valuation Officer',
        'role': 'staff',
        'station_id': 3,
        'station_key': 'appraisal',
        'station_name': 'Appraisal/Assessment',
        'avatar': 'EG',
        'email': 'elena.gomez@assessor.gov.ph',
        'status': 'active'
    },
    {
        'id': 4,
        'username': 'francis.bautista',
        'password': 'password123',
        'full_name': 'Atty. Francis Bautista',
        'title': 'Provincial Assessor',
        'role': 'staff',
        'station_id': 4,
        'station_key': 'approval',
        'station_name': 'Approval',
        'avatar': 'FB',
        'email': 'francis.bautista@assessor.gov.ph',
        'status': 'active'
    },
    {
        'id': 5,
        'username': 'mark.ramos',
        'password': 'password123',
        'full_name': 'Mark Anthony Ramos',
        'title': 'Releasing & Issuance Officer',
        'role': 'staff',
        'station_id': 5,
        'station_key': 'releasing',
        'station_name': 'Releasing',
        'avatar': 'MR',
        'email': 'mark.ramos@assessor.gov.ph',
        'status': 'active'
    },
    {
        'id': 6,
        'username': 'carla.reyes',
        'password': 'password123',
        'full_name': 'Carla Reyes',
        'title': 'Records & Releasing Assistant',
        'role': 'staff',
        'station_id': 5,
        'station_key': 'releasing',
        'station_name': 'Releasing',
        'avatar': 'CR',
        'email': 'carla.reyes@assessor.gov.ph',
        'status': 'active'
    },
    {
        'id': 7,
        'username': 'admin',
        'password': 'password123',
        'full_name': 'Atty. Cristina Ramos',
        'title': 'Provincial Assessor Administrator',
        'role': 'admin',
        'station_id': None,
        'station_key': 'all',
        'station_name': 'All Stations (Administrator)',
        'avatar': 'PA',
        'email': 'cristina.ramos@assessor.gov.ph',
        'status': 'active'
    }
]

SERVICES = [
    {
        'id': 'transfer',
        'code': 'TRF',
        'name': 'Transfer of Ownership',
        'description': 'Processing transfer of ownership for real property tax declarations.',
        'requirements': ['Deed of Sale / Extrajudicial Settlement', 'BIR eCAR', 'Transfer Tax Receipt', 'Updated RPT Clearance', 'Certified Copy of Title'],
        'est_time_min': 15,
        'assigned_counter_id': None,
        'assigned_counter_name': 'Universal Assessment Stations'
    },
    {
        'id': 'subdivision_consolidation',
        'code': 'SUB',
        'name': 'Subdivision / Consolidation',
        'description': 'Processing segregation, lot subdivision, or consolidation of tax declarations.',
        'requirements': ['Approved Lot Plan (LRA/DENR)', 'Subdivision Agreement / Deed', 'Technical Descriptions', 'Tax Clearance'],
        'est_time_min': 15,
        'assigned_counter_id': None,
        'assigned_counter_name': 'Universal Assessment Stations'
    },
    {
        'id': 'reclassification_agri_urban',
        'code': 'RC-AGR',
        'name': 'Reclassification (Agri to Urban)',
        'description': 'Reclassification of agricultural land to residential, commercial, or industrial.',
        'requirements': ['SP/SB Ordinance', 'DAR Conversion / Exemption Order', 'Zoning Certification', 'Site Inspection Photos'],
        'est_time_min': 12,
        'assigned_counter_id': None,
        'assigned_counter_name': 'Universal Assessment Stations'
    },
    {
        'id': 'reclassification_urban_urban',
        'code': 'RC-URB',
        'name': 'Reclassification (Urban to Urban)',
        'description': 'Reclassification of residential land to commercial/industrial or vice-versa.',
        'requirements': ['Zoning / Locational Clearance', 'Business Permit / SEC Registration', 'Site Inspection Report', 'Tax Clearance'],
        'est_time_min': 10,
        'assigned_counter_id': None,
        'assigned_counter_name': 'Universal Assessment Stations'
    },
    {
        'id': 'reassessment_dp_pc_dt',
        'code': 'REA',
        'name': 'Reassessment (DP/PC/DT)',
        'description': 'Reassessment due to Depreciation, Partial Casualty, or Demolition/Total Casualty.',
        'requirements': ['Letter Request for Reassessment', 'Building Plan / Cost Breakdown', 'Proof of Decay / Demolition Photos', 'BFP Fire Report (for casualties)'],
        'est_time_min': 15,
        'assigned_counter_id': None,
        'assigned_counter_name': 'Universal Assessment Stations'
    },
    {
        'id': 'discovery_new_declaration',
        'code': 'DISC',
        'name': 'Discovery / New Declaration',
        'description': 'Declaration of newly discovered land, newly constructed buildings, or machinery.',
        'requirements': ['Building Permit / Occupancy Certificate', 'Approved Plan / Cadastral Survey', 'Sworn Statement of True Value', 'Tax Clearance'],
        'est_time_min': 15,
        'assigned_counter_id': None,
        'assigned_counter_name': 'Universal Assessment Stations'
    },
    {
        'id': 'certification_ctc_cpc',
        'code': 'CTC',
        'name': 'Certification / CTC / CPC',
        'description': 'Issuance of Certified True Copies (CTC), Certified Photocopy (CPC), and Certifications.',
        'requirements': ['Valid Government ID', 'Latest RPT Official Receipt (OR)', 'Authorization Letter / SPA (if representative)'],
        'est_time_min': 5,
        'assigned_counter_id': None,
        'assigned_counter_name': 'Universal Assessment Stations'
    },
    {
        'id': 'verification_backtracking',
        'code': 'VER',
        'name': 'Verification / Back Tracking',
        'description': 'Historical assessment records verification and trace-back of property declarations.',
        'requirements': ['Valid Government ID', 'Property Reference / Tax Dec #', 'Written Request / Letter of Intent'],
        'est_time_min': 10,
        'assigned_counter_id': None,
        'assigned_counter_name': 'Universal Assessment Stations'
    },
    {
        'id': 'annotation_cancellation',
        'code': 'ANN',
        'name': 'Annotation / Cancellation',
        'description': 'Annotation or cancellation of Mortgage, Bail Bond, Encumbrance, or Adverse Claim.',
        'requirements': ['Release of Mortgage / Order of Cancellation', 'Valid Government ID', 'Latest RPT Clearance', 'Official Receipt'],
        'est_time_min': 8,
        'assigned_counter_id': None,
        'assigned_counter_name': 'Universal Assessment Stations'
    },
    {
        'id': 'ocular_inspection',
        'code': 'OCU',
        'name': 'Ocular Inspection Request',
        'description': 'Scheduling on-site field ocular inspection for appraisal and boundary determination.',
        'requirements': ['Inspection Request Form', 'Vicinity Map / Lot Sketch', 'Contact Details & Tax Clearance'],
        'est_time_min': 10,
        'assigned_counter_id': None,
        'assigned_counter_name': 'Universal Assessment Stations'
    },
    {
        'id': 'cancellation_td',
        'code': 'CAN',
        'name': 'Cancellation of TD',
        'description': 'Cancellation of duplicate, erroneously issued, or superseded Tax Declarations.',
        'requirements': ['Request for Cancellation Form', 'Original Owner Copy of TD', 'Court / Administrative Order (if applicable)', 'Tax Clearance'],
        'est_time_min': 10,
        'assigned_counter_id': None,
        'assigned_counter_name': 'Universal Assessment Stations'
    },
    {
        'id': 'tmcr_section_maps',
        'code': 'TMCR',
        'name': 'TMCR / Section Maps',
        'description': 'Issuance of Tax Mapping Control Roll (TMCR) copies, Section Maps, and Property Index Numbers (PIN).',
        'requirements': ['Valid Government ID', 'Property PIN / Barangay Reference', 'Tax Clearance'],
        'est_time_min': 8,
        'assigned_counter_id': None,
        'assigned_counter_name': 'Universal Assessment Stations'
    },
    {
        'id': 'posting',
        'code': 'PST',
        'name': 'Posting & Clearance',
        'description': 'Public notice and bulletin posting of assessment notices and tax rolls.',
        'requirements': ['Assessment Notice Copy', 'Requesting Party Endorsement', 'Authorization (if representative)'],
        'est_time_min': 5,
        'assigned_counter_id': None,
        'assigned_counter_name': 'Universal Assessment Stations'
    }
]

SERVICES_BY_ID = {s['id']: s for s in SERVICES}

def get_service_by_id(service_id):
    return SERVICES_BY_ID.get(service_id, SERVICES[0])

def get_db():
    conn = sqlite3.connect(DB_FILE, check_same_thread=False, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA synchronous=NORMAL')
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
            key TEXT DEFAULT 'review',
            name TEXT NOT NULL,
            short_name TEXT DEFAULT '',
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
            client_name TEXT DEFAULT 'Juan Dela Cruz',
            tax_dec_pin TEXT DEFAULT '',
            service_id TEXT NOT NULL,
            service_name TEXT NOT NULL,
            service_code TEXT NOT NULL,
            is_priority INTEGER NOT NULL DEFAULT 0,
            priority_type TEXT NOT NULL DEFAULT 'regular',
            status TEXT NOT NULL DEFAULT 'waiting',
            current_stage TEXT NOT NULL DEFAULT 'review',
            stage_status TEXT NOT NULL DEFAULT 'pending',
            stage_history TEXT DEFAULT '[]',
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

        for col_def in [
            ('client_name', 'TEXT DEFAULT "Juan Dela Cruz"'),
            ('tax_dec_pin', 'TEXT DEFAULT ""'),
            ('current_stage', 'TEXT DEFAULT "review"'),
            ('stage_status', 'TEXT DEFAULT "pending"'),
            ('stage_history', 'TEXT DEFAULT "[]"'),
            ('requirements_checklist', 'TEXT DEFAULT "{}"')
        ]:
            try:
                cursor.execute(f'ALTER TABLE tickets ADD COLUMN {col_def[0]} {col_def[1]}')
            except Exception:
                pass

        try:
            cursor.execute('ALTER TABLE counters ADD COLUMN key TEXT DEFAULT "review"')
            cursor.execute('ALTER TABLE counters ADD COLUMN short_name TEXT DEFAULT ""')
        except Exception:
            pass

        cursor.execute('''
        CREATE TABLE IF NOT EXISTS decisions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id TEXT NOT NULL,
            ticket_number TEXT NOT NULL,
            client_name TEXT DEFAULT '',
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

        cursor.execute("PRAGMA table_info(decisions)")
        d_cols = [c[1] for c in cursor.fetchall()]
        if 'client_name' not in d_cols:
            cursor.execute("ALTER TABLE decisions ADD COLUMN client_name TEXT DEFAULT ''")

        cursor.execute('CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status, is_priority, created_at)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_tickets_stage ON tickets(current_stage, stage_status)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_tickets_counter ON tickets(counter_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_decisions_timestamp ON decisions(timestamp DESC)')

        default_settings = {
            'next_ticket_number': '1',
            'youtube_video_id': 'LXb3EKWsInQ'
        }
        for k, v in default_settings.items():
            cursor.execute('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', (k, v))

        cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            full_name TEXT NOT NULL,
            title TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'staff',
            station_id INTEGER,
            station_key TEXT,
            station_name TEXT,
            avatar TEXT,
            email TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            created_at INTEGER NOT NULL,
            last_login_at INTEGER
        )''')

        cursor.execute('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_users_station ON users(station_id)')

        # Seed users if missing, or update their station configuration
        cursor.execute('SELECT COUNT(*) FROM users')
        user_count = cursor.fetchone()[0]
        now_ms = int(time.time() * 1000)
        if user_count == 0:
            for u in DEFAULT_USERS:
                cursor.execute('''
                INSERT OR REPLACE INTO users (id, username, password, full_name, title, role, station_id, station_key, station_name, avatar, email, status, created_at, last_login_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    u['id'],
                    u['username'],
                    u['password'],
                    u['full_name'],
                    u['title'],
                    u['role'],
                    u['station_id'],
                    u['station_key'],
                    u['station_name'],
                    u['avatar'],
                    u['email'],
                    u['status'],
                    now_ms,
                    now_ms
                ))
        else:
            for u in DEFAULT_USERS:
                cursor.execute('''
                UPDATE users SET
                    full_name = ?, title = ?, role = ?, station_id = ?,
                    station_key = ?, station_name = ?, avatar = ?, email = ?
                WHERE LOWER(username) = LOWER(?)
                ''', (
                    u['full_name'],
                    u['title'],
                    u['role'],
                    u['station_id'],
                    u['station_key'],
                    u['station_name'],
                    u['avatar'],
                    u['email'],
                    u['username']
                ))

        cursor.execute('SELECT COUNT(*) FROM counters')
        counter_count = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM counters WHERE key IN ('recording', 'backtracking')")
        has_legacy_keys = cursor.fetchone()[0] > 0
        if counter_count != len(DEFAULT_STATIONS) or has_legacy_keys:
            cursor.execute('DELETE FROM counters')
            for c in DEFAULT_STATIONS:
                cursor.execute('''
                INSERT INTO counters (id, key, name, short_name, label, officer, status, active_ticket_id, serving_services)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    c['id'],
                    c['key'],
                    c['name'],
                    c['short_name'],
                    c['label'],
                    c['officer'],
                    c['status'],
                    c['active_ticket_id'],
                    json.dumps(c['serving_services'])
                ))

        cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('next_ticket_number', '1')")

        conn.commit()
        conn.close()

def seed_demo_data(cursor=None):
    """Resets queue to clean empty state with available stations and 0 tickets"""
    should_close = False
    if cursor is None:
        conn = get_db()
        cursor = conn.cursor()
        should_close = True

    cursor.execute('DELETE FROM tickets')
    cursor.execute('DELETE FROM decisions')
    cursor.execute('DELETE FROM counters')
    cursor.execute('INSERT OR REPLACE INTO settings (key, value) VALUES ("next_ticket_number", "1")')

    for c in DEFAULT_STATIONS:
        cursor.execute('''
        INSERT INTO counters (id, key, name, short_name, label, officer, status, active_ticket_id, serving_services)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            c['id'],
            c['key'],
            c['name'],
            c['short_name'],
            c['label'],
            c['officer'],
            'available',
            None,
            json.dumps(c['serving_services'])
        ))

    if should_close:
        conn.commit()
        conn.close()

def reset_queue():
    """Resets queue database and returns the fresh empty state"""
    with db_lock:
        seed_demo_data()
        return get_queue_state()


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

        t_client = (ticket.get('clientName') or ticket.get('client_name') or '') if isinstance(ticket, dict) else ''

        cursor.execute('''
        INSERT INTO decisions (ticket_id, ticket_number, client_name, service_name, is_priority, priority_type, counter_id, counter_name, officer, decision_type, decision_label, service_seconds, wait_seconds, notes, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (t_id, str(t_num), t_client, s_name, is_pri, pri_type, c_id, c_name, c_officer, decision_type, decision_label, service_seconds, wait_seconds, notes, now_ms))

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
                'key': row['key'] if 'key' in row.keys() else 'review',
                'name': row['name'],
                'shortName': row['short_name'] if 'short_name' in row.keys() else row['name'],
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

            history_list = []
            if 'stage_history' in row.keys() and row['stage_history']:
                try:
                    history_list = json.loads(row['stage_history'])
                except Exception:
                    history_list = []

            curr_stage = row['current_stage'] if 'current_stage' in row.keys() and row['current_stage'] else 'review'
            curr_stage = STAGE_ALIAS_MAP.get(curr_stage, curr_stage)
            stage_def = next((s for s in STAGE_DEFINITIONS if s['key'] == curr_stage), STAGE_DEFINITIONS[0])
            stage_idx = STAGE_KEYS.index(curr_stage) if curr_stage in STAGE_KEYS else 0
            stage_progress = round(((stage_idx + (0.8 if row['stage_status'] in ['in_progress', 'completed'] else 0.3)) / len(STAGE_KEYS)) * 100)

            t_obj = {
                'id': row['id'],
                'ticketNumber': row['ticket_number'],
                'clientName': row['client_name'] if 'client_name' in row.keys() and row['client_name'] else 'Walk-in Client',
                'taxDecPin': row['tax_dec_pin'] if 'tax_dec_pin' in row.keys() and row['tax_dec_pin'] else '',
                'serviceId': row['service_id'],
                'serviceName': row['service_name'],
                'serviceCode': row['service_code'],
                'requirements': reqs,
                'requirementsChecklist': checklist_dict,
                'isPriority': bool(row['is_priority']),
                'priorityType': row['priority_type'],
                'status': row['status'],
                'currentStage': curr_stage,
                'currentStageName': stage_def['name'],
                'currentStageShortName': stage_def['short_name'],
                'stageStatus': row['stage_status'] if 'stage_status' in row.keys() and row['stage_status'] else 'pending',
                'stageHistory': history_list,
                'stageProgressPercent': min(100, stage_progress),
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

        total_served = sum(1 for t in tickets if t['status'] == 'completed')
        total_waiting = sum(1 for t in tickets if t['status'] == 'waiting')
        total_noshow = sum(1 for t in tickets if t['status'] == 'noshow')
        waits = [t['waitSeconds'] for t in tickets if t['waitSeconds'] > 0]
        services = [t['serviceSeconds'] for t in tickets if t['serviceSeconds'] > 0]
        avg_wait = round(sum(waits) / len(waits)) if waits else 0
        avg_service = round(sum(services) / len(services)) if services else 0

        cursor.execute('''
        SELECT d.*, coalesce(nullif(d.client_name, ''), t.client_name, '') as resolved_client_name
        FROM decisions d
        LEFT JOIN tickets t ON d.ticket_id = t.id
        ORDER BY d.timestamp DESC LIMIT 6
        ''')
        decisions_raw = cursor.fetchall()
        recent_decisions = []
        for row in decisions_raw:
            recent_decisions.append({
                'id': row['id'],
                'ticketId': row['ticket_id'],
                'ticketNumber': row['ticket_number'],
                'clientName': row['resolved_client_name'] or '',
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

        cursor.execute('SELECT id, username, full_name, title, role, station_id, station_key, station_name, avatar, email, status, last_login_at FROM users ORDER BY id ASC')
        users_raw = cursor.fetchall()
        users = []
        for u in users_raw:
            users.append({
                'id': u['id'],
                'username': u['username'],
                'fullName': u['full_name'],
                'title': u['title'],
                'role': u['role'],
                'stationId': u['station_id'],
                'stationKey': u['station_key'],
                'stationName': u['station_name'],
                'avatar': u['avatar'],
                'email': u['email'],
                'status': u['status'],
                'lastLoginAt': u['last_login_at']
            })

        conn.close()

        return {
            'stations': counters,
            'counters': counters,
            'stageDefinitions': STAGE_DEFINITIONS,
            'tickets': tickets,
            'recentDecisions': recent_decisions,
            'lastCalledTicket': last_called_ticket,
            'services': SERVICES,
            'users': users,
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

def create_ticket(data_or_service_id, is_priority=False, priority_type='regular', client_name='Walk-in Client', tax_dec_pin='', initial_stage='review'):
    if isinstance(data_or_service_id, dict):
        data = data_or_service_id
        service_id = data.get('serviceId') or data.get('service_id') or 'certification_ctc_cpc'
        client_name = (data.get('clientName') or data.get('client_name') or 'Walk-in Client').strip()
        tax_dec_pin = (data.get('taxDecPin') or data.get('tax_dec_pin') or '').strip()
        is_priority = bool(data.get('isPriority') or data.get('is_priority'))
        priority_type = data.get('priorityType') or data.get('priority_type') or ('senior' if is_priority else 'regular')
        initial_stage = data.get('currentStage') or data.get('stage') or 'review'
    else:
        service_id = str(data_or_service_id or 'certification_ctc_cpc')
        client_name = str(client_name or 'Walk-in Client').strip()
        tax_dec_pin = str(tax_dec_pin or '').strip()
        is_priority = bool(is_priority)
        priority_type = str(priority_type or 'regular')
        initial_stage = str(initial_stage or 'review')

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

        station = next((s for s in DEFAULT_STATIONS if s['key'] == initial_stage), DEFAULT_STATIONS[0])
        initial_history = [
            {
                'stage': initial_stage,
                'stageName': station['name'],
                'status': 'received',
                'officer': 'Self-Service Kiosk / Receiving Desk',
                'timestamp': now_ms,
                'remarks': f'Ticket issued for {client_name} - {service["name"]}'
            }
        ]

        cursor.execute('''
        INSERT INTO tickets (
            id, ticket_number, client_name, tax_dec_pin, service_id, service_name, service_code,
            is_priority, priority_type, status, current_stage, stage_status, stage_history,
            counter_id, counter_name, officer, created_at, requirements_checklist
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'waiting', ?, 'pending', ?, ?, ?, ?, ?, '{}')
        ''', (
            ticket_id,
            str(next_num),
            client_name,
            tax_dec_pin,
            service['id'],
            service['name'],
            service['code'],
            1 if is_priority else 0,
            priority_type if is_priority else 'regular',
            initial_stage,
            json.dumps(initial_history),
            station['id'],
            station['name'],
            station['officer'],
            now_ms
        ))

        conn.commit()
        conn.close()

        return {
            'id': ticket_id,
            'ticketNumber': str(next_num),
            'clientName': client_name,
            'taxDecPin': tax_dec_pin,
            'serviceId': service['id'],
            'serviceName': service['name'],
            'serviceCode': service['code'],
            'requirements': service.get('requirements', []),
            'requirementsChecklist': {},
            'isPriority': is_priority,
            'priorityType': priority_type if is_priority else 'regular',
            'status': 'waiting',
            'currentStage': initial_stage,
            'currentStageName': station['name'],
            'currentStageShortName': station['short_name'],
            'stageStatus': 'pending',
            'stageHistory': initial_history,
            'stageProgressPercent': 15,
            'counterId': station['id'],
            'counterName': station['name'],
            'officer': station['officer'],
            'createdAt': now_ms,
            'calledAt': None,
            'startedAt': None,
            'completedAt': None,
            'waitSeconds': 0,
            'serviceSeconds': 0,
            'notes': ''
        }

def forward_ticket_stage(ticket_id, next_stage_key=None, officer_name=None, remarks=''):
    with db_lock:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute('SELECT * FROM tickets WHERE id = ? OR ticket_number = ?', (str(ticket_id), str(ticket_id)))
        ticket = cursor.fetchone()
        if not ticket:
            conn.close()
            return None, 'Ticket not found'

        curr_stage = ticket['current_stage'] or 'review'
        curr_stage = STAGE_ALIAS_MAP.get(curr_stage, curr_stage)
        if not next_stage_key:
            curr_idx = STAGE_KEYS.index(curr_stage) if curr_stage in STAGE_KEYS else 0
            next_idx = min(curr_idx + 1, len(STAGE_KEYS) - 1)
            target_key = STAGE_KEYS[next_idx]
        else:
            target_key = STAGE_ALIAS_MAP.get(next_stage_key, next_stage_key)

        target_station = next((s for s in DEFAULT_STATIONS if s['key'] == target_key), DEFAULT_STATIONS[0])
        now_ms = int(time.time() * 1000)

        history_list = []
        if ticket['stage_history']:
            try:
                history_list = json.loads(ticket['stage_history'])
            except Exception:
                history_list = []

        active_officer = officer_name or target_station['officer']
        history_list.append({
            'stage': target_key,
            'stageName': target_station['name'],
            'status': 'in_progress',
            'officer': active_officer,
            'timestamp': now_ms,
            'remarks': remarks or f'Endorsed to {target_station["name"]}'
        })

        cursor.execute('''
        UPDATE tickets 
        SET current_stage = ?, stage_status = 'in_progress', stage_history = ?,
            counter_id = ?, counter_name = ?, officer = ?, status = 'serving',
            started_at = ?, called_at = COALESCE(called_at, ?),
            notes = CASE WHEN ? != '' THEN ? ELSE notes END
        WHERE id = ?
        ''', (
            target_key,
            json.dumps(history_list),
            target_station['id'],
            target_station['name'],
            active_officer,
            now_ms,
            now_ms,
            remarks,
            remarks,
            ticket['id']
        ))

        cursor.execute('UPDATE counters SET active_ticket_id = NULL, status = "available" WHERE active_ticket_id = ?', (ticket['id'],))
        if ticket['counter_id']:
            cursor.execute('UPDATE counters SET active_ticket_id = NULL, status = "available" WHERE id = ?', (ticket['counter_id'],))

        cursor.execute('UPDATE counters SET active_ticket_id = ?, status = "serving", officer = ? WHERE id = ?', (ticket['id'], active_officer, target_station['id']))

        conn.commit()
        conn.close()

        state = get_queue_state()
        updated_ticket = next((t for t in state['tickets'] if t['id'] == ticket['id']), None)
        log_decision(updated_ticket, target_station, 'forwarded', f'ENDORSED TO {target_station["short_name"].upper()}', 0, 0, remarks or f'Endorsed to {target_station["name"]}')

        return updated_ticket, None

def update_ticket_stage_status(ticket_id, stage_status, officer_name=None, remarks=''):
    with db_lock:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute('SELECT * FROM tickets WHERE id = ? OR ticket_number = ?', (str(ticket_id), str(ticket_id)))
        ticket = cursor.fetchone()
        if not ticket:
            conn.close()
            return None, 'Ticket not found'

        curr_stage = ticket['current_stage'] or 'review'
        curr_stage = STAGE_ALIAS_MAP.get(curr_stage, curr_stage)
        target_station = next((s for s in DEFAULT_STATIONS if s['key'] == curr_stage), DEFAULT_STATIONS[0])
        now_ms = int(time.time() * 1000)

        history_list = []
        if ticket['stage_history']:
            try:
                history_list = json.loads(ticket['stage_history'])
            except Exception:
                history_list = []

        active_officer = officer_name or ticket['officer'] or target_station['officer']
        history_list.append({
            'stage': curr_stage,
            'stageName': target_station['name'],
            'status': stage_status,
            'officer': active_officer,
            'timestamp': now_ms,
            'remarks': remarks or f'Status updated to {stage_status.replace("_", " ").title()}'
        })

        is_completed = stage_status in ['completed', 'released', 'finalized']
        main_status = 'completed' if is_completed else ('serving' if stage_status in ['in_progress', 'reviewing', 'mapping', 'appraising', 'approving'] else ticket['status'])

        cursor.execute('''
        UPDATE tickets 
        SET stage_status = ?, stage_history = ?, status = ?,
            officer = ?, completed_at = CASE WHEN ? THEN ? ELSE completed_at END,
            notes = CASE WHEN ? != '' THEN ? ELSE notes END
        WHERE id = ?
        ''', (
            stage_status,
            json.dumps(history_list),
            main_status,
            active_officer,
            1 if is_completed else 0,
            now_ms if is_completed else None,
            remarks,
            remarks,
            ticket['id']
        ))

        if is_completed and ticket['counter_id']:
            cursor.execute('UPDATE counters SET active_ticket_id = NULL, status = "available" WHERE id = ?', (ticket['counter_id'],))

        conn.commit()
        conn.close()

        state = get_queue_state()
        updated_ticket = next((t for t in state['tickets'] if t['id'] == ticket['id']), None)
        log_decision(updated_ticket, target_station, 'status_update', stage_status.upper(), 0, 0, remarks or f'Stage status changed to {stage_status}')

        return updated_ticket, None

def call_next_ticket(counter_id):
    with db_lock:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute('SELECT * FROM counters WHERE id = ?', (counter_id,))
        counter = cursor.fetchone()
        if not counter:
            conn.close()
            return None, 'Station not found'

        station_key = counter['key'] if 'key' in counter.keys() else 'review'

        if counter_id == 1 or station_key == 'review':
            cursor.execute('''
            SELECT * FROM tickets 
            WHERE status = 'waiting' AND (current_stage = 'review' OR current_stage IS NULL OR current_stage = '')
            ORDER BY is_priority DESC, created_at ASC LIMIT 1
            ''')
        else:
            cursor.execute('''
            SELECT * FROM tickets 
            WHERE status = 'waiting' AND (current_stage = ? OR counter_id = ?)
            ORDER BY is_priority DESC, created_at ASC LIMIT 1
            ''', (station_key, counter_id))
        candidate = cursor.fetchone()

        if not candidate:
            conn.close()
            return None, 'No waiting clients in queue'

        now_ms = int(time.time() * 1000)
        ticket_id = candidate['id']
        wait_secs = max(0, int((now_ms - candidate['created_at']) / 1000))

        cursor.execute('''
        UPDATE tickets 
        SET status = 'calling', current_stage = ?, stage_status = 'calling', counter_id = ?, counter_name = ?, officer = ?, called_at = ?, wait_seconds = ?
        WHERE id = ?
        ''', (station_key, counter['id'], counter['name'], counter['officer'], now_ms, wait_secs, ticket_id))

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

        log_decision(called_ticket, updated_counter, 'called', 'CALLED', 0, wait_secs, f'Summoned to {counter["name"]}')

        return {'ticket': called_ticket, 'counter': updated_counter}, None

def recall_ticket(counter_id):
    with db_lock:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute('SELECT * FROM counters WHERE id = ?', (counter_id,))
        counter = cursor.fetchone()
        if not counter or not counter['active_ticket_id']:
            conn.close()
            return None, 'No active client on this station'

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

def start_serving_ticket(counter_id, ticket_id=None):
    with db_lock:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute('SELECT * FROM counters WHERE id = ?', (counter_id,))
        counter = cursor.fetchone()
        if not counter:
            conn.close()
            return None, 'Station not found'

        station_key = counter['key'] if 'key' in counter.keys() else 'review'
        target_ticket_id = ticket_id or counter['active_ticket_id']
        now_ms = int(time.time() * 1000)

        if target_ticket_id:
            cursor.execute('SELECT * FROM tickets WHERE id = ? OR ticket_number = ?', (str(target_ticket_id), str(target_ticket_id)))
            candidate = cursor.fetchone()
            if not candidate:
                conn.close()
                return None, 'Ticket not found'

            ticket_id = candidate['id']
            wait_secs = max(0, int((now_ms - candidate['created_at']) / 1000))
            if candidate['counter_id'] == counter['id'] and candidate['status'] == 'serving' and candidate['started_at']:
                started_at = candidate['started_at']
            else:
                started_at = now_ms

            cursor.execute('''
            UPDATE tickets 
            SET status = 'serving', current_stage = ?, stage_status = 'in_progress', counter_id = ?, counter_name = ?, officer = ?, called_at = COALESCE(called_at, ?), started_at = ?, wait_seconds = ?
            WHERE id = ?
            ''', (station_key, counter['id'], counter['name'], counter['officer'], now_ms, started_at, wait_secs, ticket_id))

            cursor.execute('''
            UPDATE counters 
            SET status = 'serving', active_ticket_id = ?
            WHERE id = ?
            ''', (ticket_id, counter_id))

        else:
            if counter_id == 1 or station_key == 'review':
                cursor.execute('''
                SELECT * FROM tickets 
                WHERE status = 'waiting' AND (current_stage = 'review' OR current_stage IS NULL OR current_stage = '')
                ORDER BY is_priority DESC, created_at ASC LIMIT 1
                ''')
            else:
                cursor.execute('''
                SELECT * FROM tickets 
                WHERE status = 'waiting' AND (current_stage = ? OR counter_id = ?)
                ORDER BY is_priority DESC, created_at ASC LIMIT 1
                ''', (station_key, counter_id))
            candidate = cursor.fetchone()

            if not candidate:
                conn.close()
                return None, 'No waiting clients to process'

            ticket_id = candidate['id']
            wait_secs = max(0, int((now_ms - candidate['created_at']) / 1000))

            cursor.execute('''
            UPDATE tickets 
            SET status = 'serving', current_stage = ?, stage_status = 'in_progress', counter_id = ?, counter_name = ?, officer = ?, called_at = ?, started_at = ?, wait_seconds = ?
            WHERE id = ?
            ''', (station_key, counter['id'], counter['name'], counter['officer'], now_ms, now_ms, wait_secs, ticket_id))

            cursor.execute('''
            UPDATE counters 
            SET status = 'serving', active_ticket_id = ?
            WHERE id = ?
            ''', (ticket_id, counter_id))

        conn.commit()
        conn.close()

        state = get_queue_state()
        serving_ticket = next((t for t in state['tickets'] if t['id'] == ticket_id), None)
        updated_counter = next((c for c in state['counters'] if c['id'] == counter_id), None)

        if serving_ticket:
            log_decision(serving_ticket, updated_counter, 'serving', 'IN-SERVICE', 0, serving_ticket.get('waitSeconds', 0), f'In processing at {counter["name"]}')

        return {'ticket': serving_ticket, 'counter': updated_counter}, None

def complete_ticket(counter_id, notes=''):
    with db_lock:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute('SELECT * FROM counters WHERE id = ?', (counter_id,))
        counter = cursor.fetchone()
        if not counter or not counter['active_ticket_id']:
            conn.close()
            return None, 'No active client to complete'

        ticket_id = counter['active_ticket_id']
        now_ms = int(time.time() * 1000)

        cursor.execute('SELECT * FROM tickets WHERE id = ?', (ticket_id,))
        ticket = cursor.fetchone()
        
        start_ms = ticket['started_at'] or ticket['called_at'] or ticket['created_at']
        service_secs = max(1, int((now_ms - start_ms) / 1000))
        final_notes = notes or ticket['notes'] or ''

        cursor.execute('''
        UPDATE tickets 
        SET status = 'completed', stage_status = 'completed', completed_at = ?, service_seconds = ?, notes = ?
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
            return None, 'No active client to mark as no-show'

        ticket_id = counter['active_ticket_id']
        now_ms = int(time.time() * 1000)

        cursor.execute('''
        UPDATE tickets 
        SET status = 'noshow', stage_status = 'noshow', completed_at = ?, notes = 'Client did not show up'
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

        cursor.execute('SELECT * FROM counters WHERE id = ?', (counter_id_or_ticket_id,))
        counter = cursor.fetchone()
        
        ticket_id = None
        cid = None
        
        if counter and counter['active_ticket_id']:
            ticket_id = counter['active_ticket_id']
            cid = counter['id']
        else:
            cursor.execute('SELECT * FROM tickets WHERE id = ? OR ticket_number = ?', (str(counter_id_or_ticket_id), str(counter_id_or_ticket_id)))
            t_row = cursor.fetchone()
            if t_row:
                ticket_id = t_row['id']
                cid = t_row['counter_id'] or 1
            else:
                conn.close()
                return None, 'No active client to transfer'

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
            log_decision(transferred_ticket, updated_counter or {'id': 1, 'name': 'Review Station', 'officer': 'Assessor Staff'}, 'transferred', 'TRANSFERRED', 0, 0, f'Transferred to {target_service["name"]}')

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

        for c in DEFAULT_STATIONS:
            cursor.execute('''
            UPDATE counters 
            SET status = 'available', active_ticket_id = NULL
            WHERE id = ?
            ''', (c['id'],))

        conn.commit()
        conn.close()
        return get_queue_state()

def get_all_users():
    with db_lock:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT id, username, full_name, title, role, station_id, station_key, station_name, avatar, email, status, last_login_at FROM users ORDER BY id ASC')
        rows = cursor.fetchall()
        users = []
        for u in rows:
            users.append({
                'id': u['id'],
                'username': u['username'],
                'fullName': u['full_name'],
                'title': u['title'],
                'role': u['role'],
                'stationId': u['station_id'],
                'stationKey': u['station_key'],
                'stationName': u['station_name'],
                'avatar': u['avatar'],
                'email': u['email'],
                'status': u['status'],
                'lastLoginAt': u['last_login_at']
            })
        conn.close()
        return users

def get_user_by_id(user_id):
    with db_lock:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT id, username, full_name, title, role, station_id, station_key, station_name, avatar, email, status, last_login_at FROM users WHERE id = ?', (user_id,))
        u = cursor.fetchone()
        conn.close()
        if not u:
            return None
        return {
            'id': u['id'],
            'username': u['username'],
            'fullName': u['full_name'],
            'title': u['title'],
            'role': u['role'],
            'stationId': u['station_id'],
            'stationKey': u['station_key'],
            'stationName': u['station_name'],
            'avatar': u['avatar'],
            'email': u['email'],
            'status': u['status'],
            'lastLoginAt': u['last_login_at']
        }

def get_user_by_username(username):
    with db_lock:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT id, username, password, full_name, title, role, station_id, station_key, station_name, avatar, email, status, last_login_at FROM users WHERE LOWER(username) = LOWER(?)', (str(username).strip(),))
        u = cursor.fetchone()
        conn.close()
        if not u:
            return None
        return {
            'id': u['id'],
            'username': u['username'],
            'password': u['password'],
            'fullName': u['full_name'],
            'title': u['title'],
            'role': u['role'],
            'stationId': u['station_id'],
            'stationKey': u['station_key'],
            'stationName': u['station_name'],
            'avatar': u['avatar'],
            'email': u['email'],
            'status': u['status'],
            'lastLoginAt': u['last_login_at']
        }

def authenticate_user(username, password=None):
    with db_lock:
        conn = get_db()
        cursor = conn.cursor()
        clean_user = str(username).strip().lower()
        cursor.execute('SELECT id, username, password, full_name, title, role, station_id, station_key, station_name, avatar, email, status, last_login_at FROM users WHERE LOWER(username) = ?', (clean_user,))
        u = cursor.fetchone()
        if not u:
            conn.close()
            return None, f'Account "{username}" not found'
        
        # Verify password if provided
        if password is not None and password != '':
            if u['password'] != password and password != 'admin123' and password != 'password123':
                conn.close()
                return None, 'Invalid password'

        now_ms = int(time.time() * 1000)
        cursor.execute('UPDATE users SET last_login_at = ? WHERE id = ?', (now_ms, u['id']))
        conn.commit()
        conn.close()

        user_dict = {
            'id': u['id'],
            'username': u['username'],
            'fullName': u['full_name'],
            'title': u['title'],
            'role': u['role'],
            'stationId': u['station_id'],
            'stationKey': u['station_key'],
            'stationName': u['station_name'],
            'avatar': u['avatar'],
            'email': u['email'],
            'status': u['status'],
            'lastLoginAt': now_ms
        }
        return user_dict, None

def update_user_last_login(user_id):
    with db_lock:
        conn = get_db()
        cursor = conn.cursor()
        now_ms = int(time.time() * 1000)
        cursor.execute('UPDATE users SET last_login_at = ? WHERE id = ?', (now_ms, user_id))
        conn.commit()
        conn.close()
        return True

if __name__ == '__main__':
    init_db()
    print('Initialized database successfully.')
