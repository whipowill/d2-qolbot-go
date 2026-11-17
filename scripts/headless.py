"""Run a web page in headless Firefox and get a text report back from it.

The page posts its result to a tiny local web server started here (fetch to REPORT_URL), so a script can print it and set its exit code
instead of someone looking at a screenshot. Used by jsmoke.py and jsparse.py.
"""
import http.server, os, subprocess, tempfile, threading, time


def run_page(html, timeout=90):
    """html uses the global REPORT_URL. Returns the text the page posted, or None."""
    got = []

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_POST(self):
            got.append(self.rfile.read(int(self.headers.get("Content-Length", 0))).decode("utf-8", "replace"))
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()

        def do_OPTIONS(self):
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers", "*")
            self.end_headers()

        def log_message(self, *a):
            pass

    server = http.server.HTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = "http://127.0.0.1:%d/report" % server.server_address[1]
    page = "<script>var REPORT_URL=%r;</script>" % url + html
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "page.html")
        open(path, "w", encoding="utf-8").write(page)
        profile = os.path.join(d, "profile")
        os.makedirs(profile)
        proc = subprocess.Popen(["firefox", "--headless", "--no-remote", "--profile", profile, "file://" + path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        deadline = time.time() + timeout
        while not got and time.time() < deadline and proc.poll() is None:
            time.sleep(0.1)
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
    server.shutdown()
    return got[0] if got else None
