"""
Flask backend for the MarketSignals dashboard.
Serves FRED economic data and forecast comparisons.
Falls back to generated demo data when the FRED API is unreachable.
"""
import sys
import os
import math
import random
from datetime import datetime, timedelta
from flask import Flask, render_template, jsonify, request
from flask_cors import CORS

# Add project root to path so we can import ingestion modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ingestion.fred_client import FredClient

app = Flask(__name__)
CORS(app)

# Hard-coded API key (from project brief)
FRED_API_KEY = os.getenv("FRED_API_KEY", "fc764ee8a327b617b3c272f51b3b3fd3")

SERIES_META = {
    "GDPC1":    {"label": "Real GDP",              "units": "Billions $",   "color": "#4F8EF7", "frequency": "quarterly"},
    "UNRATE":   {"label": "Unemployment Rate",     "units": "%",            "color": "#F76F4F", "frequency": "monthly"},
    "CPIAUCSL": {"label": "CPI Inflation",         "units": "Index",        "color": "#4FBF67", "frequency": "monthly"},
    "FEDFUNDS": {"label": "Federal Funds Rate",    "units": "%",            "color": "#BF4FBF", "frequency": "monthly"},
    "USREC":    {"label": "Recession Indicator",   "units": "0/1",          "color": "#F7C24F", "frequency": "monthly"},
    "T10Y2Y":   {"label": "Yield Curve (10Y-2Y)",  "units": "%",            "color": "#4FBFBF", "frequency": "daily"},
    "DEXUSEU":  {"label": "USD/EUR Exchange Rate", "units": "$/€",          "color": "#F74F9E", "frequency": "daily"},
}


def get_fred_client():
    return FredClient(api_key=FRED_API_KEY)


# ── Demo Data Generator ───────────────────────────────────────────────────────

# Realistic baseline values and per-step volatility for each series
_DEMO_PARAMS = {
    "GDPC1":    {"start_val": 18000, "step_months": 3,  "drift": 120,  "noise": 80,   "baseline": None},
    "UNRATE":   {"start_val": 6.5,   "step_months": 1,  "drift": -0.05,"noise": 0.15, "baseline": None},
    "CPIAUCSL": {"start_val": 240,   "step_months": 1,  "drift": 0.5,  "noise": 0.4,  "baseline": None},
    "FEDFUNDS": {"start_val": 1.5,   "step_months": 1,  "drift": 0.05, "noise": 0.08, "baseline": None},
    "USREC":    {"start_val": 0,     "step_months": 1,  "drift": 0,    "noise": 0,    "baseline": "recession"},
    "T10Y2Y":   {"start_val": 1.2,   "step_months": 1,  "drift": -0.01,"noise": 0.12, "baseline": None},
    "DEXUSEU":  {"start_val": 1.12,  "step_months": 1,  "drift": 0.001,"noise": 0.008,"baseline": None},
}


def _generate_demo_series(series_id: str, start: str, end: str):
    """Generate a plausible-looking time-series for demo/offline use.
    Monthly series generate daily observations so mid-month vs end-of-month
    analysis produces non-trivial mispricing scores.
    """
    params = _DEMO_PARAMS.get(series_id, {"start_val": 100, "step_months": 1, "drift": 0, "noise": 1, "baseline": None})

    start_dt = datetime.strptime(start[:10], "%Y-%m-%d")
    end_dt   = datetime.strptime(end[:10],   "%Y-%m-%d")

    rng = random.Random(hash(series_id + start[:7]))  # deterministic per series

    # Pre-baked recession periods (NBER approximate)
    recession_ranges = [
        (datetime(2001, 3, 1),  datetime(2001, 11, 1)),
        (datetime(2007, 12, 1), datetime(2009, 6, 1)),
        (datetime(2020, 2, 1),  datetime(2020, 4, 1)),
    ]

    dates, values = [], []
    cur = start_dt

    # Advance one day at a time; skip weekends for daily series
    step_days = 1

    while cur <= end_dt:
        # Skip weekends for daily-style series
        if params["step_months"] == 1 and cur.weekday() >= 5:
            cur += timedelta(days=1)
            continue

        if params["baseline"] == "recession":
            is_rec = any(rs <= cur <= re for rs, re in recession_ranges)
            v = 1 if is_rec else 0
        elif series_id == "FEDFUNDS":
            if cur < datetime(2006, 7, 1):
                base = 4.5
            elif cur < datetime(2008, 12, 1):
                base = max(0.05, 4.5 - (cur - datetime(2006, 7, 1)).days / 365 * 2)
            elif cur < datetime(2015, 12, 1):
                base = 0.07
            elif cur < datetime(2019, 7, 1):
                base = min(2.5, 0.25 + (cur - datetime(2015, 12, 1)).days / 365 * 0.7)
            elif cur < datetime(2020, 4, 1):
                base = max(0.07, 2.5 - (cur - datetime(2019, 7, 1)).days / 365)
            elif cur < datetime(2022, 3, 1):
                base = 0.08
            else:
                base = min(5.5, 0.08 + (cur - datetime(2022, 3, 1)).days / 365 * 2.5)
            v = max(0, base + rng.gauss(0, 0.06))
        elif series_id == "UNRATE":
            if cur < datetime(2008, 1, 1):
                base = 4.8
            elif cur < datetime(2010, 10, 1):
                base = 4.8 + (cur - datetime(2008, 1, 1)).days / 365 * 3
            elif cur < datetime(2020, 1, 1):
                base = max(3.5, 10.0 - (cur - datetime(2010, 10, 1)).days / 365 * 0.75)
            elif cur < datetime(2020, 5, 1):
                base = 3.5 + (cur - datetime(2020, 1, 1)).days / 30 * 3.0
            else:
                base = max(3.4, 14.8 - (cur - datetime(2020, 5, 1)).days / 365 * 2.8)
            v = max(0, base + rng.gauss(0, 0.12))
        elif series_id == "GDPC1":
            base = 13000 + (cur - datetime(2000, 1, 1)).days / 365 * 750
            if datetime(2008, 9, 1) <= cur <= datetime(2009, 6, 1):
                base -= 600 * math.sin((cur - datetime(2008, 9, 1)).days / 270 * math.pi)
            if datetime(2020, 1, 1) <= cur <= datetime(2020, 6, 1):
                base -= 2000 * math.sin((cur - datetime(2020, 1, 1)).days / 150 * math.pi)
            v = base + rng.gauss(0, 60)
        elif series_id == "CPIAUCSL":
            base = 200 + (cur - datetime(2000, 1, 1)).days / 365 * 3.5
            if datetime(2021, 3, 1) <= cur < datetime(2022, 12, 1):
                base += ((cur - datetime(2021, 3, 1)).days / 365) * 18
            elif cur >= datetime(2022, 12, 1):
                extra = 18 - (cur - datetime(2022, 12, 1)).days / 365 * 6
                base += max(0, extra)
            v = base + rng.gauss(0, 0.5)
        elif series_id == "T10Y2Y":
            v = 1.5 + math.sin((cur - datetime(2000, 1, 1)).days / 365 / 3) + rng.gauss(0, 0.12)
            if cur >= datetime(2022, 7, 1):
                v -= 2.5
        elif series_id == "DEXUSEU":
            v = 1.10 + 0.08 * math.sin((cur - datetime(2000, 1, 1)).days / 365 / 2.5) + rng.gauss(0, 0.006)
        else:
            v = params["start_val"] + rng.gauss(0, params["noise"])

        dates.append(cur.strftime("%Y-%m-%d"))
        values.append(round(v, 4))

        # For GDPC1 (quarterly), only record quarterly
        if series_id == "GDPC1":
            # Jump to start of next quarter
            month = cur.month
            next_q_month = ((month - 1) // 3 + 1) * 3 + 1
            if next_q_month > 12:
                cur = cur.replace(year=cur.year + 1, month=1, day=1)
            else:
                cur = cur.replace(month=next_q_month, day=1)
        else:
            cur += timedelta(days=step_days)

    return dates, values


def _series_data(series_id: str, start: str, end: str):
    """Try live FRED; fall back to generated demo data."""
    import pandas as pd
    try:
        client = get_fred_client()
        df = client.fetch_series(series_id, observation_start=start, observation_end=end)
        df = df.dropna(subset=["value"])
        return (
            df["date"].dt.strftime("%Y-%m-%d").tolist(),
            df["value"].tolist(),
            False,  # is_demo
        )
    except Exception:
        dates, values = _generate_demo_series(series_id, start, end)
        return dates, values, True


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html", series_meta=SERIES_META)


@app.route("/api/series/<series_id>")
def get_series(series_id):
    if series_id not in SERIES_META:
        return jsonify({"error": "Unknown series"}), 404

    start = request.args.get("start", (datetime.now() - timedelta(days=5 * 365)).strftime("%Y-%m-%d"))
    end   = request.args.get("end",   datetime.now().strftime("%Y-%m-%d"))

    dates, values, is_demo = _series_data(series_id, start, end)
    return jsonify({
        "series_id": series_id,
        "meta":      SERIES_META[series_id],
        "dates":     dates,
        "values":    values,
        "demo":      is_demo,
    })


@app.route("/api/mid_month_snapshot")
def mid_month_snapshot():
    """
    Returns mid-month (~15th) and end-of-month observations for a series so
    they can be compared against the official FRED monthly release.
    """
    import pandas as pd

    series_id = request.args.get("series_id", "CPIAUCSL")
    start     = request.args.get("start", "2018-01-01")
    end       = request.args.get("end",   datetime.now().strftime("%Y-%m-%d"))

    dates, values, is_demo = _series_data(series_id, start, end)

    df = pd.DataFrame({"date": pd.to_datetime(dates), "value": values})
    df["day"]   = df["date"].dt.day
    df["month"] = df["date"].dt.to_period("M")

    # Mid-month: observation closest to day 15
    mid_obs = (
        df.assign(dist_from_15=(df["day"] - 15).abs())
        .sort_values(["month", "dist_from_15"])
        .drop_duplicates("month", keep="first")
        .sort_values("date")
    )
    # End-of-month: last observation per month
    eom_obs = (
        df.sort_values("date")
        .drop_duplicates("month", keep="last")
        .sort_values("date")
    )

    return jsonify({
        "series_id": series_id,
        "meta": SERIES_META.get(series_id, {}),
        "demo": is_demo,
        "mid_month": {
            "dates":  mid_obs["date"].dt.strftime("%Y-%m-%d").tolist(),
            "values": mid_obs["value"].tolist(),
        },
        "end_of_month": {
            "dates":  eom_obs["date"].dt.strftime("%Y-%m-%d").tolist(),
            "values": eom_obs["value"].tolist(),
        },
    })


@app.route("/api/mispricing")
def mispricing():
    """
    Monthly mispricing score = (EOM_actual − mid_month_proxy) / mid_month_proxy × 100.
    Positive = data came in higher than mid-month signal (upside surprise).
    Negative = downside surprise.
    """
    import pandas as pd

    series_id = request.args.get("series_id", "CPIAUCSL")
    start     = request.args.get("start", "2018-01-01")
    end       = request.args.get("end",   datetime.now().strftime("%Y-%m-%d"))

    dates, values, is_demo = _series_data(series_id, start, end)

    df = pd.DataFrame({"date": pd.to_datetime(dates), "value": values})
    df["month"] = df["date"].dt.to_period("M")

    mid = (
        df.assign(dist=(df["date"].dt.day - 15).abs())
        .sort_values(["month", "dist"])
        .drop_duplicates("month", keep="first")
        .rename(columns={"value": "mid_value", "date": "mid_date"})
        [["month", "mid_date", "mid_value"]]
    )
    eom = (
        df.sort_values("date")
        .drop_duplicates("month", keep="last")
        .rename(columns={"value": "eom_value", "date": "eom_date"})
        [["month", "eom_date", "eom_value"]]
    )

    merged = mid.merge(eom, on="month")
    denom  = merged["mid_value"].replace(0, float("nan"))
    merged["score"] = ((merged["eom_value"] - merged["mid_value"]) / denom) * 100
    merged = merged.dropna(subset=["score"])

    return jsonify({
        "series_id":  series_id,
        "meta":       SERIES_META.get(series_id, {}),
        "demo":       is_demo,
        "months":     merged["eom_date"].dt.strftime("%Y-%m-%d").tolist(),
        "mid_values": merged["mid_value"].tolist(),
        "eom_values": merged["eom_value"].tolist(),
        "scores":     merged["score"].round(4).tolist(),
    })


@app.route("/api/series_list")
def series_list():
    return jsonify(SERIES_META)


if __name__ == "__main__":
    app.run(debug=False, host="127.0.0.1", port=5050)
