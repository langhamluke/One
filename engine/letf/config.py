"""Settings loaded from config/settings.yaml with environment overrides."""
from __future__ import annotations

import os
from dataclasses import dataclass, field

import yaml

DEFAULTS = {
    "account": 100000,
    "parents": {"TQQQ": "QQQ", "UPRO": "SPY"},
    "trade_symbols": ["TQQQ", "UPRO", "QQQ", "SPY"],
    "gex_symbols": ["QQQ", "SPY"],          # add SPX, NDX when the CBOE provider is reachable
    "vol_index": {"QQQ": "VXN", "SPY": "VIX"},
    "provider": "alpaca",                    # alpaca | cboe | fixtures
    "fixtures_dir": "data/fixtures",
    "cache_dir": "data/cache",
    "out_dir": "out",
    "dte_filter": "monthly",                 # gex window: 0dte | weekly | monthly | all
    "allow_spreads": False,
    "risk": {"max_premium_pct": 0.01, "max_open_positions": 3, "max_total_premium_pct": 0.03, "kelly_cap": 0.5,
             "take_profit_x": 2.0, "stop_loss_pct": 0.5, "time_stop_dte": 1},
    "ranker": {"min_dte": 1, "max_dte": 14, "min_oi": 100, "min_volume": 10, "max_spread_pct": 0.12, "min_pop": 0.25, "drift_k": 0.5},
    "signals": {},
    "sentiment": {"enabled": True, "rss": True, "reddit": True, "telegram": True, "tradingview": False},
    "catalysts_yaml": "config/catalysts.yaml",
    "schedule": {"pre_open": "08:45", "intraday_every_min": 15, "post_close": "16:10", "tz": "America/New_York"},
    "alerts": {"email": True, "sms": True, "min_score": 0.35, "only_on_change": True},
}


def load(path: str = "config/settings.yaml") -> dict:
    cfg = dict(DEFAULTS)
    if os.path.exists(path):
        with open(path) as f:
            user = yaml.safe_load(f) or {}
        for k, v in user.items():
            if isinstance(v, dict) and isinstance(cfg.get(k), dict):
                cfg[k] = {**cfg[k], **v}
            else:
                cfg[k] = v
    if os.environ.get("LETF_PROVIDER"):
        cfg["provider"] = os.environ["LETF_PROVIDER"]
    return cfg
