from pathlib import Path
import os
import sys


BASE_DIR = Path(__file__).resolve().parent
VENDOR_DIR = BASE_DIR / "vendor"

if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

if VENDOR_DIR.exists():
    sys.path.insert(0, str(VENDOR_DIR))

from app import create_app

app = create_app()


if __name__ == "__main__":
    debug_enabled = os.getenv("APP_DEBUG", "0") == "1"
    app.run(host="0.0.0.0", port=5000, debug=debug_enabled, use_reloader=False)
