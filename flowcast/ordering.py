"""Forecast-driven order suggestions.

Chain: hourly transaction forecast -> daily item forecast (menu mix) ->
ingredient usage (bill of materials) -> order quantity for the next delivery
window, with safety stock sized from the forecast's own error.

The safety stock is the part that makes automation trustworthy: it is wide
when the model has been wrong lately and narrow when it has been right, so
the system earns the right to place orders by proving its accuracy, item by
item.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd


@dataclass(frozen=True)
class Ingredient:
    name: str
    unit: str
    case_size: float  # units per case ordered
    shelf_life_days: int
    unit_cost: float


# Recipe: menu item -> {ingredient: qty per item sold}
BOM: dict[str, dict[str, float]] = {
    "box_combo": {"chicken_lb": 0.55, "fries_lb": 0.30, "toast_slice": 1, "slaw_oz": 3, "sauce_cup": 1, "cup_32": 1},
    "3_finger_combo": {"chicken_lb": 0.42, "fries_lb": 0.30, "toast_slice": 1, "sauce_cup": 1, "cup_32": 1},
    "caniac_combo": {"chicken_lb": 0.85, "fries_lb": 0.30, "toast_slice": 2, "slaw_oz": 3, "sauce_cup": 2, "cup_32": 1},
    "kids_combo": {"chicken_lb": 0.28, "fries_lb": 0.20, "sauce_cup": 1, "cup_32": 1},
    "sandwich_combo": {"chicken_lb": 0.42, "fries_lb": 0.30, "bun": 1, "sauce_cup": 1, "cup_32": 1},
    "tailgate_25": {"chicken_lb": 3.5, "sauce_cup": 6, "toast_slice": 10},
    "extra_sauce": {"sauce_cup": 1},
    "lemonade": {"lemonade_oz": 22},
    "sweet_tea": {"tea_oz": 22},
    "fountain_drink": {"syrup_oz": 2},
}

INGREDIENTS: dict[str, Ingredient] = {
    "chicken_lb": Ingredient("chicken_lb", "lb", 40, 4, 3.10),
    "fries_lb": Ingredient("fries_lb", "lb", 30, 180, 0.95),
    "toast_slice": Ingredient("toast_slice", "slice", 240, 6, 0.09),
    "bun": Ingredient("bun", "each", 96, 5, 0.22),
    "slaw_oz": Ingredient("slaw_oz", "oz", 320, 5, 0.06),
    "sauce_cup": Ingredient("sauce_cup", "cup", 500, 14, 0.07),
    "cup_32": Ingredient("cup_32", "each", 600, 365, 0.11),
    "lemonade_oz": Ingredient("lemonade_oz", "oz", 1280, 7, 0.02),
    "tea_oz": Ingredient("tea_oz", "oz", 2000, 7, 0.006),
    "syrup_oz": Ingredient("syrup_oz", "oz", 640, 180, 0.05),
}


def z_for_service_level(p: float) -> float:
    """Inverse normal CDF without scipy (Acklam's rational approximation)."""
    if not 0 < p < 1:
        raise ValueError("service level must be in (0,1)")
    a = [-3.969683028665376e01, 2.209460984245205e02, -2.759285104469687e02,
         1.383577518672690e02, -3.066479806614716e01, 2.506628277459239e00]
    b = [-5.447609879822406e01, 1.615858368580409e02, -1.556989798598866e02,
         6.680131188771972e01, -1.328068155288572e01]
    c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e00,
         -2.549732539343734e00, 4.374664141464968e00, 2.938163982698783e00]
    d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e00,
         3.754408661907416e00]
    plow, phigh = 0.02425, 1 - 0.02425
    if p < plow:
        q = np.sqrt(-2 * np.log(p))
        return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)
    if p > phigh:
        q = np.sqrt(-2 * np.log(1 - p))
        return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)
    q = p - 0.5
    r = q * q
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1)


def menu_mix(item_sales: pd.DataFrame, transactions: pd.DataFrame, lookback_days: int = 56) -> pd.DataFrame:
    """Items sold per transaction, by weekday, from recent history."""
    tx = transactions.copy()
    tx["date"] = pd.to_datetime(tx["ts"]).dt.normalize()
    daily_tx = tx.groupby("date")["transactions"].sum()
    items = item_sales.copy()
    items["date"] = pd.to_datetime(items["date"])
    cutoff = items["date"].max() - pd.Timedelta(days=lookback_days)
    items = items[items["date"] > cutoff]
    items["tx"] = items["date"].map(daily_tx)
    items = items[items["tx"] > 0]
    items["per_tx"] = items["qty"] / items["tx"]
    items["dow"] = items["date"].dt.dayofweek
    return items.groupby(["item", "dow"])["per_tx"].mean().reset_index()


def forecast_item_demand(daily_tx_forecast: pd.DataFrame, mix: pd.DataFrame) -> pd.DataFrame:
    """daily_tx_forecast: columns date, forecast. Returns date x item quantities."""
    f = daily_tx_forecast.copy()
    f["dow"] = pd.to_datetime(f["date"]).dt.dayofweek
    merged = f.merge(mix, on="dow", how="left")
    merged["qty"] = merged["forecast"] * merged["per_tx"]
    return merged[["date", "item", "qty"]]


def ingredient_usage(item_demand: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for r in item_demand.itertuples(index=False):
        for ing, per in BOM.get(r.item, {}).items():
            rows.append({"date": r.date, "ingredient": ing, "qty": r.qty * per})
    return pd.DataFrame(rows).groupby(["date", "ingredient"])["qty"].sum().reset_index()


def suggest_orders(
    usage: pd.DataFrame,
    on_hand: dict[str, float],
    on_order: dict[str, float] | None = None,
    lead_time_days: int = 2,
    coverage_days: int = 3,
    forecast_wape: float = 0.12,
    service_level: float = 0.95,
    error_samples: np.ndarray | None = None,
) -> pd.DataFrame:
    """Order quantity per ingredient for the next delivery.

    Protects usage over lead time + coverage window. Safety stock = z * sigma,
    where sigma is the forecast's demonstrated error (WAPE) applied to the
    protected usage, scaled by sqrt(window) because daily errors partly cancel.
    When `error_samples` (Monte Carlo daily error paths, shape n x >=window)
    are given, the safety stock is instead the empirical service-level
    quantile of simulated usage minus its mean: no normality assumed.
    Perishables are capped at shelf life so the suggestion never orders more
    chicken than can be sold before it must be discarded.
    """
    on_order = on_order or {}
    z = z_for_service_level(service_level)
    usage = usage.copy()
    usage["date"] = pd.to_datetime(usage["date"])
    window = lead_time_days + coverage_days
    rows = []
    for ing, grp in usage.groupby("ingredient"):
        spec = INGREDIENTS[ing]
        grp = grp.sort_values("date")
        daily = grp["qty"].to_numpy()
        horizon = min(window, spec.shelf_life_days + lead_time_days, len(daily))
        protected = float(daily[:horizon].sum())
        per_day = protected / max(horizon, 1)
        if error_samples is not None and error_samples.shape[1] >= horizon:
            sim = (daily[:horizon][None, :] * error_samples[:, :horizon]).sum(axis=1)
            safety = max(float(np.percentile(sim, 100 * service_level) - sim.mean()), 0.0)
        else:
            sigma = forecast_wape * per_day * np.sqrt(horizon)
            safety = z * sigma
        target = protected + safety
        position = on_hand.get(ing, 0.0) + on_order.get(ing, 0.0)
        need = max(target - position, 0.0)
        cases = int(np.ceil(need / spec.case_size)) if need > 0 else 0
        rows.append(
            {
                "ingredient": ing,
                "unit": spec.unit,
                "protected_usage": round(protected, 1),
                "safety_stock": round(safety, 1),
                "on_hand": on_hand.get(ing, 0.0),
                "on_order": on_order.get(ing, 0.0),
                "order_units": round(cases * spec.case_size, 1),
                "order_cases": cases,
                "order_cost": round(cases * spec.case_size * spec.unit_cost, 2),
                "days_of_supply_after": round((position + cases * spec.case_size) / max(per_day, 1e-6), 1),
            }
        )
    return pd.DataFrame(rows).sort_values("order_cost", ascending=False).reset_index(drop=True)
