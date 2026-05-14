import os
from telethon import TelegramClient
from telethon.sessions import StringSession


def prompt(value: str, label: str) -> str:
    if value:
        return value
    return input(label).strip()


def main() -> None:
    api_id = prompt(os.getenv("TELEGRAM_API_ID", ""), "Enter TELEGRAM_API_ID: ")
    api_hash = prompt(os.getenv("TELEGRAM_API_HASH", ""), "Enter TELEGRAM_API_HASH: ")
    phone = prompt(os.getenv("TELEGRAM_PHONE", ""), "Enter Telegram phone number (e.g. +92...): ")

    with TelegramClient(StringSession(), int(api_id), api_hash) as client:
        client.start(phone=phone)
        session_str = client.session.save()
        print("\nTELEGRAM_SESSION (save this in .env.local):\n")
        print(session_str)


if __name__ == "__main__":
    main()
