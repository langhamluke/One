"""Common chain snapshot container and provider interface."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Optional, Protocol

import pandas as pd

CHAIN_COLUMNS = ["underlying", "expiration", "strike", "type", "bid", "ask", "mark", "iv",
                 "delta", "gamma", "theta", "vega", "rho", "open_interest", "volume", "updated_at"]


@dataclass
class ChainSnapshot:
    symbol: str
    spot: float
    as_of: datetime
    chain: pd.DataFrame  # CHAIN_COLUMNS (extra columns allowed)
    source: str = ""

    def __post_init__(self):
        df = self.chain
        for c in CHAIN_COLUMNS:
            if c not in df.columns:
                df[c] = None
        df["expiration"] = pd.to_datetime(df["expiration"]).dt.date
        for c in ["strike", "bid", "ask", "mark", "iv", "delta", "gamma", "theta", "vega", "rho", "open_interest", "volume"]:
            df[c] = pd.to_numeric(df[c], errors="coerce")
        if df["mark"].isna().all():
            df["mark"] = (df["bid"] + df["ask"]) / 2.0
        df["type"] = df["type"].astype(str).str.lower()
        self.chain = df

    def expirations(self):
        return sorted(self.chain["expiration"].unique())


class ChainProvider(Protocol):
    name: str

    def chain(self, symbol: str, max_dte: int = 60) -> ChainSnapshot: ...

    def spot(self, symbol: str) -> float: ...
