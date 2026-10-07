"""CBOE delayed quotes JSON (free, no auth, ~15 min delayed, OI end-of-day).

Endpoint pattern used by most open GEX tools:
  https://cdn.cboe.com/api/global/delayed_quotes/options/{SYM}.json  (ETFs/stocks)
  https://cdn.cboe.com/api/global/delayed_quotes/options/_{SYM}.json (indices: _SPX, _NDX, _VIX)
No terms-of-service guarantee; treat as best-effort and fall back to another provider.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone

import pandas as pd
import requests

from .base import ChainSnapshot

BASE = "https://cdn.cboe.com/api/global/delayed_quotes/options/{}.json"
OCC_RE = re.compile(r"^(?P<root>[A-Z]+)(?P<ymd>\d{6})(?P<cp>[CP])(?P<strike>\d{8})$")


def parse_occ(sym: str):
    m = OCC_RE.match(sym.strip())
    if not m:
        return None
    exp = datetime.strptime(m["ymd"], "%y%m%d").date()
    return m["root"], exp, ("call" if m["cp"] == "C" else "put"), int(m["strike"]) / 1000.0


class CboeProvider:
    name = "cboe"

    def __init__(self, session: requests.Session | None = None, timeout: float = 20.0):
        self.session = session or requests.Session()
        self.session.headers.update({"User-Agent": "Mozilla/5.0 (letf-engine)"})
        self.timeout = timeout

    def _fetch(self, symbol: str) -> dict:
        sym = symbol.upper()
        candidates = [sym] if not sym.startswith("_") else [sym]
        if sym in ("SPX", "NDX", "VIX", "RUT", "XSP"):
            candidates = ["_" + sym, sym]
        last = None
        for c in candidates:
            r = self.session.get(BASE.format(c), timeout=self.timeout)
            if r.ok:
                return r.json()
            last = r
        raise RuntimeError(f"CBOE fetch failed for {symbol}: {getattr(last, 'status_code', '?')}")

    def spot(self, symbol: str) -> float:
        return float(self._fetch(symbol)["data"]["current_price"])

    def chain(self, symbol: str, max_dte: int = 60) -> ChainSnapshot:
        payload = self._fetch(symbol)
        data = payload["data"]
        spot = float(data["current_price"])
        ts = data.get("timestamp")
        try:
            as_of = pd.to_datetime(ts).tz_localize("America/New_York").tz_convert("UTC").to_pydatetime()
        except Exception:
            as_of = datetime.now(timezone.utc)
        rows = []
        for o in data.get("options", []):
            p = parse_occ(o.get("option", ""))
            if not p:
                continue
            root, exp, cp, strike = p
            rows.append({
                "underlying": symbol.upper().lstrip("_"), "expiration": exp, "strike": strike, "type": cp,
                "bid": o.get("bid"), "ask": o.get("ask"), "mark": None, "iv": o.get("iv"),
                "delta": o.get("delta"), "gamma": o.get("gamma"), "theta": o.get("theta"),
                "vega": o.get("vega"), "rho": o.get("rho"), "open_interest": o.get("open_interest"),
                "volume": o.get("volume"), "updated_at": ts, "last": o.get("last_trade_price"), "theo": o.get("theo"),
            })
        df = pd.DataFrame(rows)
        today = as_of.astimezone(timezone.utc).date()
        df = df[(pd.to_datetime(df["expiration"]).dt.date - today).apply(lambda d: d.days) <= max_dte]
        return ChainSnapshot(symbol=symbol.upper().lstrip("_"), spot=spot, as_of=as_of, chain=df.reset_index(drop=True), source="cboe")
