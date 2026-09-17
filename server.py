"""
Provincial Assessor's Office - Real-Time Queue Management System
Full-Stack High Performance Web Application with Server-Sent Events (SSE), SQLite, and REST API.
Configuration:
- Counter 1: All Assessment Services
- Counter 2: Priority Courtesy Lane & All Services
- Counter 3: All Assessment Services
"""

import os
import sys
import json
import time
import queue
import csv
import io
import threading
from datetime import datetime
from flask import Flask, request, jsonify, Response, send_from_directory, make_response
import database

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__, static_folder=BASE_DIR, static_url_path='')

# Thread-safe SSE client registry
sse_subscribers = []
sse_lock = threading.Lock()


def broadcast_sse(event_type, data):
    """Push real-time payload to all connected browser displays & mobile clients"""
    payload = json.dumps({'type': event_type, 'data': data})
    with sse_lock:
        dead = []
        for q in sse_subscribers:
            try:
                q.put_nowait(payload)
            except Exception:
                dead.append(q)
        for d in dead:
            if d in sse_subscribers:
                sse_subscribers.remove(d)


def async_broadcast_state():
    """Broadcast state in background thread so HTTP responses return in < 1ms"""
    def _run():
        try:
            state = database.get_queue_state()
            broadcast_sse('STATE_CHANGED', state)
        except Exception as e:
            print(f"Error in async_broadcast_state: {e}")
    threading.Thread(target=_run, daemon=True).start()


# ============================================================================
# SERVER-SENT EVENTS (SSE) STREAM
# ============================================================================

@app.route('/api/events')
def sse_stream():
    """Real-time SSE event stream for instantaneous kiosk, TV, and console updates"""
    q = queue.Queue(maxsize=50)
    with sse_lock:
        sse_subscribers.append(q)

    def event_stream():
        # Send initial state immediately upon connection
        try:
            initial = json.dumps({'type': 'CONNECTED', 'data': database.get_queue_state()})
            yield f"data: {initial}\n\n"
        except Exception:
            pass

        try:
            while True:
                try:
                    message = q.get(timeout=20)
                    yield f"data: {message}\n\n"
                except queue.Empty:
                    # Keep-alive heartbeat comment
                    yield ": heartbeat\n\n"
        finally:
            with sse_lock:
                if q in sse_subscribers:
                    sse_subscribers.remove(q)

    response = Response(event_stream(), mimetype='text/event-stream')
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['X-Accel-Buffering'] = 'no'
    response.headers['Access-Control-Allow-Origin'] = '*'
    return response


# ============================================================================
# REST API ENDPOINTS
# ============================================================================

@app.route('/api/state', methods=['GET'])
def get_state():
    """Get complete queue telemetry, counters, tickets, and stats"""
    state = database.get_queue_state()
    return jsonify(state)


@app.route('/api/tickets', methods=['POST'])
def issue_ticket():
    """Ultra-fast ticket creation with direct in-memory response"""
    data = request.get_json(silent=True) or {}
    new_ticket = database.create_ticket(data)
    
    # Broadcast asynchronously to maintain sub-millisecond HTTP response time
    broadcast_sse('TICKET_ISSUED', new_ticket)
    async_broadcast_state()
    
    return jsonify({'success': True, 'ticket': new_ticket})


@app.route('/api/counters/<int:counter_id>/call', methods=['POST'])
@app.route('/api/stations/<int:counter_id>/call', methods=['POST'])
def call_next(counter_id):
    """Counter / Station calls next waiting ticket (Priority first, then FIFO)"""
    res, err = database.call_next_ticket(counter_id)
    if not res:
        return jsonify({'success': False, 'message': err or 'No waiting tickets in queue'}), 404

    broadcast_sse('TICKET_CALLED', res)
    async_broadcast_state()

    return jsonify({'success': True, 'ticket': res['ticket'], 'counter': res['counter'], 'station': res['counter']})


@app.route('/api/counters/<int:counter_id>/recall', methods=['POST'])
@app.route('/api/stations/<int:counter_id>/recall', methods=['POST'])
def recall_ticket(counter_id):
    """Re-announce active ticket at station with voice + chime"""
    res, err = database.recall_ticket(counter_id)
    if not res:
        return jsonify({'success': False, 'message': err or 'No active ticket to recall'}), 404

    broadcast_sse('TICKET_CALLED', res)
    async_broadcast_state()

    return jsonify({'success': True, 'ticket': res['ticket'], 'counter': res['counter'], 'station': res['counter']})


@app.route('/api/counters/<int:counter_id>/serve', methods=['POST'])
@app.route('/api/stations/<int:counter_id>/serve', methods=['POST'])
def start_serving(counter_id):
    """Mark active ticket as in-progress serving / processing at station"""
    res, err = database.start_serving_ticket(counter_id)
    if not res:
        return jsonify({'success': False, 'message': err or 'Could not start serving'}), 400

    async_broadcast_state()
    return jsonify({'success': True, 'ticket': res['ticket'], 'counter': res['counter'], 'station': res['counter']})


@app.route('/api/counters/<int:counter_id>/complete', methods=['POST'])
@app.route('/api/stations/<int:counter_id>/complete', methods=['POST'])
def complete_ticket(counter_id):
    """Complete active transaction with service duration calculation"""
    data = request.get_json(silent=True) or {}
    notes = data.get('notes', '')
    res, err = database.complete_ticket(counter_id, notes)
    if not res:
        return jsonify({'success': False, 'message': err or 'Could not complete ticket'}), 400

    async_broadcast_state()
    return jsonify({'success': True, 'ticket': res['ticket'], 'counter': res['counter'], 'station': res['counter']})


@app.route('/api/counters/<int:counter_id>/noshow', methods=['POST'])
@app.route('/api/stations/<int:counter_id>/noshow', methods=['POST'])
def noshow_ticket(counter_id):
    """Mark active ticket as no-show"""
    res, err = database.no_show_ticket(counter_id)
    if not res:
        return jsonify({'success': False, 'message': err or 'Could not mark no-show'}), 400

    async_broadcast_state()
    return jsonify({'success': True, 'ticket': res['ticket'], 'counter': res['counter'], 'station': res['counter']})


@app.route('/api/counters/<int:counter_id>/status', methods=['POST'])
@app.route('/api/stations/<int:counter_id>/status', methods=['POST'])
def update_counter_status(counter_id):
    """Update station status (available, break, offline) and officer name"""
    data = request.get_json(silent=True) or {}
    status = data.get('status', 'available')
    officer = data.get('officer')
    state = database.update_counter_status(counter_id, status, officer)
    broadcast_sse('STATE_CHANGED', state)
    return jsonify({'success': True})


@app.route('/api/tickets/<ticket_id>/forward', methods=['POST'])
def forward_stage(ticket_id):
    """Forward client transaction to the next or specified processing stage"""
    data = request.get_json(silent=True) or {}
    next_stage = data.get('nextStage') or data.get('stage')
    officer = data.get('officer') or data.get('officerName')
    remarks = data.get('remarks') or data.get('notes', '')

    updated_ticket, err = database.forward_ticket_stage(ticket_id, next_stage, officer, remarks)
    if not updated_ticket:
        return jsonify({'success': False, 'message': err or 'Could not forward ticket'}), 400

    async_broadcast_state()
    return jsonify({'success': True, 'ticket': updated_ticket})


@app.route('/api/tickets/<ticket_id>/stage-status', methods=['POST'])
def update_stage_status(ticket_id):
    """Update current stage status (in_progress, pending, mapped, approved, recorded, ready_for_release, released)"""
    data = request.get_json(silent=True) or {}
    stage_status = data.get('stageStatus') or data.get('status', 'in_progress')
    officer = data.get('officer') or data.get('officerName')
    remarks = data.get('remarks') or data.get('notes', '')

    updated_ticket, err = database.update_ticket_stage_status(ticket_id, stage_status, officer, remarks)
    if not updated_ticket:
        return jsonify({'success': False, 'message': err or 'Could not update stage status'}), 400

    async_broadcast_state()
    return jsonify({'success': True, 'ticket': updated_ticket})


@app.route('/api/counters/<int:counter_id>/transfer', methods=['POST'])
@app.route('/api/tickets/<ticket_id>/transfer', methods=['POST'])
def transfer_ticket(counter_id=None, ticket_id=None):
    """Transfer ticket to another service / counter window"""
    data = request.get_json(silent=True) or {}
    target_id = data.get('newServiceId') or data.get('targetServiceId') or 'posting'
    cid = counter_id or 1
    res, err = database.transfer_ticket(cid, target_id)
    if not res:
        return jsonify({'success': False, 'message': err or 'Could not transfer ticket'}), 400

    async_broadcast_state()
    return jsonify({'success': True, 'ticket': res['ticket'], 'counter': res['counter']})


@app.route('/api/tickets/<ticket_id>/checklist', methods=['POST'])
def update_checklist(ticket_id):
    """Update requirements checklist verification for a ticket"""
    data = request.get_json(silent=True) or {}
    checklist = data.get('requirementsChecklist', {})
    notes = data.get('notes')
    database.update_ticket_checklist(ticket_id, checklist, notes)
    async_broadcast_state()
    return jsonify({'success': True})


@app.route('/api/settings', methods=['POST'])
def update_settings():
    """Update system settings (YouTube video ID, office title)"""
    data = request.get_json(silent=True) or {}
    for k, v in data.items():
        database.update_settings(k, v)
    async_broadcast_state()
    return jsonify({'success': True})


@app.route('/api/queue/reset', methods=['POST'])
def reset_queue():
    """Reset daily queue transactions"""
    state = database.reset_queue()
    broadcast_sse('STATE_CHANGED', state)
    return jsonify({'success': True, 'message': 'Queue reset to initial state.'})


@app.route('/api/queue/seed', methods=['POST'])
def seed_queue():
    """Seed queue with realistic transactions for demo/testing"""
    database.seed_demo_data()
    state = database.get_queue_state()
    broadcast_sse('STATE_CHANGED', state)
    return jsonify({'success': True, 'message': 'Demo queue seeded successfully.'})


@app.route('/api/export', methods=['GET'])
def export_csv():
    """Export daily queue log as CSV report for Citizen's Charter auditing"""
    state = database.get_queue_state()
    tickets = state.get('tickets', [])

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        'Ticket #', 'Client Name', 'PIN / Reference', 'Service Name', 'Category',
        'Current Stage', 'Stage Status', 'Station', 'Assigned Officer',
        'Status', 'Wait Time (sec)', 'Service Duration (sec)',
        'Created At', 'Called At', 'Completed At', 'Notes'
    ])

    for t in tickets:
        created_dt = datetime.fromtimestamp(t['createdAt'] / 1000).strftime('%Y-%m-%d %H:%M:%S') if t.get('createdAt') else ''
        called_dt = datetime.fromtimestamp(t['calledAt'] / 1000).strftime('%Y-%m-%d %H:%M:%S') if t.get('calledAt') else ''
        completed_dt = datetime.fromtimestamp(t['completedAt'] / 1000).strftime('%Y-%m-%d %H:%M:%S') if t.get('completedAt') else ''
        writer.writerow([
            t.get('ticketNumber'),
            t.get('clientName', 'Juan Dela Cruz'),
            t.get('taxDecPin', ''),
            t.get('serviceName'),
            t.get('priorityType', 'regular').upper(),
            t.get('currentStageName', 'Document Review'),
            t.get('stageStatus', 'pending').upper(),
            t.get('counterName', ''),
            t.get('officer', ''),
            t.get('status', '').upper(),
            t.get('waitSeconds', 0),
            t.get('serviceSeconds', 0),
            created_dt,
            called_dt,
            completed_dt,
            t.get('notes', '')
        ])

    output.seek(0)
    response = make_response(output.getvalue())
    response.headers['Content-Disposition'] = f"attachment; filename=Provincial_Assessor_Queue_Log_{datetime.now().strftime('%Y%m%d')}.csv"
    response.headers['Content-Type'] = 'text/csv'
    return response


@app.after_request
def add_header(response):
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response


@app.route('/')
def index():
    return send_from_directory(BASE_DIR, 'index.html')


@app.route('/<path:path>')
def static_files(path):
    return send_from_directory(BASE_DIR, path)


# ============================================================================
# SERVER STARTUP
# ============================================================================

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    database.init_db()
    print("=" * 65)
    print("  PROVINCIAL ASSESSOR'S OFFICE - QUEUE MANAGEMENT SYSTEM")
    print("  Full-Stack Real Functioning Web Application (Flask + SQLite + SSE)")
    print("=" * 65)
    print(f"  * Local URL:       http://localhost:{port}/")
    print(f"  * Public TV Sign:  http://localhost:{port}/tv.html")
    print(f"  * Mobile Tracker:  http://localhost:{port}/track.html")
    print(f"  * REST API:        http://localhost:{port}/api/state")
    print(f"  * Real-Time SSE:   http://localhost:{port}/api/events")
    print("=" * 65)
    app.run(host='0.0.0.0', port=port, debug=False, threaded=True)
