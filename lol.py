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

# Keep only rows between 2000 and 2026 (extra safety)
macro_df = macro_df[(macro_df['date'] >= "2000-01-01") & (macro_df['date'] <= "2026-12-31")]

print(macro_df.head())
print(macro_df.tail())
print(df.info())
macro_df["T10Y2Y"].dropna(inplace=True)

# Create visualizations
fig, axes = plt.subplots(3, 3, figsize=(15, 12))
fig.suptitle('FRED Economic Indicators (2000-2026)', fontsize=16, fontweight='bold')

indicators = ["FEDFUNDS", "T10Y2Y", "HOUSTNSA", "PERMITNSA", 
              "CPIAUCSL", "CPILFESL", "PCEPI", "PCEPILFE", "UNRATE"]

for idx, (ax, indicator) in enumerate(zip(axes.flat, indicators)):
    ax.plot(macro_df['date'], macro_df[indicator], linewidth=2, color='steelblue')
    ax.set_title(indicator, fontweight='bold')
    ax.grid(True, alpha=0.3)
    ax.tick_params(axis='x', rotation=45)
    ax.set_xlabel('Date')
    ax.set_ylabel('Value')

plt.tight_layout()
plt.savefig('economic_indicators.png', dpi=300, bbox_inches='tight')
print("\nGraph saved as 'economic_indicators.png'")
plt.show()

