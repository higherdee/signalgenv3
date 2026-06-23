# 🪟 Windows Setup Guide

> If you got the error **"Python was not found; run without arguments to install from the Microsoft Store..."**, this is for you.

## ⚡ The fastest fix (30 seconds)

Open the folder in VS Code, then in its terminal run:

```powershell
py --version
```

If that prints something like `Python 3.12.x`, you're done — use **`py app.py`** instead of `python3 app.py` from now on.

```powershell
py -m pip install -r requirements.txt
py app.py
```

The `py` launcher is the official way to run Python on Windows and bypasses the Microsoft Store hijack completely.

## 🛒 The "I don't have Python" fix (5 minutes)

1. Go to **https://www.python.org/downloads/**
2. Click the big yellow **"Download Python 3.12.x"** button
3. Run the installer
4. **☑ CHECK "Add python.exe to PATH"** ← most important step, easy to miss
5. Click **"Install Now"**
6. **Close and re-open VS Code** so it picks up the new PATH
7. In VS Code terminal:
   ```powershell
   python --version
   py -m pip install -r requirements.txt
   python app.py
   ```

> ⚠ Do NOT install Python from the Microsoft Store — that's the broken one causing your error.

## 🧹 The "fix the alias" way (1 minute)

Windows 10/11 has "App execution aliases" that hijack `python` and `python3` to push you to the Store.

1. Press **Win + I** → **Apps** → **Advanced app settings**
2. Find **App execution aliases**
3. Turn OFF:
   - `python.exe` → App Installer
   - `python3.exe` → App Installer
4. Re-open VS Code terminal
5. `python --version` should now work

## 🚀 One-click launch

Just **double-click `start.bat`** in File Explorer, or run `.\start.bat` from VS Code's PowerShell terminal. It will:

1. Detect your Python installation
2. Install all dependencies on first run (one-time, ~1 minute)
3. Launch the server on **http://localhost:8000**

Same thing for **`start.ps1`** if you prefer PowerShell.

## 🩺 Stuck? Diagnose first

Double-click **`test_setup.bat`** — it will tell you exactly what Python commands are available and what versions print out.

## 📦 What the installer puts on your disk

After installing Python from python.org:
- `C:\Users\<you>\AppData\Local\Programs\Python\Python312\python.exe`
- `C:\Users\<you>\AppData\Local\Programs\Python\Python312\python3.exe`
- `C:\Users\<you>\AppData\Local\Programs\Python\Launcher\py.exe`

And the dependencies (`pip install -r requirements.txt`):
- fastapi, uvicorn, aiohttp, requests
- pandas, numpy, ta (technical indicators)
- yfinance, feedparser, vaderSentiment
- jinja2, python-multipart

Total disk space: ~250 MB.

## ⚙️ VS Code Python extension (recommended)

1. Install the **Python** extension by Microsoft (ms-python.python) in VS Code
2. It will auto-detect your Python install
3. The status bar at the bottom shows the active interpreter
4. You can switch interpreters with `Ctrl+Shift+P` → "Python: Select Interpreter"

## 🐛 Common errors and fixes

| Error | Fix |
|-------|-----|
| `'python' is not recognized` | Use `py` instead, or install Python from python.org |
| `'pip' is not recognized` | Use `py -m pip install ...` |
| `ModuleNotFoundError: No module named 'fastapi'` | Run `py -m pip install -r requirements.txt` |
| `Address already in use` (port 8000) | Another app uses port 8000. Edit `app.py` last line: change `port=8000` to `port=8765` etc. |
| `curl_cffi` install fails | Usually fine — yfinance falls back to plain `requests`. Ignore warning. |
| Antivirus blocks Python | Add Python folder to Windows Defender exclusions |

## 🆘 If nothing works

1. Open **PowerShell as Administrator** (right-click Start menu → "Terminal (Admin)")
2. `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy Bypass`
3. Try `py app.py` again
4. If still failing, copy the full error message and check the Python docs or ask for help
