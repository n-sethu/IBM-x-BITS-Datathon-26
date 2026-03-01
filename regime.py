from ingestion.fred_client import FredClient
import pandas as pd
import matplotlib.pyplot as plt

fred = FredClient()

# Define monthly FRED series
monthly_fred_series = [
    "FEDFUNDS", "T10Y2Y", "HOUSTNSA", "PERMITNSA",
    "CPIAUCSL", "CPILFESL", "PCEPI", "PCEPILFE", "UNRATE"
]

dfs = []
for series_id in monthly_fred_series:
    df = fred.fetch_series(series_id, observation_start="2000-01-01", observation_end="2026-02-01")
    df = df.rename(columns={"value": series_id})
    dfs.append(df)

# Merge all series on date
from functools import reduce
macro_df = reduce(lambda left, right: pd.merge(left, right, on="date", how="left"), dfs)

macro_df = macro_df[(macro_df['date'] >= "2000-01-01") & (macro_df['date'] <= "2026-12-31")]
macro_numeric = macro_df.drop(columns=["date"])

means = macro_numeric.mean()
stds = macro_numeric.std()

normalized = (macro_numeric - means) / stds
normalized.dropna(inplace=True)

print(normalized)