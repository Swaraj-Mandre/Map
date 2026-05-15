import asyncio
import json
import os
from datetime import datetime, timezone
from typing import Any

from telethon import TelegramClient
from telethon.sessions import StringSession


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_channels() -> list[str]:
    raw = os.getenv("TELEGRAM_CHANNELS", "")
    channels = [item.strip() for item in raw.split(",") if item.strip()]
    if not channels:
        raise RuntimeError("Missing TELEGRAM_CHANNELS in .env.local.")
    return channels


def normalize_channel(value: str) -> str:
    value = value.strip()
    if value.startswith("https://t.me/"):
        return value.replace("https://t.me/", "").strip("/")
    if value.startswith("t.me/"):
        return value.replace("t.me/", "").strip("/")
    return value


def build_message_url(username: str | None, message_id: int, channel_id: int) -> str:
    if username:
        return f"https://t.me/{username}/{message_id}"
    return f"https://t.me/c/{abs(channel_id)}/{message_id}"


def safe_text(message: Any) -> str:
    text = message.message or ""
    return " ".join(text.split()).strip()


async def fetch() -> dict[str, Any]:
    api_id_raw = os.getenv("TELEGRAM_API_ID", "").strip()
    api_hash = os.getenv("TELEGRAM_API_HASH", "").strip()
    session = os.getenv("TELEGRAM_SESSION", "").strip()
    if not api_id_raw or not api_hash or not session:
        raise RuntimeError(
            "Missing TELEGRAM_API_ID / TELEGRAM_API_HASH / TELEGRAM_SESSION in .env.local."
        )

    api_id = int(api_id_raw)
    limit = int(os.getenv("TELEGRAM_LIMIT", "20"))
    channels = parse_channels()

    client = TelegramClient(StringSession(session), api_id, api_hash)
    await client.start()

    messages: list[dict[str, Any]] = []
    for channel in channels:
        handle = normalize_channel(channel)
        entity = await client.get_entity(handle)
        channel_id = int(getattr(entity, "id", 0))
        channel_title = getattr(entity, "title", handle)
        channel_username = getattr(entity, "username", None)

        async for msg in client.iter_messages(entity, limit=limit):
            text = safe_text(msg)
            if not text:
                continue
            messages.append(
                {
                    "id": f"{channel_id}:{msg.id}",
                    "channelId": str(channel_id),
                    "channelTitle": str(channel_title),
                    "channelUsername": channel_username,
                    "messageId": msg.id,
                    "text": text,
                    "createdAt": msg.date.isoformat() if msg.date else now_iso(),
                    "url": build_message_url(channel_username, msg.id, channel_id),
                }
            )

    await client.disconnect()

    return {
        "messages": messages,
        "meta": {
            "fetchedAt": now_iso(),
            "channels": channels,
            "totalFetched": len(messages),
        },
    }


def main() -> None:
    payload = asyncio.run(fetch())
    print(json.dumps(payload, ensure_ascii=True))


if __name__ == "__main__":
    main()
