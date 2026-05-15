# Threat Intel Dashboard

A single-purpose interactive web application for geospatial intelligence visualization.

## What this app includes

- Unified map-centric dashboard
- 3D Globe and 2D Mercator projection switching
- Toggleable layers (markers, routes/arcs, clusters)
- Alternate views:
  - POI movement tracking
  - Country-level activity
  - Bilateral activity flows
- Threat feed panel with severity and map-linked events
- LLM-style analyst chat panel for deep-dive queries

## Run locally

```bash
npm install
npm run dev
```

## Telegram channel ingestion (Telethon)

This project can ingest the latest messages from public Telegram channels using Telethon.

### 1) Install Python dependency

```bash
pip install -r requirements-telegram.txt
```

### 2) Configure environment

1. Copy `.env.telegram.example` into `.env.local`.
2. Create a Telegram app at https://my.telegram.org to get `TELEGRAM_API_ID` and `TELEGRAM_API_HASH`.
3. Generate a session string:

```bash
python scripts/telegram/generate_session.py
```

4. Paste the printed `TELEGRAM_SESSION` into `.env.local`.
5. Set `TELEGRAM_CHANNELS` to the channels you want to monitor.

### 3) Use Telegram APIs

- `GET /api/telegram/report`  
  Returns the current cached report with the most recent messages.

- `POST /api/telegram/refresh`  
  Fetches latest messages from configured channels and updates cache.

## Bright Data X ingestion

This project can ingest recent X (Twitter) posts using Bright Data datasets.

### 1) Configure environment

1. Copy `.env.brightdata.example` into `.env.local`.
2. Set `BRIGHTDATA_API_TOKEN` to your Bright Data API token.
3. Set `BRIGHTDATA_DATASET_ID` to your dataset ID (e.g. `gd_lwxkxvnf1cynvib9co`).
4. Set `BRIGHTDATA_PROFILE_URLS` to a comma-separated list of X profile URLs.
5. Set `BRIGHTDATA_DISCOVERY_TYPE` to `profile_url_most_recent_posts` for "Discover by profile url most recent posts".
  The app also accepts the Bright Data dashboard URL for that configuration and normalizes it.

### 2) Use Bright Data APIs

- `GET /api/brightdata/report`  
  Returns the current cached report with the most recent posts.

- `POST /api/brightdata/refresh`  
  Triggers a dataset run, waits for the snapshot to be ready, and updates cache.
