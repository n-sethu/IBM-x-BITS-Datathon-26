import requests

API_KEY = "" # I don't know how to get this in an env file, pls put it urself


url = f"https://api.stlouisfed.org/fred/series/observations?series_id=GDP&api_key={API_KEY}&file_type=json"

data = requests.get(url)

data = data.json()


print(data)