"""Robust cloudflared manager — keeps trying until a URL works."""
import subprocess, time, re, os, sys, signal

LOG = "/tmp/tn.log"
BIN = "/tmp/cloudflared"
URL = None
URLS_TRYED = set()

def cleanup():
    for p in ["cloudflared", "run_cloudflared"]:
        subprocess.run(["pkill", "-9", "-f", p], capture_output=True)

def launch():
    if os.path.exists(LOG):
        os.remove(LOG)
    return subprocess.Popen(
        [BIN, "tunnel", "--no-autoupdate", "--url", "http://localhost:8000"],
        stdout=open(LOG, "w"), stderr=subprocess.STDOUT,
        start_new_session=True, stdin=subprocess.DEVNULL,
    )

def get_url():
    try:
        with open(LOG) as f:
            log = f.read()
        for m in re.finditer(r'https://[a-z0-9-]+\.trycloudflare\.com', log):
            u = m.group(0)
            if u not in URLS_TRYED:
                return u
    except FileNotFoundError:
        pass
    return None

def test_url(url):
    import urllib.request
    try:
        req = urllib.request.urlopen(url + "/api/health", timeout=10)
        return req.status == 200
    except Exception:
        return False

cleanup()
time.sleep(2)

for attempt in range(10):
    print(f"[attempt {attempt+1}] launching...", flush=True)
    proc = launch()
    # Wait for URL
    for _ in range(20):
        time.sleep(1)
        url = get_url()
        if url:
            print(f"got URL: {url}", flush=True)
            URLS_TRYED.add(url)
            if test_url(url):
                print(f"✓ URL WORKS: {url}", flush=True)
                sys.exit(0)
            else:
                print(f"  URL failed health check, retrying...", flush=True)
                proc.terminate()
                time.sleep(2)
                break
    else:
        # 20s elapsed with no URL
        if proc.poll() is None:
            proc.terminate()

print("Could not establish a working tunnel after 10 attempts.", flush=True)
