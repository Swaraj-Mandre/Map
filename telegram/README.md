# Telegram bundle

This folder contains the Telegram ingestion and reporting code only.

Included:

- `src/app/api/telegram/report/route.ts`
- `src/app/api/telegram/refresh/route.ts`
- `src/lib/telegram/*`
- `scripts/telegram/*`
- `.env.telegram.example`
- `requirements-telegram.txt`

What is intentionally not included:

- dashboard or UI pages
- Bright Data or social/X code
- generated cache data

To use it in another Next.js project, copy the folder contents into that project and keep the same `src/` and `scripts/` layout, or update the import paths to match your target structure.
