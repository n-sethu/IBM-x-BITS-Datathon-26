from functools import lru_cache
from pathlib import Path
from typing import List, Optional, Tuple

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from ingestion.fred_client import FredClient

BASE_DIR = Path(__file__).parent
FRONTEND_DIR = BASE_DIR / "frontend"

DEFAULT_SERIES: List[Tuple[str, str]] = [
    ("GDPC1", "Real GDP (chained 2012$)"),
    ("UNRATE", "Unemployment Rate"),
    ("CPIAUCSL", "CPI (All Urban Consumers)"),
    ("FEDFUNDS", "Federal Funds Rate"),
    ("USREC", "Recession Indicator"),
]

app = FastAPI(
    title="Macro Signals Dashboard",
    description="Markets vs macro FRED signals for the datathon demo",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_fred: FredClient | None = None


def get_client() -> FredClient:
    """
    Lazily instantiate the FRED client so the API key is only validated once.
    """
    global _fred
    if _fred is None:
        _fred = FredClient()
    return _fred


@lru_cache(maxsize=128)
def fetch_cached_series(series_id: str, start: Optional[str], end: Optional[str]) -> pd.DataFrame:
    """
    Cached fetch to limit FRED calls during demos.
    """
    client = get_client()
    df = client.fetch_series(series_id, observation_start=start, observation_end=end)
    return df


@app.get("/api/series/{series_id}")
def get_series(series_id: str, start: Optional[str] = None, end: Optional[str] = None):
    """
    Return a single FRED series as JSON for charting on the frontend.
    """
    sid = series_id.upper()
    # Default start earlier so historical view works out of the box
    start = start or "1980-01-01"
    try:
        df = fetch_cached_series(sid, start, end)
    except Exception as exc:  # broad on purpose to surface friendly message
        raise HTTPException(status_code=400, detail=f"Could not fetch series {sid}: {exc}") from exc

    records = []
    for _, row in df.iterrows():
        val = None if pd.isna(row["value"]) else round(float(row["value"]), 6)
        records.append({"date": row["date"].date().isoformat(), "value": val})

    return {"series_id": sid, "count": len(records), "data": records}


@app.get("/api/dashboard")
def get_dashboard():
    """
    Small summary payload for the dashboard cards.
    """
    summary = []
    for sid, label in DEFAULT_SERIES:
        df = fetch_cached_series(sid, "1980-01-01", None)
        if df.empty:
            continue
        last = df.iloc[-1]
        prev = df.iloc[-2] if len(df) > 1 else last

        last_val = None if pd.isna(last["value"]) else float(last["value"])
        prev_val = None if pd.isna(prev["value"]) else float(prev["value"])

        change = None
        pct_change = None
        if last_val is not None and prev_val not in (None, 0):
            change = last_val - prev_val
            pct_change = (change / prev_val) * 100 if prev_val else None

        summary.append(
            {
                "series_id": sid,
                "label": label,
                "latest_date": last["date"].date().isoformat(),
                "latest_value": None if last_val is None else round(last_val, 4),
                "change": None if change is None else round(change, 4),
                "pct_change": None if pct_change is None else round(pct_change, 2),
            }
        )

    return {"series": summary}


# ---- Frontend static hosting ----
if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


@app.get("/", include_in_schema=False)
def root():
    if not FRONTEND_DIR.exists():
        raise HTTPException(status_code=500, detail="Frontend bundle not found")
    return FileResponse(FRONTEND_DIR / "index.html")
