"""Score text items to a market-direction sentiment in [-1, 1].

Primary: pyfin-sentiment (MIT, trained on finance social posts) when installed.
Fallback: a small finance lexicon. Items are weighted by recency and, for Reddit,
by log(upvotes). Keyword flags detect geopolitical/risk-event chatter so the
engine can raise catalyst pressure even without a dated calendar entry.
"""
from __future__ import annotations

import math
import re
from datetime import datetime, timezone
from typing import Iterable

from .sources import Item

BULL = {"rally", "breakout", "bullish", "upgrade", "beat", "beats", "surge", "soar", "record high", "all-time high", "ath", "calls", "moon",
        "squeeze", "dovish", "cut", "cuts", "stimulus", "strong", "growth", "buy the dip", "btfd", "green", "ripping", "bid"}
BEAR = {"selloff", "sell-off", "crash", "bearish", "downgrade", "miss", "misses", "plunge", "tumble", "slump", "puts", "hawkish", "hike",
        "hikes", "recession", "default", "war", "strike", "shutdown", "tariff", "tariffs", "sanction", "red", "dump", "liquidation", "margin call",
        "bankrupt", "inflation hot", "yields spike", "contagion"}
RISK_EVENT = {"iran", "israel", "taiwan", "russia", "ukraine", "nuclear", "ceasefire", "missile", "shutdown", "debt ceiling", "deadline", "tariff",
              "emergency", "halt", "circuit breaker", "downgrade", "default"}

_model = None


def _pyfin():
    global _model
    if _model is None:
        try:
            from pyfin_sentiment.model import SentimentModel  # type: ignore
            _model = SentimentModel("small")
        except Exception:
            _model = False
    return _model or None


def lexicon_score(text: str) -> float:
    t = text.lower()
    b = sum(1 for w in BULL if w in t)
    s = sum(1 for w in BEAR if w in t)
    if b + s == 0:
        return 0.0
    return (b - s) / (b + s)


def score_item(item: Item) -> float:
    text = f"{item.title}. {item.text}".strip()
    m = _pyfin()
    if m is not None:
        try:
            lab = m.predict([text])[0]  # '1' negative, '2' neutral, '3' positive
            return {"1": -1.0, "2": 0.0, "3": 1.0}.get(str(lab), 0.0)
        except Exception:
            pass
    return lexicon_score(text)


def risk_flags(items: Iterable[Item]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for it in items:
        t = f"{it.title} {it.text}".lower()
        for k in RISK_EVENT:
            if k in t:
                counts[k] = counts.get(k, 0) + 1
    return dict(sorted(counts.items(), key=lambda kv: -kv[1]))


def aggregate(items: list[Item], now: datetime | None = None, half_life_hours: float = 12.0) -> dict:
    now = now or datetime.now(timezone.utc)
    num = den = 0.0
    by_source: dict[str, list[float]] = {}
    for it in items:
        sc = score_item(it)
        it.score = sc
        w = 1.0
        if it.published:
            age_h = max((now - it.published).total_seconds() / 3600, 0)
            w *= 0.5 ** (age_h / half_life_hours)
        if it.source.startswith("reddit") and it.meta.get("ups"):
            w *= 1 + math.log1p(it.meta["ups"]) / 5
        num += w * sc
        den += w
        by_source.setdefault(it.source.split("/")[0], []).append(sc)
    overall = num / den if den else 0.0
    return {
        "score": max(-1.0, min(1.0, overall)),
        "n_items": len(items),
        "by_source": {k: round(sum(v) / len(v), 3) for k, v in by_source.items() if v},
        "risk_flags": risk_flags(items),
        "model": "pyfin-sentiment" if _pyfin() is not None else "lexicon",
    }


def collect(use_rss=True, use_reddit=True, use_telegram=True, use_tv=False, feeds=None, subreddits=None, channels=None) -> tuple[dict, list[Item]]:
    from .sources import fetch_rss, fetch_reddit, fetch_telegram, fetch_tradingview_ideas
    items: list[Item] = []
    if use_rss:
        items += fetch_rss(feeds)
    if use_reddit:
        items += fetch_reddit(subreddits)
    if use_telegram:
        items += fetch_telegram(channels)
    if use_tv:
        items += fetch_tradingview_ideas()
    return aggregate(items), items
