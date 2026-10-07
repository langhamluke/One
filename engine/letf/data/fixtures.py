"""Chain provider that reads captured CSV snapshots (tests, offline runs)."""
from __future__ import annotations

import glob
import json
import os
from datetime import datetime, timezone

import pandas as pd

from .base import ChainSnapshot


class FixtureProvider:
    name = "fixtures"

    def __init__(self, directory: str):
        self.directory = directory

    def _latest(self, symbol: str) -> str:
        files = sorted(glob.glob(os.path.join(self.directory, f"{symbol}_chain_*.csv")))
        if not files:
            raise FileNotFoundError(f"no fixture chain for {symbol} in {self.directory}")
        return files[-1]

    def spot(self, symbol: str) -> float:
        meta = os.path.join(self.directory, f"{symbol}_chain_meta.json")
        if os.path.exists(meta):
            with open(meta) as f:
                m = json.load(f)
            for k in ("spot", "spot_estimate", "underlying_price", "spot_used", "spot_price", "last_trade_price", "underlying_spot"):
                if k in m and m[k] is not None:
                    return float(m[k])
        df = pd.read_csv(self._latest(symbol))
        # infer spot from the call/put with delta closest to +/-0.5
        d = df.dropna(subset=["delta"])
        if d.empty:
            raise ValueError("cannot infer spot")
        row = d.iloc[(d["delta"].abs() - 0.5).abs().argsort()[:1]]
        return float(row["strike"].iloc[0])

    def chain(self, symbol: str, max_dte: int = 60) -> ChainSnapshot:
        path = self._latest(symbol)
        df = pd.read_csv(path)
        spot = self.spot(symbol)
        as_of = None
        if "updated_at" in df and df["updated_at"].notna().any():
            try:
                as_of = pd.to_datetime(df["updated_at"].dropna().iloc[0], utc=True).to_pydatetime()
            except Exception:
                as_of = None
        if as_of is None:
            as_of = datetime.now(timezone.utc)
        return ChainSnapshot(symbol=symbol, spot=spot, as_of=as_of, chain=df, source=f"fixture:{os.path.basename(path)}")
