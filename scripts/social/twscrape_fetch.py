import asyncio
import json
import os
import sys
from datetime import datetime, timezone
from typing import Any

DEFAULT_OFFICIAL_ACCOUNTS = [
    "pid_gov",
    "pmoindia",
    "spokespersonmod",
    "dawn_com",
    "geoenglish",
    "xinhua",
    "globaltimesnews",
    "cgtnofficial",
    "reutersworld",
    "afp",
    "ap",
    "bbcworld",
]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_accounts() -> list[dict[str, str]]:
    raw = os.getenv("TWITTER_SCRAPER_ACCOUNTS_JSON", "").strip()
    if not raw:
        raise RuntimeError(
            "Missing TWITTER_SCRAPER_ACCOUNTS_JSON. Add at least one account in .env.local."
        )
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError("TWITTER_SCRAPER_ACCOUNTS_JSON is not valid JSON.") from exc

    if not isinstance(parsed, list) or len(parsed) == 0:
        raise RuntimeError("TWITTER_SCRAPER_ACCOUNTS_JSON must be a non-empty array.")

    required = ["username", "password", "email", "email_password"]
    for idx, item in enumerate(parsed):
        if not isinstance(item, dict):
            raise RuntimeError(f"Account at index {idx} must be an object.")
        for field in required:
            if not str(item.get(field, "")).strip():
                raise RuntimeError(
                    f"Account at index {idx} is missing required field '{field}'."
                )
    return parsed


def parse_keywords() -> list[str]:
    raw = os.getenv("TWITTER_SCRAPER_KEYWORDS", "").strip()
    if raw:
        return [part.strip().lower() for part in raw.split(",") if part.strip()]

    return [
        "pakistan",
        "china",
        "afghanistan",
        "drone",
        "military",
        "bomb",
        "tank",
        "jet",
        "fighter planes",
        "war",
        "fights",
        "riots",
        "politics",
        "army",
        "navy",
        "soldiers",
        "guns",
    ]


def parse_official_accounts() -> list[str]:
    raw = os.getenv("TWITTER_SCRAPER_OFFICIAL_ACCOUNTS", "").strip()
    configured = [
        handle.strip().lstrip("@").lower()
        for handle in raw.split(",")
        if handle.strip()
    ]
    combined = list(dict.fromkeys(configured + DEFAULT_OFFICIAL_ACCOUNTS))
    max_accounts = safe_int(os.getenv("TWITTER_SCRAPER_MAX_OFFICIAL_ACCOUNTS", "12"))
    max_accounts = max(1, min(max_accounts, 30))
    return combined[:max_accounts]


def safe_int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def serialize_tweet(tweet: Any, source: str) -> dict[str, Any] | None:
    tweet_id = getattr(tweet, "id", None)
    user = getattr(tweet, "user", None)
    username = getattr(user, "username", None)
    if not tweet_id or not username:
        return None

    raw_content = getattr(tweet, "rawContent", None) or getattr(tweet, "content", "")
    if not raw_content:
        return None

    created = getattr(tweet, "date", None)
    created_at = created.isoformat() if created else now_iso()
    display_name = getattr(user, "displayname", None) or username
    is_verified = bool(getattr(user, "verified", False))

    return {
        "id": str(tweet_id),
        "username": username,
        "displayName": str(display_name),
        "text": str(raw_content),
        "createdAt": created_at,
        "url": f"https://x.com/{username}/status/{tweet_id}",
        "likeCount": safe_int(getattr(tweet, "likeCount", 0)),
        "replyCount": safe_int(getattr(tweet, "replyCount", 0)),
        "retweetCount": safe_int(getattr(tweet, "retweetCount", 0)),
        "quoteCount": safe_int(getattr(tweet, "quoteCount", 0)),
        "lang": getattr(tweet, "lang", None),
        "isVerified": is_verified,
        "source": source,
    }


def make_query_from_keywords(keywords: list[str]) -> str:
    parts = []
    for keyword in keywords:
        if " " in keyword:
            parts.append(f'"{keyword}"')
        else:
            parts.append(keyword)
    return "(" + " OR ".join(parts) + ") lang:en -is:retweet"


def make_official_query(handle: str, keywords: list[str]) -> str:
    keyword_query = make_query_from_keywords(keywords)
    return f"from:{handle} {keyword_query}"


async def scrape() -> dict[str, Any]:
    try:
        from twscrape import API, AccountsPool  # type: ignore
    except Exception as exc:
        raise RuntimeError(
            "twscrape is not installed. Run: pip install -r requirements-social.txt"
        ) from exc

    accounts = parse_accounts()
    keywords = parse_keywords()
    official_accounts = parse_official_accounts()
    total_limit = safe_int(os.getenv("TWITTER_SCRAPER_LIMIT", "120"))
    total_limit = max(20, min(total_limit, 500))

    pool = AccountsPool()
    for account in accounts:
        await pool.add_account(
            account["username"],
            account["password"],
            account["email"],
            account["email_password"],
        )

    await pool.login_all()

    api = API(pool)
    tweets: list[dict[str, Any]] = []

    search_limit = int(total_limit * 0.7)
    official_limit_per_account = max(
        3, int(total_limit * 0.3 / max(1, len(official_accounts)))
    )

    query = make_query_from_keywords(keywords)
    async for tweet in api.search(query, limit=search_limit):
        serialized = serialize_tweet(tweet, "search")
        if serialized:
            tweets.append(serialized)

    for handle in official_accounts:
        official_query = make_official_query(handle, keywords)
        async for tweet in api.search(official_query, limit=official_limit_per_account):
            serialized = serialize_tweet(tweet, "official")
            if serialized:
                tweets.append(serialized)

    deduped = {tweet["id"]: tweet for tweet in tweets}

    return {
        "tweets": list(deduped.values()),
        "meta": {
            "fetchedAt": now_iso(),
            "keywords": keywords,
            "totalFetched": len(deduped),
            "officialAccounts": official_accounts,
        },
    }


def main() -> int:
    try:
        payload = asyncio.run(scrape())
        print(json.dumps(payload, ensure_ascii=True))
        return 0
    except Exception as exc:
        sys.stderr.write(str(exc).strip() + "\n")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
