"""Everything the pages show, computed from the engine and cached in memory.

`StoreState.build()` loads data (a real data directory if configured, else
the simulator), trains the forecaster through "yesterday", runs the rolling
backtest, and precomputes the week ahead. Page helpers below return plain
dicts/DataFrames; templates do no computation.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

from flowcast import labor, ordering, scorecard
from flowcast.calendar_features import SchoolCalendar, daily_calendar_frame
from flowcast.connectors.events import EVENT_COLUMNS, load_events_csv
from flowcast.connectors.school import load_school_csv
from flowcast.connectors.weather import WEATHER_COLUMNS
from flowcast.features import baseline_4wk, build_features
from flowcast.forecast import BacktestResult, Forecaster, backtest, daily_wape, intraday_reforecast
from flowcast.montecarlo import DaySimulation, ErrorPool, order_safety_samples, simulate_day
from flowcast.synth import StoreConfig, generate_store, synthetic_weather
from flowcast.tuning import Selection, walk_forward_select

log = logging.getLogger("flowcast.state")

SUFFICIENT_SCORE = 55.0  # "can hold the station" threshold for coverage math
AUTO_ORDER_MAX_WAPE = 0.08
AUTO_ORDER_WEEKS = 4


@dataclass
class StoreData:
    transactions: pd.DataFrame
    weather: pd.DataFrame
    events: pd.DataFrame
    calendar: pd.DataFrame
    school: SchoolCalendar
    item_sales: pd.DataFrame
    shifts: pd.DataFrame | None
    source: str
    notes: list[str] = field(default_factory=list)
    standards: list | None = None        # labor standards learned from the store's own deployment
    score_daily_only: bool = False       # hourly shape is an estimate; only daily totals are real
    meta: dict = field(default_factory=dict)


def load_data_dir(path: Path, cfg: StoreConfig) -> StoreData:
    """Load a store from CSV exports. Only transactions.csv is required.

    transactions.csv: ts, transactions[, net_sales]   (hourly)
    weather.csv:      flowcast weather schema (see connectors.weather)  [optional]
    events.csv:       start,end,name,attendance,distance_mi,category    [optional]
    school.csv:       date,status                                        [optional]
    item_sales.csv:   date,item,qty                                      [optional]
    shifts.csv:       date,block,employee_id,station,hours,transactions_handled,
                      avg_seconds,error_rate,late_or_noshow                [optional]
    """
    notes: list[str] = []
    meta = json.loads((path / "meta.json").read_text()) if (path / "meta.json").exists() else {}
    if meta.get("closed_dates"):
        cfg.closed_dates = set(cfg.closed_dates) | {date.fromisoformat(d) for d in meta["closed_dates"]}
    if meta.get("open_hour") is not None:
        cfg.open_hour, cfg.close_hour = int(meta["open_hour"]), int(meta["close_hour"])
    tx = pd.read_csv(path / "transactions.csv", parse_dates=["ts"]).sort_values("ts")
    if "net_sales" not in tx:
        tx["net_sales"] = np.nan
    if (path / "store_forecast.csv").exists():
        sf = pd.read_csv(path / "store_forecast.csv", parse_dates=["ts"])
        tx = tx.merge(sf, on="ts", how="outer").sort_values("ts").reset_index(drop=True)
        notes.append("Store's own forecast loaded: used as a model input and scored as the comparison to beat.")
    start, end = tx["ts"].min().date(), tx["ts"].max().date()
    rng = np.random.default_rng(0)
    if (path / "weather.csv").exists():
        weather = pd.read_csv(path / "weather.csv", parse_dates=["ts"])[WEATHER_COLUMNS]
    else:
        weather = synthetic_weather(pd.date_range(start, end + timedelta(days=16), freq="D"), rng)
        notes.append("weather.csv not found: using synthetic weather. Run `flowcast weather-history` to fetch Open-Meteo.")
    events = load_events_csv(path / "events.csv") if (path / "events.csv").exists() else pd.DataFrame(columns=EVENT_COLUMNS)
    if events.empty:
        notes.append("events.csv not found: no local events loaded.")
    if (path / "school.csv").exists():
        school = load_school_csv(path / "school.csv")
    else:
        school = SchoolCalendar.synthetic(start - timedelta(days=400), end + timedelta(days=400))
        notes.append("school.csv not found: using a generic K-12 calendar.")
    cal = daily_calendar_frame(start, end + timedelta(days=16), school=school, state=cfg.state, closed_dates=cfg.closed_dates)
    if (path / "item_sales.csv").exists():
        item_sales = pd.read_csv(path / "item_sales.csv", parse_dates=["date"])
    else:
        from flowcast.synth import synthetic_item_sales
        item_sales = synthetic_item_sales(tx, rng)
        notes.append("item_sales.csv not found: menu mix is assumed, not measured.")
    shifts = pd.read_csv(path / "shifts.csv", parse_dates=["date"]) if (path / "shifts.csv").exists() else None
    if shifts is None:
        notes.append("shifts.csv not found: employee scorecards unavailable.")
    standards = None
    if (path / "labor_standards.csv").exists():
        std = pd.read_csv(path / "labor_standards.csv")
        if not std.empty:
            standards = labor.standards_from_frame(std)
            notes.append(f"Staffing uses the store's own deployment chart ({len(standards)} stations).")
    daily_only = bool(meta.get("score_daily_only"))
    if daily_only:
        notes.append("Hourly actuals are estimated from daily totals and the store's half-hour forecast. "
                     "Accuracy is scored on daily totals only.")
    return StoreData(tx, weather, events, cal, school, item_sales, shifts, source=f"csv:{path}", notes=notes,
                     standards=standards, score_daily_only=daily_only, meta=meta)


def load_synthetic(cfg: StoreConfig, days: int, seed: int, end: date) -> StoreData:
    d = generate_store(cfg, end - timedelta(days=days), end, seed=seed)
    # Extend weather and calendar 16 days past the end so the week ahead has inputs.
    rng = np.random.default_rng(seed + 1)
    extra_w = synthetic_weather(pd.date_range(end + timedelta(days=1), end + timedelta(days=16), freq="D"), rng)
    weather = pd.concat([d["weather"], extra_w], ignore_index=True)
    cal = daily_calendar_frame(d["calendar"]["date"].min().date(), end + timedelta(days=16), school=d["school"], state=cfg.state, closed_dates=cfg.closed_dates)
    return StoreData(d["transactions"], weather, d["events"], cal, d["school"], d["item_sales"], d["shifts"],
                     source="simulator", notes=["Demo mode: this store is simulated. Point FLOWCAST_DATA_DIR at real POS exports to replace it."])


@dataclass
class StoreState:
    cfg: StoreConfig
    data: StoreData
    frame: pd.DataFrame
    today: pd.Timestamp
    model: Forecaster
    bt: BacktestResult
    week: pd.DataFrame  # hourly forecast today..today+6 with band, baseline, actual (if known)
    importance: pd.Series
    cards: pd.DataFrame
    summary: pd.DataFrame
    wage: float
    demo_mode: bool
    selection: Selection
    pool: ErrorPool
    sims: dict[pd.Timestamp, DaySimulation] = field(default_factory=dict)
    standards: list = field(default_factory=lambda: list(labor.DEFAULT_STANDARDS))

    @property
    def stations(self) -> list[str]:
        return [s.station for s in self.standards]

    @property
    def has_store_forecast(self) -> bool:
        return "store_forecast" in self.bt.summary.index

    @classmethod
    def build(cls, cfg: StoreConfig, *, data_dir: Path | None = None, wage: float = 16.50,
              days: int = 540, seed: int = 7, folds: int = 8, today: date | None = None,
              extra_events: pd.DataFrame | None = None) -> StoreState:
        if data_dir and (data_dir / "transactions.csv").exists():
            data = load_data_dir(data_dir, cfg)
            demo = False
            known_tx = data.transactions[data.transactions["transactions"].notna()]
            last = known_tx["ts"].max().normalize()
            today_ts = pd.Timestamp(today) if today else last + pd.Timedelta(days=1)
        else:
            end = today or date(2026, 10, 6)
            data = load_synthetic(cfg, days=days, seed=seed, end=end)
            demo = True
            # In demo mode "today" sits a week before the end of history so the
            # live-day and the week ahead both have actuals to compare against.
            today_ts = pd.Timestamp(end) - pd.Timedelta(days=6)

        events = data.events
        if extra_events is not None and not extra_events.empty:
            events = pd.concat([events, extra_events[EVENT_COLUMNS]], ignore_index=True)

        # Make sure the hourly grid runs through today+6 even without actuals.
        tx = data.transactions.copy()
        tx["ts"] = pd.to_datetime(tx["ts"])
        grid_end = today_ts + pd.Timedelta(days=6, hours=23)
        full_hours = pd.DatetimeIndex([d + pd.Timedelta(hours=h) for d in pd.date_range(tx["ts"].min().normalize(), grid_end.normalize()) for h in cfg.hours])
        tx = tx.set_index("ts").reindex(full_hours).rename_axis("ts").reset_index()
        tx["actual_known"] = tx["transactions"].notna()
        tx.loc[tx["ts"] >= today_ts, "actual_known"] = tx.loc[tx["ts"] >= today_ts, "transactions"].notna()
        known = tx["actual_known"].copy()
        # Hours with no data stay missing (NaN) so a gap in the history is never
        # read as a run of zero-customer hours by the lag features.
        cols = ["ts", "transactions"] + (["store_forecast"] if "store_forecast" in tx else [])
        frame = build_features(tx[cols], data.weather, data.calendar, events)
        frame["actual_known"] = known.to_numpy()
        # Lags for the forecast horizon must not peek at future actuals: anything on
        # or after today that depends on a day >= today is replaced by its 1w lag.
        future = frame["date"] >= today_ts
        unknown_1d = future & ((frame["date"] - pd.Timedelta(days=1)) >= today_ts)
        frame.loc[unknown_1d, "lag_1d"] = frame.loc[unknown_1d, "lag_1w"]
        frame.loc[unknown_1d, "lag_1d_total"] = np.nan
        for k in (1, 2, 3, 4):
            bad = future & ((frame["date"] - pd.Timedelta(weeks=k)) >= today_ts)
            frame.loc[bad, f"lag_{k}w"] = np.nan
        lag_cols = [f"lag_{k}w" for k in (1, 2, 3, 4)]
        frame.loc[future, "lag_mean_4w"] = frame.loc[future, lag_cols].mean(axis=1)
        frame.loc[future, "lag_std_4w"] = frame.loc[future, lag_cols].std(axis=1)

        hist = frame[(frame["date"] < today_ts) & frame["actual_known"] & frame["transactions"].notna()]
        # Walk-forward selection decides which model (if any) the data supports.
        selection = walk_forward_select(hist, max_folds=folds)
        model = Forecaster.fit(hist, **selection.model_kwargs)
        if selection.predictions is not None:
            bt = backtest(hist, n_folds=selection.schedule.n_folds, horizon_days=selection.schedule.horizon_days,
                          min_train_days=selection.schedule.min_train_days, model_kwargs=selection.model_kwargs)
            pool = ErrorPool.from_predictions(bt.predictions, pred_col="model")
        else:
            bt = _empty_backtest(hist)
            pool = ErrorPool.uninformed(cfg.hours)
        imp = model.feature_importance(hist, n_repeats=2)

        week_rows = frame[(frame["date"] >= today_ts) & (frame["date"] <= today_ts + pd.Timedelta(days=6))]
        week = model.predict_interval(week_rows)
        week["baseline"] = baseline_4wk(week_rows).round(1).to_numpy()
        week["store_forecast"] = week_rows["store_forecast"].to_numpy()
        week["actual"] = np.where(week_rows["actual_known"], week_rows["transactions"], np.nan)
        week["date"] = week_rows["date"].to_numpy()
        week["hour"] = week_rows["hour"].to_numpy()
        week["is_closed"] = week_rows["is_closed"].to_numpy()

        if data.shifts is not None and not data.shifts.empty:
            cards = scorecard.station_scorecards(data.shifts)
            summary = scorecard.employee_summary(cards)
        else:
            cards, summary = pd.DataFrame(), pd.DataFrame()

        state = cls(cfg, data, frame, today_ts, model, bt, week, imp, cards, summary, wage, demo, selection, pool)
        state.standards = data.standards or labor.DEFAULT_STANDARDS
        state.resimulate()
        return state

    def resimulate(self, n: int = 2000) -> None:
        """Monte Carlo each day of the week ahead; replace the band with P10-P90."""
        self.sims = {}
        for i, d in enumerate(sorted(self.week["date"].unique())):
            rows = self.week[self.week["date"] == d]
            if rows["is_closed"].all() or rows["forecast"].sum() <= 0:
                continue
            sim = simulate_day(rows, self.pool, n=n, seed=i, standards=self.standards)
            self.sims[pd.Timestamp(d)] = sim
            self.week.loc[rows.index, "low"] = sim.hourly_p10
            self.week.loc[rows.index, "high"] = sim.hourly_p90

    @property
    def error_samples(self) -> np.ndarray:
        return order_safety_samples(self.pool)

    # ------------------------------------------------------------------ helpers
    def apply_events(self, extra: pd.DataFrame | None) -> None:
        """Recompute event pressure and the week-ahead forecast after a manager adds events.

        The trained model is unchanged; only the inputs for the horizon move.
        """
        from flowcast.connectors.events import hourly_event_pressure

        events = self.data.events
        if extra is not None and not extra.empty:
            events = pd.concat([events, extra[EVENT_COLUMNS]], ignore_index=True)
        self._events_live = events
        mask = (self.frame["date"] >= self.today) & (self.frame["date"] <= self.today + pd.Timedelta(days=6))
        rows = self.frame[mask]
        pressure = hourly_event_pressure(events, pd.DatetimeIndex(rows["ts"])).to_numpy()
        self.frame.loc[mask, "event_pressure"] = pressure
        self.frame.loc[mask, "event_pressure_k"] = pressure / 1000.0
        rows = self.frame[mask]
        week = self.model.predict_interval(rows)
        self.week["forecast"] = week["forecast"].to_numpy()
        self.week["low"] = week["low"].to_numpy()
        self.week["high"] = week["high"].to_numpy()
        self.resimulate()

    def day(self, d: pd.Timestamp) -> pd.DataFrame:
        return self.week[self.week["date"] == d].reset_index(drop=True)

    def day_context(self, d: pd.Timestamp) -> dict:
        rows = self.frame[self.frame["date"] == d]
        if rows.empty:
            return {}
        r = rows.iloc[0]
        ev = self.events_on(d)
        return {
            "date": d,
            "dow": d.day_name(),
            "school": str(r["school_status"]).replace("_", " "),
            "holiday": None if r["holiday_name"] == "none" else str(r["holiday_name"]),
            "closed": bool(r["is_closed"]),
            "temp_lo": float(rows["temp_f"].min()),
            "temp_hi": float(rows["temp_f"].max()),
            "rain_in": float(rows["rain_in"].sum()),
            "rain_hours": int(rows["is_raining"].sum()),
            "storm": bool(rows["is_storm"].any()),
            "nice": bool(rows["nice_day"].mean() > 0.5),
            "event_peak_k": float(rows["event_pressure_k"].max()),
            "events": ev,
            "days_to_holiday": int(r["days_to_next_holiday"]),
        }

    def events_on(self, d: pd.Timestamp) -> list[dict]:
        ev = getattr(self, "_events_live", self.data.events)
        if ev is None or ev.empty:
            return []
        s = pd.to_datetime(ev["start"]).dt.normalize()
        hit = ev[s == d]
        return [{"name": r.name, "start": pd.Timestamp(r.start).strftime("%-I:%M %p"), "attendance": int(r.attendance), "distance_mi": float(r.distance_mi), "category": r.category} for r in hit.itertuples(index=False)]

    def drivers(self, d: pd.Timestamp) -> list[str]:
        """Plain-language reasons today's forecast differs from the 4-week average."""
        ctx = self.day_context(d)
        day = self.day(d)
        out = []
        if ctx.get("closed"):
            return [f"Closed: {ctx['holiday']}"]
        delta = day["forecast"].sum() - day["baseline"].sum()
        pct = 100 * delta / max(day["baseline"].sum(), 1)
        out.append(f"Model total {day['forecast'].sum():.0f} vs 4-week average {day['baseline'].sum():.0f} ({pct:+.0f}%).")
        if ctx["rain_in"] > 0.05:
            out.append(f"Rain expected ({ctx['rain_in']:.2f} in over {ctx['rain_hours']} hours){' with storms' if ctx['storm'] else ''}: typically -10 to -25% in wet hours.")
        if ctx["nice"]:
            out.append("Mild, dry day: slight lift in foot traffic.")
        if ctx["temp_hi"] >= 98:
            out.append(f"Extreme heat ({ctx['temp_hi']:.0f}F): small dip in afternoon.")
        if ctx["holiday"]:
            out.append(f"Holiday: {ctx['holiday']}.")
        elif ctx["days_to_holiday"] == 1:
            out.append("Day before a holiday: usually a lift.")
        if ctx["school"] == "in session":
            out.append("School in session: after-school rush 3-4pm.")
        else:
            out.append(f"School {ctx['school']}: lunch runs heavier, no after-school spike.")
        for e in ctx["events"]:
            out.append(f"Event: {e['name']} at {e['start']}, ~{e['attendance']:,} people, {e['distance_mi']:.1f} mi away.")
        return out

    # ------------------------------------------------------------------ live day
    def live(self, as_of_hour: int) -> dict:
        day = self.day(self.today)
        actual = pd.Series(day["actual"].to_numpy(), index=pd.DatetimeIndex(day["ts"]))
        through = actual[(actual.index.hour < as_of_hour) & actual.notna()]
        rf = intraday_reforecast(day[["ts", "forecast"]], through)
        rf["hour"] = rf["ts"].dt.hour
        rf["baseline"] = day["baseline"].to_numpy()
        return {"table": rf, "ratio": rf.attrs["ratio"], "observed": rf.attrs["observed"], "expected": rf.attrs["expected"],
                "signal": rf["signal"].iloc[-1] if len(rf) else "hold", "as_of_hour": as_of_hour,
                "remaining_forecast": float(rf.loc[rf["hour"] >= as_of_hour, "revised"].sum()),
                "remaining_original": float(rf.loc[rf["hour"] >= as_of_hour, "forecast"].sum())}

    # ------------------------------------------------------------------ labor
    def week_plan(self) -> pd.DataFrame:
        plan = labor.staffing_plan(self.week[["ts", "forecast"]], self.standards)
        base = labor.staffing_plan(self.week[["ts", "baseline"]], self.standards, forecast_col="baseline")
        plan["baseline_total"] = base["total"].to_numpy()
        plan["date"] = plan["ts"].dt.normalize()
        plan["hour"] = plan["ts"].dt.hour
        return plan

    def overstaff_warnings(self) -> list[dict]:
        plan = self.week_plan()
        out = []
        for d, g in plan.groupby("date"):
            diff = int(g["baseline_total"].sum() - g["total"].sum())
            hours = g[g["baseline_total"] - g["total"] >= 2]
            if diff >= 4:
                out.append({"date": d, "hours": diff, "dollars": diff * self.wage,
                            "when": ", ".join(f"{h:d}:00" for h in hours["hour"])})
        return out

    def understaff_warnings(self) -> list[dict]:
        plan = self.week_plan()
        out = []
        for d, g in plan.groupby("date"):
            hours = g[g["total"] - g["baseline_total"] >= 2]
            if len(hours):
                out.append({"date": d, "hours": int((g["total"] - g["baseline_total"]).clip(lower=0).sum()),
                            "when": ", ".join(f"{h:d}:00" for h in hours["hour"])})
        return out

    def hiring_needs(self) -> list[dict]:
        """Stations where the forecast's peak need exceeds the number of people rated to hold it."""
        if self.cards.empty:
            return []
        plan = self.week_plan()
        rated = self.cards[self.cards["sufficient_data"] & (self.cards["composite"] >= SUFFICIENT_SCORE)]
        out = []
        for s in self.standards:
            peak = int(plan[s.station].max())
            holders = int((rated["station"] == s.station).sum())
            specialists = int(((rated["station"] == s.station) & rated["specialist"]).sum())
            # Need enough qualified people for two shifts plus one for days off.
            required = peak * 2 + 1
            out.append({"station": s.station, "peak_need": peak, "qualified": holders, "specialists": specialists,
                        "required": required, "gap": max(required - holders, 0)})
        return out

    def lineup(self, hour: int = 18, max_available: int = 20) -> pd.DataFrame:
        if self.cards.empty:
            return pd.DataFrame()
        plan = self.week_plan()
        row = plan[(plan["date"] == self.today) & (plan["hour"] == hour)]
        if row.empty:
            return pd.DataFrame()
        needs = {s.station: int(row.iloc[0][s.station]) for s in self.standards}
        available = self.summary["employee_id"].head(max_available).tolist()
        return scorecard.assign_stations(self.cards, needs, available)

    # ------------------------------------------------------------------ accuracy
    def accuracy_by_fold(self) -> pd.DataFrame:
        p = self.bt.predictions
        if p.empty:
            return pd.DataFrame(columns=["week_start", "baseline", "model"])
        rows = []
        for f, g in p.groupby("fold"):
            row = {"week_start": g["date"].min(), "baseline": daily_wape(g, "transactions", "baseline"),
                   "model": daily_wape(g, "transactions", "model")}
            if self.has_store_forecast:
                row["store"] = daily_wape(g, "transactions", "store_forecast")
            rows.append(row)
        return pd.DataFrame(rows)

    def daily_comparison(self) -> pd.DataFrame:
        """Daily error of every forecast the backtest scored, on days with real actuals."""
        p = self.bt.predictions
        if p.empty:
            return pd.DataFrame()
        cols = [("Model", "model"), ("4-week average", "baseline")]
        if self.has_store_forecast:
            cols.insert(1, ("Store's own forecast", "store_forecast"))
        d = p.groupby("date")[["transactions"] + [c for _, c in cols]].sum()
        rows = []
        for name, c in cols:
            err = (d[c] - d["transactions"]).abs()
            rows.append({"forecast": name, "daily_error": float(err.sum() / d["transactions"].sum()),
                         "days_off_10": int((err / d["transactions"] > 0.10).sum()), "days": len(d)})
        return pd.DataFrame(rows)

    def last_week_labor(self) -> dict:
        """What last week's schedule would have cost under each forecast, scored against actuals."""
        p = self.bt.predictions
        if p.empty:
            empty = {"over_hours": 0.0, "under_hours": 0.0, "over_cost": 0.0, "under_hours_pct": 0.0, "scheduled": 0.0}
            return {"baseline": empty, "model": dict(empty)}
        last = p[p["fold"] == p["fold"].max()]
        actual = last[["ts", "transactions"]]
        out = {}
        for name, col in (("baseline", "baseline"), ("model", "model")):
            plan = labor.staffing_plan(last[["ts", col]], self.standards, forecast_col=col)
            out[name] = labor.realized_labor_cost(actual, plan, self.standards, wage=self.wage) | {"scheduled": float(plan["total"].sum())}
        return out

    # ------------------------------------------------------------------ ordering
    def usage(self) -> pd.DataFrame:
        daily = self.week.groupby("date")["forecast"].sum().reset_index()
        mix = ordering.menu_mix(self.data.item_sales, self.data.transactions)
        return ordering.ingredient_usage(ordering.forecast_item_demand(daily, mix))

    def orders(self, on_hand: dict[str, float], on_order: dict[str, float]) -> pd.DataFrame:
        wape_ = float(self.bt.summary.loc["model", "daily_wape"]) if not np.isnan(self.bt.summary.loc["model", "daily_wape"]) else 0.15
        return ordering.suggest_orders(self.usage(), on_hand, on_order, forecast_wape=wape_, error_samples=self.error_samples)

    def live_odds(self, as_of_hour: int) -> dict:
        """Monte Carlo odds for the remaining hours of today, conditioned on the live ratio."""
        sim = self.sims.get(self.today)
        if sim is None:
            return {}
        live = self.live(as_of_hour)
        rows = live["table"]
        remaining = rows[rows["hour"] >= as_of_hour]
        if remaining.empty:
            return {}
        rsim = simulate_day(remaining.rename(columns={"revised": "f"}), self.pool, n=1500, seed=99, forecast_col="f",
                            standards=self.standards)
        plan = labor.staffing_plan(remaining[["ts", "forecast"]], self.standards)
        plan_hours = float(plan["total"].sum())
        return {"p_need_more": rsim.prob_labor_at_least(plan_hours, 2), "p_need_fewer": rsim.prob_labor_at_most(plan_hours, 2),
                "remaining_p10": rsim.total_p["p10"], "remaining_p90": rsim.total_p["p90"], "plan_hours": plan_hours}

    def auto_order_eligibility(self) -> dict:
        acc = self.accuracy_by_fold().tail(AUTO_ORDER_WEEKS)
        ok = bool(len(acc) == AUTO_ORDER_WEEKS and (acc["model"] <= AUTO_ORDER_MAX_WAPE).all())
        return {"eligible": ok, "weeks": AUTO_ORDER_WEEKS, "threshold": AUTO_ORDER_MAX_WAPE,
                "recent": acc["model"].round(3).tolist()}


def _empty_backtest(hist: pd.DataFrame) -> BacktestResult:
    cols = ["ts", "date", "hour", "transactions", "is_closed", "model", "baseline", "fold", "horizon_day"]
    summary = pd.DataFrame({"hourly_wape": [np.nan, np.nan], "daily_wape": [np.nan, np.nan], "hourly_wape_d1": [np.nan, np.nan],
                            "peak_hour_wape": [np.nan, np.nan]}, index=pd.Index(["baseline_4wk", "model"], name="method"))
    return BacktestResult(pd.DataFrame(columns=cols), summary, pd.DataFrame(columns=["hours", "baseline_wape", "model_wape", "improvement"]))
