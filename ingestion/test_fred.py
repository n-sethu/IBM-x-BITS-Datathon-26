from fred_client import FredClient

client = FredClient()

# Real GDP chained dollars (example you gave: GNPCA)
df = client.fetch_series("GNPCA")

print(df.head())

client.save_raw(df, "GNPCA")