import os
import sys

# Ensure repository root is on sys.path so server and database can be imported
current_dir = os.path.dirname(os.path.abspath(__file__))
root_dir = os.path.dirname(current_dir)
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

# Import the main Flask application
from server import app

# Ensure database tables exist in online Turso DB on cold start
try:
    import database
    database.init_db()
except Exception as e:
    print(f"Turso init_db warning: {e}")

# WSGI prefix middleware to normalize URL path whether Vercel passes /api/... or /...
class PrefixMiddleware:
    def __init__(self, wsgi_app):
        self.wsgi_app = wsgi_app

    def __call__(self, environ, start_response):
        path = environ.get('PATH_INFO', '')
        if not path.startswith('/api') and path != '/':
            environ['PATH_INFO'] = '/api' + path
        return self.wsgi_app(environ, start_response)

app.wsgi_app = PrefixMiddleware(app.wsgi_app)
