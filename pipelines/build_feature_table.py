import pandas as pd
from ingestion.fred_client import FredClient
from ingestion.kalshi_client import KalshiClient

# Initialize clients
fred = FredClient()
kalshi = KalshiClient()

# --- Step 1: Pull macro series ---
fred_series = {
    "GDP": "GDPC1",
    "Unemployment": "UNRATE",
    "Inflation": "CPIAUCSL",
    "FedFunds": "FEDFUNDS",
    "Recession": "USREC"
}

macro_dfs = {name: fred.fetch_series(sid) for name, sid in fred_series.items()}

# Merge macro into single df by date
macro_df = pd.concat(
    [df.rename(columns={"value": name}) for name, df in macro_dfs.items()],
    axis=1
)
macro_df = macro_df.loc[:,~macro_df.columns.duplicated()]  # drop duplicate date columns
macro_df["date"] = macro_dfs["GDP"]["date"]  # align on GDP quarterly for simplicity
macro_df = macro_df.sort_values("date").reset_index(drop=True)

# --- Step 2: Pull mid-month Kalshi snapshots ---
kalshi_markets = [
    "US-Recession-2026-02",
    "CPI-Above-4pct-2026-02",
    "Fed-Rate-Hike-March-2026",
    "GDP-Growth-Q1-2026"
]

# Example: snapshot = 15th of each month
snapshot_date = "2026-02-15"
kalshi_df = kalshi.fetch_many(kalshi_markets, snapshot_date)

# --- Step 3: Merge market + macro for feature table ---
# For simplicity, join by nearest month
macro_df["month"] = macro_df["date"].dt.to_period("M")
kalshi_df["month"] = pd.to_datetime(kalshi_df["snapshot_date"]).to_period("M")

feature_df = kalshi_df.merge(macro_df, how="left", on="month")
feature_df = feature_df.drop(columns=["month"])

# --- Step 4: Save feature table ---
feature_df.to_csv("data/processed/feature_table.csv", index=False)

print("Feature table ready:")
print(feature_df.head())