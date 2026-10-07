"""Daily OHLCV history with a CSV cache. Uses yfinance at runtime when available;
falls back to the cache (data/cache/<SYM>_daily.csv) which is what tests and
offline backtests use."""
from __future__ import annotations

import os
from datetime import date

import pandas as pd

YF_MAP = {"VIX": "^VIX", "VXN": "^VXN", "VIX3M": "^VIX3M", "VIX9D": "^VIX9D", "SPX": "^GSPC", "NDX": "^NDX"}


def cache_path(cache_dir: str, symbol: str) -> str:
    return os.path.join(cache_dir, f"{symbol.upper()}_daily.csv")


def load_cached(cache_dir: str, symbol: str) -> pd.DataFrame | None:
    p = cache_path(cache_dir, symbol)
    if not os.path.exists(p):
        return None
    df = pd.read_csv(p, parse_dates=["date"]).sort_values("date").drop_duplicates("date")
    return df.set_index("date")


def daily(symbol: str, cache_dir: str = "data/cache", start: str = "2019-01-01", refresh: bool = True) -> pd.DataFrame:
    cached = load_cached(cache_dir, symbol)
    if refresh:
        try:
            import yfinance as yf  # optional dependency
            t = YF_MAP.get(symbol.upper(), symbol.upper())
            h = yf.Ticker(t).history(start=start, auto_adjust=False)
            if not h.empty:
                h = h.rename(columns=str.lower)[["open", "high", "low", "close", "volume"]]
                h.index = pd.to_datetime(h.index.date)
                h.index.name = "date"
                os.makedirs(cache_dir, exist_ok=True)
                h.to_csv(cache_path(cache_dir, symbol))
                return h
        except Exception:
            pass
    if cached is None:
        raise FileNotFoundError(f"no price history for {symbol} (no network and no cache)")
    return cached
