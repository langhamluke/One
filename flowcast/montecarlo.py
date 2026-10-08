"""Monte Carlo over the forecast's own out-of-sample errors.

A point forecast says 1,540. The questions a manager actually has are
"how bad could dinner get", "what are the odds we need a sixth person at
six", and "how much chicken covers us 95 times out of 100". Those need a
distribution, and the right distribution is the one the forecast has
actually produced in walk-forward testing, not a textbook normal.

Each simulated day draws:
  1. a day-level factor, bootstrapped from the walk-forward daily errors
     (a slow Tuesday is slow all day; errors are not independent by hour);
  2. an hour-level factor, bootstrapped from hourly errors after the day
     factor is removed;
  3. Poisson noise on the resulting rate.
Thin data means few errors to bootstrap from, so the pool is widened with
a floor that shrinks as history grows: honest bands on week 3, tight bands
on week 30.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from flowcast import labor

N_SIMS = 2000


@dataclass
class ErrorPool:
    daily: np.ndarray  # relative daily errors (actual / forecast - 1)
    hourly: dict[int, np.ndarray]  # hour -> relative residual after day factor
    n_days: int

    @classmethod
    def from_predictions(cls, preds: pd.DataFrame, pred_col: str = "blend", floor_days: int = 28) -> ErrorPool:
        p = preds[preds["is_closed"] == 0].copy()
        p["pred"] = p[pred_col].clip(lower=1e-6)
        day = p.groupby("date").agg(a=("transactions", "sum"), f=("pred", "sum"))
        day = day[day["f"] > 0]
        daily = (day["a"] / day["f"] - 1).to_numpy()
        p = p.merge(day.rename(columns={"a": "day_a", "f": "day_f"}), left_on="date", right_index=True)
        p["day_factor"] = p["day_a"] / p["day_f"]
        p["hour_rel"] = p["transactions"] / (p["pred"] * p["day_factor"]) - 1
        hourly = {int(h): g["hour_rel"].clip(-0.9, 1.5).to_numpy() for h, g in p.groupby("hour")}
        n = len(daily)
        if n < floor_days:
            # Widen: add synthetic draws from a normal whose spread reflects
            # how little we know, so a 3-week store does not report a 2% band.
            extra = np.random.default_rng(0).normal(0, 0.12 * np.sqrt(floor_days / max(n, 1)) / 2, floor_days - n)
            daily = np.concatenate([daily, extra])
        return cls(daily, hourly, n)

    @classmethod
    def uninformed(cls, hours: list[int]) -> ErrorPool:
        rng = np.random.default_rng(0)
        return cls(rng.normal(0, 0.18, 28), {h: rng.normal(0, 0.12, 28) for h in hours}, 0)


@dataclass
class DaySimulation:
    hours: list[int]
    hourly_p10: np.ndarray
    hourly_p50: np.ndarray
    hourly_p90: np.ndarray
    totals: np.ndarray
    labor_hours: np.ndarray

    @property
    def total_p(self) -> dict[str, float]:
        return {k: float(np.percentile(self.totals, q)) for k, q in (("p10", 10), ("p50", 50), ("p90", 90))}

    def prob_total_above(self, x: float) -> float:
        return float((self.totals > x).mean())

    def prob_labor_at_least(self, plan_hours: float, extra: int) -> float:
        return float((self.labor_hours >= plan_hours + extra).mean())

    def prob_labor_at_most(self, plan_hours: float, fewer: int) -> float:
        return float((self.labor_hours <= plan_hours - fewer).mean())


def simulate_day(day_forecast: pd.DataFrame, pool: ErrorPool, n: int = N_SIMS, seed: int = 0,
                 forecast_col: str = "forecast", standards=None) -> DaySimulation:
    """day_forecast: rows for one day with `hour` and a point forecast column."""
    rng = np.random.default_rng(seed)
    hours = [int(h) for h in day_forecast["hour"]]
    point = day_forecast[forecast_col].to_numpy(dtype=float)
    k = len(hours)
    day_f = 1 + rng.choice(pool.daily, size=n)
    hour_f = np.empty((n, k))
    for j, h in enumerate(hours):
        src = pool.hourly.get(h)
        hour_f[:, j] = 1 + (rng.choice(src, size=n) if src is not None and len(src) else 0.0)
    lam = np.clip(point[None, :] * day_f[:, None] * hour_f, 0, None)
    draws = rng.poisson(lam)
    totals = draws.sum(axis=1)
    # Labor need per simulated day, from the same standards the plan uses.
    labor_hours = np.array([_labor_need(hours, row, standards) for row in draws[: min(n, 600)]])
    return DaySimulation(hours, np.percentile(draws, 10, axis=0), np.percentile(draws, 50, axis=0),
                         np.percentile(draws, 90, axis=0), totals, labor_hours)


def _labor_need(hours: list[int], tx: np.ndarray, standards=None) -> float:
    standards = standards or labor.DEFAULT_STANDARDS
    total = 0.0
    for v in tx:
        if v <= 0:
            continue
        total += labor.MANAGER_PER_HOUR + sum(s.need(float(v)) for s in standards)
    return total


def order_safety_samples(pool: ErrorPool, n: int = N_SIMS, seed: int = 1) -> np.ndarray:
    """Daily multiplicative error draws for the ordering module's empirical safety stock."""
    rng = np.random.default_rng(seed)
    return 1 + rng.choice(pool.daily, size=(n, 14))
