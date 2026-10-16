#!/usr/bin/env python3
"""
Local preview without the Vercel CLI.

    pip install -r requirements.txt
    python dev_server.py            # http://localhost:3000

Serves public/ as static files and routes /api/colorize to the same handler
code that runs on Vercel.
"""

import os
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, "api"))

from colorize import handler as ApiHandler  # noqa: E402


class DevHandler(SimpleHTTPRequestHandler):
    _json = ApiHandler._json

    def do_GET(self):
        if self.path.startswith("/api/colorize"):
            return ApiHandler.do_GET(self)
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/colorize"):
            return ApiHandler.do_POST(self)
        self.send_error(404)


def main():
    port = int(os.environ.get("PORT", sys.argv[1] if len(sys.argv) > 1 else 3000))
    srv = ThreadingHTTPServer(("0.0.0.0", port),
                              partial(DevHandler, directory=os.path.join(ROOT, "public")))
    print(f"Neon Graffiti running at http://localhost:{port}")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
