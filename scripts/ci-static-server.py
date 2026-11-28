"""Serve browser fixtures on loopback with room for concurrent asset connections."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class FixtureServer(ThreadingHTTPServer):
    request_queue_size = 128


class Handler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"


parser = argparse.ArgumentParser()
parser.add_argument("port", type=int)
parser.add_argument("--directory", default="dist")
args = parser.parse_args()
with FixtureServer(("127.0.0.1", args.port), partial(Handler, directory=args.directory)) as server:
    print(f"http://127.0.0.1:{server.server_port}", flush=True)
    print(f"Fixture backlog={FixtureServer.request_queue_size}; standard backlog={ThreadingHTTPServer.request_queue_size}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
