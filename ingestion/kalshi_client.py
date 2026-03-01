import os
import requests
import time
import pandas as pd
from dotenv import load_dotenv
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

class KalshiClient:
    BASE_URL = "https://www.kalshi.com/api/v1/markets"

    def __init__(self, api_key=None):
        load_dotenv()
        self.api_key = api_key or os.getenv("KALSHI_API_KEY")
        if not self.api_key:
            raise ValueError("KALSHI_API_KEY not found")
        self.headers = {"Authorization": f"Bearer {self.api_key}"}
        
        # Setup session with retry strategy for handling 429 and other transient errors
        self.session = requests.Session()
        retry_strategy = Retry(
            total=5,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["HEAD", "GET", "OPTIONS"]
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        self.session.mount("https://", adapter)
        self.session.mount("http://", adapter)

    def fetch_market_prob(self, market_id, snapshot_date, max_retries=5):
    
        url = f"{self.BASE_URL}/{market_id}/prices"
        params = {"as_of": snapshot_date}

        for attempt in range(max_retries):
            resp = requests.get(url, headers=self.headers, params=params, timeout=30)
            if resp.status_code == 429:
                wait = 2 ** attempt
                print(f"429 hit, sleeping {wait}s...")
                time.sleep(wait)
                continue
            resp.raise_for_status()
            data = resp.json()
            return float(data.get("yes_price", 0)) / 100
        raise Exception(f"Failed to fetch {market_id} after {max_retries} retries due to 429")


    
    def fetch_many(self, market_ids: list[str], snapshot_date: str) -> pd.DataFrame:
        rows = []
        for mid in market_ids:
            prob = self.fetch_market_prob(mid, snapshot_date)
            rows.append({"market_id": mid, "snapshot_date": snapshot_date, "probability": prob})
            time.sleep(3)  # sleep 1 second between requests
        return pd.DataFrame(rows)