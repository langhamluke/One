from datetime import date, datetime, timezone, timedelta

import pandas as pd

from letf.data.cboe import parse_occ, CboeProvider
from letf.data.alpaca import AlpacaProvider
from letf.data.base import ChainSnapshot
from letf.sentiment.sources import Item
from letf.sentiment import score as sc


def test_occ_parse():
    assert parse_occ("SPY261016C00600000") == ("SPY", date(2026, 10, 16), "call", 600.0)
    assert parse_occ("SPXW261009P05800000") == ("SPXW", date(2026, 10, 9), "put", 5800.0)
    assert parse_occ("garbage") is None


class _Resp:
    def __init__(self, payload, status=200):
        self._p, self.status_code, self.ok = payload, status, status < 300
    def json(self):
        return self._p
    def raise_for_status(self):
        if not self.ok:
            raise RuntimeError(self.status_code)


def test_cboe_provider_parses_payload():
    prov = CboeProvider()
    payload = {"data": {"current_price": 600.0, "timestamp": "2026-10-07 15:30:00", "options": [
        {"option": "QQQ261016C00610000", "bid": 1.0, "ask": 1.2, "iv": 0.25, "delta": 0.3, "gamma": 0.01, "open_interest": 1000, "volume": 50},
        {"option": "QQQ261016P00590000", "bid": 1.1, "ask": 1.3, "iv": 0.28, "delta": -0.3, "gamma": 0.01, "open_interest": 2000, "volume": 70},
        {"option": "QQQ281215C00800000", "bid": 1, "ask": 2, "iv": 0.3, "open_interest": 1},
    ]}}
    prov.session.get = lambda url, timeout: _Resp(payload)
    snap = prov.chain("QQQ", max_dte=60)
    assert isinstance(snap, ChainSnapshot) and snap.spot == 600.0
    assert len(snap.chain) == 2 and set(snap.chain["type"]) == {"call", "put"}
    assert abs(snap.chain["mark"].iloc[0] - 1.1) < 1e-9


def test_alpaca_provider_merges_contracts_and_snapshots(monkeypatch):
    prov = AlpacaProvider(key="k", secret="s", paper=True, feed="indicative")
    exp = (datetime.now(timezone.utc) + timedelta(days=9)).date().isoformat()
    def fake_get(url, **params):
        if url.endswith("/trades/latest"):
            return {"trade": {"p": 100.5}}
        if "/options/contracts" in url:
            return {"option_contracts": [
                {"symbol": "TQQQ261016C00105000", "expiration_date": exp, "strike_price": "105", "type": "call", "open_interest": "1500"},
                {"symbol": "TQQQ261016P00095000", "expiration_date": exp, "strike_price": "95", "type": "put", "open_interest": "900"}], "next_page_token": None}
        if "/options/snapshots/" in url:
            return {"snapshots": {
                "TQQQ261016C00105000": {"latestQuote": {"bp": 2.0, "ap": 2.2, "t": "2026-10-07T15:00:00Z"}, "impliedVolatility": 0.9, "greeks": {"delta": 0.35, "gamma": 0.02, "theta": -0.1, "vega": 0.05, "rho": 0.0}},
                "TQQQ261016P00095000": {"latestQuote": {"bp": 1.5, "ap": 1.7}, "impliedVolatility": 1.0, "greeks": {"delta": -0.3, "gamma": 0.02}}}, "next_page_token": None}
        raise AssertionError(url)
    prov._get = fake_get
    snap = prov.chain("TQQQ", max_dte=30)
    assert snap.spot == 100.5 and len(snap.chain) == 2
    row = snap.chain[snap.chain["type"] == "call"].iloc[0]
    assert row["open_interest"] == 1500 and abs(row["iv"] - 0.9) < 1e-9 and abs(row["mark"] - 2.1) < 1e-9


def test_sentiment_lexicon_and_aggregate():
    assert sc.lexicon_score("Stocks rally to record high on dovish Fed") > 0
    assert sc.lexicon_score("Selloff deepens as tariffs and war fears spark crash") < 0
    now = datetime.now(timezone.utc)
    items = [Item("rss", "Stocks rally, breakout to all-time high", "", "", now),
             Item("reddit/wsb", "crash incoming, puts", "", "", now - timedelta(hours=48), meta={"ups": 10}),
             Item("telegram/x", "Iran missile strike reported; markets halt", "", "", now)]
    sc._model = False  # force lexicon for determinism
    agg = sc.aggregate(items, now)
    assert -1 <= agg["score"] <= 1 and agg["n_items"] == 3
    assert "iran" in agg["risk_flags"] and agg["model"] == "lexicon"
