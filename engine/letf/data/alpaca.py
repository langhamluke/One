"""Alpaca options data (free Basic tier = indicative feed; Algo Trader Plus = real-time OPRA).

Env: ALPACA_API_KEY, ALPACA_SECRET_KEY, optional ALPACA_PAPER=1 (default), ALPACA_OPTIONS_FEED=indicative|opra.
Endpoints (documented by Alpaca):
  Trading API  GET {trading}/v2/options/contracts?underlying_symbols=QQQ&expiration_date_gte=..&limit=10000
               -> open_interest, open_interest_date, strike_price, expiration_date, type, symbol
  Data API     GET https://data.alpaca.markets/v1beta1/options/snapshots/{underlying}?feed=indicative&limit=1000
               -> per OCC symbol: latestQuote(bp/ap), latestTrade, impliedVolatility, greeks{delta,gamma,theta,vega,rho}
  Stock spot   GET https://data.alpaca.markets/v2/stocks/{symbol}/trades/latest?feed=iex
Rate limits: Basic 200 req/min. We page snapshots with next_page_token.
"""
from __future__ import annotations

import os
import time
from datetime import datetime, timedelta, timezone

import pandas as pd
import requests

from .base import ChainSnapshot

DATA = "https://data.alpaca.markets"


class AlpacaProvider:
    name = "alpaca"

    def __init__(self, key: str | None = None, secret: str | None = None, paper: bool | None = None, feed: str | None = None, timeout: float = 30.0):
        self.key = key or os.environ.get("ALPACA_API_KEY", "")
        self.secret = secret or os.environ.get("ALPACA_SECRET_KEY", "")
        if not self.key or not self.secret:
            raise RuntimeError("ALPACA_API_KEY / ALPACA_SECRET_KEY not set")
        if paper is None:
            paper = os.environ.get("ALPACA_PAPER", "1") != "0"
        self.trading = "https://paper-api.alpaca.markets" if paper else "https://api.alpaca.markets"
        self.feed = feed or os.environ.get("ALPACA_OPTIONS_FEED", "indicative")
        self.s = requests.Session()
        self.s.headers.update({"APCA-API-KEY-ID": self.key, "APCA-API-SECRET-KEY": self.secret, "Accept": "application/json"})
        self.timeout = timeout

    def _get(self, url: str, **params) -> dict:
        for attempt in range(4):
            r = self.s.get(url, params=params, timeout=self.timeout)
            if r.status_code == 429:
                time.sleep(2 ** attempt)
                continue
            r.raise_for_status()
            return r.json()
        raise RuntimeError(f"Alpaca rate limited: {url}")

    def spot(self, symbol: str) -> float:
        j = self._get(f"{DATA}/v2/stocks/{symbol}/trades/latest", feed="iex")
        return float(j["trade"]["p"])

    def contracts(self, symbol: str, max_dte: int) -> pd.DataFrame:
        today = datetime.now(timezone.utc).date()
        rows, token = [], None
        while True:
            params = dict(underlying_symbols=symbol, expiration_date_gte=today.isoformat(),
                          expiration_date_lte=(today + timedelta(days=max_dte)).isoformat(), limit=10000, status="active")
            if token:
                params["page_token"] = token
            j = self._get(f"{self.trading}/v2/options/contracts", **params)
            rows.extend(j.get("option_contracts", []))
            token = j.get("next_page_token")
            if not token:
                break
        df = pd.DataFrame(rows)
        if df.empty:
            return df
        return pd.DataFrame({
            "occ": df["symbol"], "expiration": pd.to_datetime(df["expiration_date"]).dt.date,
            "strike": pd.to_numeric(df["strike_price"]), "type": df["type"].str.lower(),
            "open_interest": pd.to_numeric(df.get("open_interest"), errors="coerce"),
            "open_interest_date": df.get("open_interest_date"),
        })

    def snapshots(self, symbol: str) -> dict:
        out, token = {}, None
        while True:
            params = dict(feed=self.feed, limit=1000)
            if token:
                params["page_token"] = token
            j = self._get(f"{DATA}/v1beta1/options/snapshots/{symbol}", **params)
            out.update(j.get("snapshots", {}))
            token = j.get("next_page_token")
            if not token:
                break
        return out

    def chain(self, symbol: str, max_dte: int = 60) -> ChainSnapshot:
        spot = self.spot(symbol)
        con = self.contracts(symbol, max_dte)
        snaps = self.snapshots(symbol)
        rows = []
        for _, c in con.iterrows():
            s = snaps.get(c["occ"], {})
            q = s.get("latestQuote", {}) or {}
            g = s.get("greeks", {}) or {}
            rows.append({
                "underlying": symbol, "expiration": c["expiration"], "strike": c["strike"], "type": c["type"],
                "bid": q.get("bp"), "ask": q.get("ap"), "mark": None, "iv": s.get("impliedVolatility"),
                "delta": g.get("delta"), "gamma": g.get("gamma"), "theta": g.get("theta"), "vega": g.get("vega"), "rho": g.get("rho"),
                "open_interest": c["open_interest"], "volume": (s.get("dailyBar") or {}).get("v"),
                "updated_at": q.get("t"), "occ": c["occ"],
            })
        df = pd.DataFrame(rows)
        return ChainSnapshot(symbol=symbol, spot=spot, as_of=datetime.now(timezone.utc), chain=df, source=f"alpaca:{self.feed}")
