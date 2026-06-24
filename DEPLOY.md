# 🚀 Deploy SignalGen Permanently (Free, 5 Minutes)

The Cloudflare quick-tunnel URL works **right now** but is **not permanent** — it dies whenever this sandbox restarts. For a URL that lives forever, deploy to a free host. Three options, in order of ease:

---

## 🥇 Option 1: Render.com (Recommended — easiest)

1. **Sign up** at https://render.com (free, just an email + GitHub)
2. **Create a GitHub repo** with these files:
   - `signal_engine.py`
   - `app.py`
   - `requirements.txt`
   - `static/` folder (with index.html, styles.css, app.js)
   - `render.yaml`
3. **In Render:** New + → Web Service → connect your repo
4. Render auto-detects Python from `render.yaml`. Click **Create Web Service**.
5. Wait 3 minutes → you get `https://signalgen.onrender.com` — **forever**, free SSL, custom domain supported.

**Free tier note:** Render free instances sleep after 15 min idle. First request after wake takes ~30 s; subsequent are fast. To avoid sleeping, upgrade to the $7/mo plan.

---

## 🥈 Option 2: Railway.app (Easiest — 2 minutes)

1. **Sign up** at https://railway.app (GitHub login)
2. **New Project → Deploy from GitHub** → select your repo
3. Railway auto-detects Python and runs `python app.py`
4. **Settings → Generate Domain** → you get `https://signalgen.up.railway.app`

**Free tier:** $5 credit/month, plenty for this app.

---

## 🥉 Option 3: PythonAnywhere (Old-school, very reliable)

1. Sign up at https://www.pythonanywhere.com (free Beginner plan)
2. Upload files via Web → Files
3. Open a Bash console and run:
   ```bash
   pip3.11 install --user -r requirements.txt
   ```
4. Web → Add a new web app → Manual configuration → Python 3.11
5. Set WSGI file to: `from app import app` then reload
6. Visit `https://yourusername.pythonanywhere.com`

**Free tier:** always-on, no sleeping, ~100 MB disk.

---

## 🏠 Run Locally Forever

Just keep the app running on your own PC:

```powershell
# Windows — open VS Code terminal in this folder
py app.py
```

Then visit **http://localhost:8000** — works whenever your PC is on. No internet needed.

---

## What's in the folder for deployment

| File | Purpose |
|------|---------|
| `signal_engine.py` | Core engine (52 KB) |
| `app.py` | FastAPI server |
| `requirements.txt` | Python dependencies |
| `render.yaml` | One-click Render.com config |
| `Procfile` | Heroku/Railway config |
| `static/` | Dashboard files |
| `README.md` | Main docs |
| `WINDOWS_SETUP.md` | Windows help |
| `start.bat` / `start.ps1` | Windows launchers |
