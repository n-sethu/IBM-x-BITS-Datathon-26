from kalshi_python_sync import Configuration, KalshiClient
import os
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()
    
# put kalshi private key in a .pem file in root
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
key_path = os.path.join(BASE_DIR, "..", "kalshi_private.pem")

# Configure the client
config = Configuration(
    host="https://api.elections.kalshi.com/trade-api/v2",
)

# For authenticated requests
# Read private key from file
with open(key_path, "r") as f:
    private_key = f.read()

config.api_key_id = os.getenv("KALSHI_KEY_ID")
config.private_key_pem = private_key

# Initialize the client
client = KalshiClient(config)



now_ms = int(datetime.now().timestamp() * 1000)
seven_days_ago_ms = now_ms - (7 * 24 * 3600 * 1000)


# everything seems to be ok up to this point, however there are problems upon trying to
# query a specific event

# most recent unemployment event clearly shows up in result
result = client._events_api.get_events(series_ticker="KXU3")
print(result)



# but for some reason, this does not work, though we use the same tickers and valid inputs
# error is bad request

result = client._events_api.get_event_forecast_percentiles_history(
    ticker="KXU3-26FEB",
    series_ticker="KXU3",
    percentiles=[5000],
    start_ts=seven_days_ago_ms,
    end_ts=now_ms - (24 * 3600 * 1000),  # end yesterday
    period_interval=1440
)

print(result)
