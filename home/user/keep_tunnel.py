"""Keep the cloudflared tunnel alive — restart if it dies."""
import subprocess, time, re, sys, os

LOG = "/tmp/tn.log"
BIN = "/tmp/cloudflared"
URL_RE = re.compile(r"https://[a-z0-9-]+\.trycloudflare\.com")

def start():
    if os.path.exists(LOG):
        os.remove(LOG)
    p = subprocess.Popen(
        [BIN, "tunnel", "--no-autoupdate", "--url", "http://localhost:8000"],
        stdout=open(LOG, "w"), stderr=subprocess.STDOUT,
        start_new_session=True, stdin=subprocess.DEVNULL,
    )
    print(f"started cloudflared pid={p.pid}")
    return p

def get_url():
    try:
        with open(LOG) as f:
            log = f.read()
    except FileNotFoundError:
        return None
    m = URL_RE.search(log)
    return m.group(0) if m else None

p = start()
# Print URL once available
for _ in range(30):
    time.sleep(1)
    u = get_url()
    if u:
        print(f"URL: {u}", flush=True)
        break

# Keep restarting if it dies
while True:
    time.sleep(30)
    if p.poll() is not None:
        print(f"cloudflared died (rc={p.returncode}), restarting...", flush=True)
        p = start()
        for _ in range(20):
            time.sleep(1)
            u = get_url()
            if u and u != prev_url:
                print(f"NEW URL: {u}", flush=True)
                prev_url = u
                break
    prev_url = get_url()
