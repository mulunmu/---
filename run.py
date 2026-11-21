"""Preload .env then run the FastAPI app."""
import sys
import os

from dotenv import load_dotenv

if __name__ == "__main__":
    # Load .env before any app imports so pydantic-settings sees the vars
    env_file = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(env_file):
        load_dotenv(env_file)
    else:
        print(f"[WARN] .env not found at {env_file}", file=sys.stderr)

    import uvicorn

    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8002

    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=port,
        reload=True,
    )
