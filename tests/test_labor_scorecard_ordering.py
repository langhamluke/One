import numpy as np
import pandas as pd
import pytest

from flowcast import labor, ordering, scorecard


def _fc(values):
    ts = pd.date_range("2026-10-07 10:00", periods=len(values), freq="h")
    return pd.DataFrame({"ts": ts, "forecast": values})


def test_staffing_plan_respects_floors_ceilings_and_closure():
    plan = labor.staffing_plan(_fc([0, 20, 180, 400]))
    assert plan.iloc[0]["total"] == 0
    slow = plan.iloc[1]
    assert slow["fry"] == 1 and slow["dining_room"] == 0 and slow["manager"] == 1
    busy = plan.iloc[3]
    assert busy["fry"] == 3 and busy["boxing"] == 4  # capped at max_staff
    assert plan["total"].is_monotonic_increasing


def test_realized_cost_scores_over_and_under():
    plan = labor.staffing_plan(_fc([100, 100]))
    actual = _fc([100, 300]).rename(columns={"forecast": "transactions"})
    r = labor.realized_labor_cost(actual, plan)
    assert r["under_hours"] > 0
    assert r["over_hours"] >= 0


def test_scorecard_recovers_latent_skill(store):
    cards = scorecard.station_scorecards(store["shifts"])
    assert {"throughput_score", "speed_score", "accuracy_score", "composite"} <= set(cards.columns)
    rated = cards[cards["sufficient_data"]]
    assert rated["composite"].between(5, 95).all()
    # Station-relative: each station's mean composite sits near 50.
    means = rated.groupby("station")["composite"].mean()
    assert (means.sub(50).abs() < 6).all()
    # Someone with more shifts than the minimum but a faster average time
    # should outscore a slower peer on speed.
    fry = rated[rated["station"] == "fry"].sort_values("avg_seconds")
    assert fry.iloc[0]["speed_score"] > fry.iloc[-1]["speed_score"]
    summary = scorecard.employee_summary(cards)
    assert summary["overall"].is_monotonic_decreasing


def test_scorecard_withholds_on_thin_data():
    shifts = pd.DataFrame({
        "date": pd.date_range("2026-09-01", periods=3), "block": "open", "employee_id": "E1",
        "station": "fry", "hours": 6, "transactions_handled": [100, 110, 90],
        "avg_seconds": 50, "error_rate": 0.02, "late_or_noshow": 0,
    })
    cards = scorecard.station_scorecards(shifts)
    assert not cards["sufficient_data"].any()
    assert cards["composite"].isna().all()


def test_assignment_fills_best_fit_and_reports_gaps(store):
    cards = scorecard.station_scorecards(store["shifts"])
    summary = scorecard.employee_summary(cards)
    available = summary["employee_id"].head(10).tolist()
    out = scorecard.assign_stations(cards, {"fry": 2, "bird": 1, "boxing": 0}, available)
    assert len(out) == 3
    assert out["employee_id"].notna().all()
    assert out["employee_id"].is_unique
    fry = out[out["station"] == "fry"]
    assert fry.iloc[0]["score"] >= fry.iloc[1]["score"]
    # Not enough people -> empty slots, not an exception.
    out = scorecard.assign_stations(cards, {"fry": 3}, available[:1])
    assert out["employee_id"].isna().sum() == 2


def test_inverse_normal():
    assert ordering.z_for_service_level(0.5) == pytest.approx(0.0, abs=1e-6)
    assert ordering.z_for_service_level(0.95) == pytest.approx(1.6449, abs=1e-3)
    assert ordering.z_for_service_level(0.99) == pytest.approx(2.3263, abs=1e-3)


def test_ordering_chain(store):
    mix = ordering.menu_mix(store["item_sales"], store["transactions"])
    assert set(mix["item"]) == set(ordering.BOM)
    daily = pd.DataFrame({"date": pd.date_range("2026-10-07", periods=7), "forecast": 1500.0})
    usage = ordering.ingredient_usage(ordering.forecast_item_demand(daily, mix))
    chicken = usage[usage["ingredient"] == "chicken_lb"]["qty"]
    assert len(chicken) == 7 and (chicken > 500).all()
    orders = ordering.suggest_orders(usage, on_hand={"chicken_lb": 300.0}, forecast_wape=0.08)
    ch = orders.set_index("ingredient").loc["chicken_lb"]
    # Chicken has a 4-day shelf life: protected window is capped at shelf life + lead time.
    assert ch["protected_usage"] <= chicken.head(6).sum() + 1e-6
    assert ch["order_units"] % ordering.INGREDIENTS["chicken_lb"].case_size == 0
    assert ch["order_units"] + 300 >= ch["protected_usage"] + ch["safety_stock"]
    # Plenty on hand -> nothing ordered.
    none = ordering.suggest_orders(usage, on_hand={k: 1e9 for k in ordering.INGREDIENTS})
    assert (none["order_cases"] == 0).all()
    # Higher service level never orders less.
    lo = ordering.suggest_orders(usage, on_hand={}, service_level=0.80)
    hi = ordering.suggest_orders(usage, on_hand={}, service_level=0.99)
    hi_u = hi.set_index("ingredient")["order_units"].sort_index()
    lo_u = lo.set_index("ingredient")["order_units"].sort_index()
    assert (hi_u >= lo_u).all()
    assert np.isfinite(orders["order_cost"]).all()
