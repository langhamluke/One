"""Free sentiment/idea sources. Every fetcher returns a list of Item and never raises.

Sources (all free, no API keys):
  * RSS feeds (ZeroHedge, Seeking Alpha market news, CNBC, Google News queries, any Substack <pub>.substack.com/feed)
  * Reddit public JSON (r/wallstreetbets, r/options, r/LETFs) — no credentials, modest rate limit
  * Telegram public channel web preview (t.me/s/<channel>) — e.g. Walter Bloomberg (DeItaone) mirrors
  * TradingView ideas via the `tradingview-scraper` package when installed (optional)
Paid sources (Unusual Whales, SpotGamma, X API) are intentionally not scraped.
"""
from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Iterable

try:
    import feedparser
except Exception:  # pragma: no cover
    feedparser = None
try:
    import requests
    from bs4 import BeautifulSoup
except Exception:  # pragma: no cover
    requests = None
    BeautifulSoup = None

UA = {"User-Agent": "Mozilla/5.0 (compatible; letf-engine/0.1; +https://github.com/langhamluke/One)"}

DEFAULT_FEEDS = {
    "zerohedge": "https://feeds.feedburner.com/zerohedge/feed",
    "seekingalpha_market": "https://seekingalpha.com/market_currents.xml",
    "cnbc_markets": "https://www.cnbc.com/id/20910258/device/rss/rss.html",
    "gnews_nasdaq": "https://news.google.com/rss/search?q=Nasdaq+OR+%22S%26P+500%22+stocks&hl=en-US&gl=US&ceid=US:en",
    "gnews_fed": "https://news.google.com/rss/search?q=Federal+Reserve+rates&hl=en-US&gl=US&ceid=US:en",
    "gnews_geopolitics": "https://news.google.com/rss/search?q=Iran+OR+tariff+OR+ceasefire+OR+shutdown+markets&hl=en-US&gl=US&ceid=US:en",
}
DEFAULT_SUBREDDITS = ["wallstreetbets", "options", "LETFs", "stocks"]
DEFAULT_TELEGRAM = ["DeItaone"]  # Walter Bloomberg's public channel handle


@dataclass
class Item:
    source: str
    title: str
    text: str = ""
    url: str = ""
    published: datetime | None = None
    score: float | None = None   # filled by scorer
    meta: dict = field(default_factory=dict)


def fetch_rss(feeds: dict[str, str] | None = None, max_items: int = 40, timeout: float = 15.0) -> list[Item]:
    if feedparser is None or requests is None:
        return []
    feeds = feeds or DEFAULT_FEEDS
    out: list[Item] = []
    for name, url in feeds.items():
        try:
            r = requests.get(url, headers=UA, timeout=timeout)
            d = feedparser.parse(r.content)
            for e in d.entries[:max_items]:
                pub = None
                if getattr(e, "published_parsed", None):
                    pub = datetime(*e.published_parsed[:6], tzinfo=timezone.utc)
                out.append(Item(name, e.get("title", ""), re.sub("<[^>]+>", " ", e.get("summary", ""))[:600], e.get("link", ""), pub))
        except Exception:
            continue
    return out


def fetch_reddit(subreddits: Iterable[str] | None = None, limit: int = 50, timeout: float = 15.0) -> list[Item]:
    if requests is None:
        return []
    out: list[Item] = []
    for sub in (subreddits or DEFAULT_SUBREDDITS):
        try:
            r = requests.get(f"https://www.reddit.com/r/{sub}/hot.json", params={"limit": limit}, headers=UA, timeout=timeout)
            if r.status_code != 200:
                continue
            for c in r.json().get("data", {}).get("children", []):
                d = c.get("data", {})
                out.append(Item(f"reddit/{sub}", d.get("title", ""), (d.get("selftext") or "")[:600], "https://www.reddit.com" + d.get("permalink", ""),
                                datetime.fromtimestamp(d.get("created_utc", 0), tz=timezone.utc),
                                meta={"ups": d.get("ups", 0), "comments": d.get("num_comments", 0), "flair": d.get("link_flair_text")}))
            time.sleep(1.0)
        except Exception:
            continue
    return out


def fetch_telegram(channels: Iterable[str] | None = None, timeout: float = 15.0) -> list[Item]:
    """Public channel web preview; no login. Returns the ~20 latest posts."""
    if requests is None or BeautifulSoup is None:
        return []
    out: list[Item] = []
    for ch in (channels or DEFAULT_TELEGRAM):
        try:
            r = requests.get(f"https://t.me/s/{ch}", headers=UA, timeout=timeout)
            if r.status_code != 200:
                continue
            soup = BeautifulSoup(r.text, "lxml")
            for msg in soup.select("div.tgme_widget_message_wrap"):
                t = msg.select_one("div.tgme_widget_message_text")
                tm = msg.select_one("time")
                if not t:
                    continue
                pub = None
                if tm and tm.get("datetime"):
                    try:
                        pub = datetime.fromisoformat(tm["datetime"].replace("Z", "+00:00"))
                    except Exception:
                        pub = None
                out.append(Item(f"telegram/{ch}", t.get_text(" ", strip=True)[:300], "", f"https://t.me/s/{ch}", pub))
        except Exception:
            continue
    return out


def fetch_tradingview_ideas(symbols: Iterable[str] = ("QQQ", "SPY", "TQQQ"), limit: int = 20) -> list[Item]:
    """Optional: pip install tradingview-scraper. Returns [] if unavailable."""
    out: list[Item] = []
    try:
        from tradingview_scraper.symbols.ideas import Ideas  # type: ignore
    except Exception:
        return out
    for s in symbols:
        try:
            ideas = Ideas(export_result=False).scrape(symbol=s, startPage=1, endPage=1)
            for i in list(ideas)[:limit]:
                out.append(Item(f"tv_ideas/{s}", i.get("title", ""), (i.get("description") or i.get("paragraph") or "")[:600], i.get("url", ""),
                                meta={"strategy": i.get("strategy") or i.get("label"), "boosts": i.get("boosts")}))
        except Exception:
            continue
    return out
