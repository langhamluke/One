"""Command line entry points. `flowcast demo` runs the whole loop on a simulated store."""

from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pandas as pd
import typer

from flowcast import labor, ordering, scorecard
from flowcast.features import baseline_4wk, build_features
from flowcast.forecast import Forecaster, backtest, intraday_reforecast
from flowcast.synth import StoreConfig, generate_store

app = typer.Typer(add_completion=False, help="Restaurant flow forecasting toolkit.")

pd.set_option("display.width", 160)
pd.set_option("display.max_columns", 30)


def _h(title: str) -> None:
    typer.echo("\n" + "=" * 8 + f" {title} " + "=" * (70 - len(title)))


@app.command()
def demo(
    days: int = typer.Option(540, help="Days of simulated history."),
    seed: int = typer.Option(7, help="Simulator seed."),
    folds: int = typer.Option(6, help="Backtest folds (1 week each)."),
) -> None:
    """Simulate a store, backtest the forecaster, and print tomorrow's plan."""
    end = date(2026, 10, 6)
    start = end - timedelta(days=days)
    cfg = StoreConfig()
    typer.echo(f"Simulating {cfg.name} from {start} to {end} ...")
    data = generate_store(cfg, start, end, seed=seed)
    frame = build_features(data["transactions"], data["weather"], data["calendar"], data["events"])

    _h("Backtest: model vs 4-week same-weekday-hour average")
    bt = backtest(frame, n_folds=folds)
    typer.echo((bt.summary * 100).round(1).astype(str) + "%")
    base, model = bt.summary.loc["baseline_4wk", "hourly_wape"], bt.summary.loc["model", "hourly_wape"]
    typer.echo(f"\nHourly error reduced {100 * (1 - model / base):.0f}% relative to the baseline.")
    _h("Where the external signals earn their keep (hourly WAPE by condition)")
    bc = bt.by_condition.copy()
    for c in ("baseline_wape", "model_wape", "improvement"):
        bc[c] = (bc[c] * 100).round(1).astype(str) + "%"
    typer.echo(bc.to_string())

    _h("What the model learned to pay attention to")
    fc = Forecaster.fit(frame)
    imp = fc.feature_importance(frame).head(12)
    typer.echo(imp.round(3).to_string())

    # Tomorrow = last backtest fold's first day, so actuals exist for the demo.
    tomorrow = bt.predictions["date"].min()
    day = frame[frame["date"] == tomorrow].copy()
    fold_model = Forecaster.fit(frame[frame["date"] < tomorrow])
    interval = fold_model.predict_interval(day)
    interval["baseline"] = baseline_4wk(day).round(1).to_numpy()
    interval["actual"] = day["transactions"].to_numpy()
    cal = data["calendar"].set_index("date").loc[tomorrow]
    wx = day[["temp_f", "rain_in", "weather_code"]]
    _h(f"Forecast for {tomorrow.date()} ({tomorrow.day_name()})")
    typer.echo(
        f"school: {cal.school_status} | holiday: {cal.holiday_name} | "
        f"temp {wx.temp_f.min():.0f}-{wx.temp_f.max():.0f}F | rain {wx.rain_in.sum():.2f} in | "
        f"event pressure peak {day.event_pressure.max():.0f}"
    )
    typer.echo(interval.assign(hour=interval["ts"].dt.hour)[["hour", "baseline", "forecast", "low", "high", "actual"]].to_string(index=False))
    typer.echo(f"day total  baseline {interval.baseline.sum():.0f} | model {interval.forecast.sum():.0f} | actual {interval.actual.sum():.0f}")

    _h("Intraday re-forecast at 2:00pm (actuals through 1pm)")
    actuals = pd.Series(day["transactions"].to_numpy(), index=pd.DatetimeIndex(day["ts"]))
    through = actuals[actuals.index.hour <= 13]
    rf = intraday_reforecast(interval[["ts", "forecast"]], through)
    typer.echo(f"observed {rf.attrs['observed']:.0f} vs expected {rf.attrs['expected']:.0f} so far -> ratio {rf.attrs['ratio']:.2f}")
    typer.echo(rf.assign(hour=rf["ts"].dt.hour)[["hour", "forecast", "actual", "revised", "signal"]].to_string(index=False))

    _h("Staffing plan: model vs baseline (labor hours)")
    plan_model = labor.staffing_plan(interval[["ts", "forecast"]])
    plan_base = labor.staffing_plan(interval[["ts", "baseline"]], forecast_col="baseline")
    typer.echo(plan_model.assign(hour=plan_model["ts"].dt.hour).drop(columns="ts").set_index("hour").to_string())
    actual_frame = interval[["ts", "actual"]].rename(columns={"actual": "transactions"})
    for name, plan in (("baseline", plan_base), ("model", plan_model)):
        r = labor.realized_labor_cost(actual_frame, plan)
        typer.echo(
            f"{name:>8}: {plan.total.sum():.0f} labor hrs scheduled | "
            f"{r['over_hours']:.0f} hrs over (${r['over_cost']:.0f} wasted) | "
            f"{r['under_hours']:.0f} hrs under ({100 * r['under_hours_pct']:.0f}% of need)"
        )

    _h("Employee scorecards (last 90 days)")
    cards = scorecard.station_scorecards(data["shifts"])
    summary = scorecard.employee_summary(cards)
    typer.echo(summary.head(12).to_string(index=False))
    _h("Who to put where for the dinner block (6pm need, 20 people available)")
    need_row = plan_model[plan_model["ts"].dt.hour == 18].iloc[0]
    needs = {s.station: int(need_row[s.station]) for s in labor.DEFAULT_STANDARDS}
    available = summary["employee_id"].head(20).tolist()
    typer.echo(scorecard.assign_stations(cards, needs, available).to_string(index=False))

    _h("Order suggestion for next delivery (2-day lead, 3-day coverage)")
    future = frame[(frame["date"] >= tomorrow) & (frame["date"] < tomorrow + pd.Timedelta(days=7))]
    future_fc = fold_model.predict(future)
    daily_fc = pd.DataFrame({"date": future["date"].to_numpy(), "forecast": future_fc.to_numpy()}).groupby("date")["forecast"].sum().reset_index()
    mix = ordering.menu_mix(data["item_sales"], data["transactions"])
    usage = ordering.ingredient_usage(ordering.forecast_item_demand(daily_fc, mix))
    rng = np.random.default_rng(seed)
    on_hand = {k: round(float(rng.uniform(0.2, 1.2) * usage[usage.ingredient == k]["qty"].head(2).sum()), 1) for k in ordering.INGREDIENTS}
    orders = ordering.suggest_orders(usage, on_hand, forecast_wape=float(bt.summary.loc["model", "daily_wape"]))
    typer.echo(orders.to_string(index=False))
    typer.echo(f"\nTotal order ${orders.order_cost.sum():,.0f}")


@app.command()
def evaluate(data_dir: str = typer.Option(None, help="Directory of CSV exports (see docs/05). Omit for the simulated store."),
             days: int = typer.Option(60, help="Simulated history length when no data dir is given."),
             state: str = typer.Option("CO"), folds: int = typer.Option(8)) -> None:
    """First-load report: walk-forward model selection and Monte Carlo bands for the week ahead."""
    from pathlib import Path

    from flowcast.app.state import StoreState

    cfg = StoreConfig(state=state)
    st = StoreState.build(cfg, data_dir=Path(data_dir) if data_dir else None, days=days, folds=folds)
    sel = st.selection
    _h("Walk-forward model selection")
    typer.echo(f"history: {sel.weeks_of_data:.1f} weeks | windows: {sel.schedule.n_folds} x {sel.schedule.horizon_days} day(s) | confidence: {sel.confidence}")
    typer.echo(f"chosen: {sel.chosen} at {sel.blend_w:.0%} model weight")
    rep = sel.report.copy()
    rep["blend_w"] = rep["blend_w"].map(lambda w: "reference" if pd.isna(w) else f"{w:.0%}")
    for c in ("daily_wape", "hourly_wape"):
        rep[c] = (rep[c] * 100).round(1).astype(str) + "%"
    typer.echo(rep.to_string())
    for n in sel.notes:
        typer.echo("note: " + n)
    comp = st.daily_comparison()
    if not comp.empty:
        _h("Daily accuracy, walk-forward, days with real actuals")
        comp = comp.assign(daily_error=(comp["daily_error"] * 100).round(1).astype(str) + "%")
        typer.echo(comp.rename(columns={"daily_error": "daily error", "days_off_10": "days off >10%"}).to_string(index=False))
        if st.data.score_daily_only:
            typer.echo("Hourly actuals in this data are estimated; judge the model on these daily numbers only.")
    _h("Monte Carlo, week ahead (2,000 simulated days each)")
    rows = []
    for d, sim in st.sims.items():
        day = st.day(d)
        rows.append({"day": d.strftime("%a %m/%d"), "forecast": round(day["forecast"].sum()), "4wk_avg": round(day["baseline"].sum()),
                     "p10": round(sim.total_p["p10"]), "p50": round(sim.total_p["p50"]), "p90": round(sim.total_p["p90"]),
                     "P(beat 4wk)": f"{100 * sim.prob_total_above(day['baseline'].sum()):.0f}%"})
    typer.echo(pd.DataFrame(rows).to_string(index=False))
    for n in st.data.notes:
        typer.echo("data: " + n)


@app.command("import-canes")
def import_canes(
    root: str = typer.Argument(..., help="Folder holding the weekly workbooks (searched recursively), e.g. 'Canes Project/data'."),
    out: str = typer.Option("data/longmont", help="Where to write the CSVs the app reads."),
    weather: bool = typer.Option(True, help="Fetch hourly weather history for the imported dates from Open-Meteo."),
    lat: float = typer.Option(40.1672, help="Store latitude (default: Longmont, CO)."),
    lon: float = typer.Option(-105.1019, help="Store longitude."),
    tz: str = typer.Option("America/Denver"),
    open_hour: int = typer.Option(10, help="First hour the model covers."),
    close_hour: int = typer.Option(24, help="Hour after the last one the model covers (24 = midnight)."),
) -> None:
    """Import Raising Cane's weekly labor workbooks into a data folder for the app.

    Reads projected and actual customers per day, the store's half-hour forecast,
    and its planned crew per station. Runs entirely on this computer; only the
    optional weather step contacts the internet, and it sends nothing but the
    store's coordinates and a date range.
    """
    import json
    from pathlib import Path

    from flowcast.connectors.canes_workbook import (
        import_workbooks,
        school_calendar_frame,
        write_data_dir,
    )

    src, dst = Path(root).expanduser(), Path(out).expanduser()

    def progress(i, n, name):
        typer.echo(f"  [{i:3d}/{n}] {name}")

    typer.echo(f"Reading workbooks under {src} ...")
    res = import_workbooks(src, open_hour=open_hour, close_hour=close_hour, progress=progress)
    write_data_dir(res, dst, open_hour=open_hour, close_hour=close_hour)
    rep = res.report
    first, last = date.fromisoformat(rep["first_week"]), date.fromisoformat(rep["last_week"]) + timedelta(days=6)
    school_calendar_frame(first, last + timedelta(days=60)).to_csv(dst / "school.csv", index=False)

    _h("Import summary")
    typer.echo(f"weeks: {rep['weeks_imported']} ({rep['first_week']} to {rep['last_week']}) | days: {rep['days']}")
    typer.echo(f"days with actual customers: {rep['days_with_actuals']} | days missing actuals: {rep['days_missing_actuals']}")
    typer.echo(f"Wednesdays with actuals: {rep['wednesdays_with_actuals']} | closed days: {', '.join(rep['days_closed']) or 'none'}")
    typer.echo(f"share of forecast guests inside the model window ({rep['model_window']}): {rep['share_of_guests_in_model_window']:.1%}")
    typer.echo(f"stations learned from the deployment chart: {', '.join(rep['stations_learned']) or 'none'}")
    if rep["missing_weeks"]:
        typer.echo(f"weeks with no workbook: {', '.join(rep['missing_weeks'])}")
    for path, why in rep["skipped_files"] + rep["failed_files"]:
        typer.echo(f"skipped {path}: {why}")
    for name, notes in rep["week_notes"].items():
        typer.echo(f"note {name}: {'; '.join(notes)}")

    if weather:
        from flowcast.connectors.weather import fetch_history

        try:
            end = min(last, pd.Timestamp.now(tz=tz).date() - timedelta(days=2))
            fetch_history(lat, lon, first, end, tz=tz).to_csv(dst / "weather.csv", index=False)
            typer.echo(f"weather: {first} to {end} saved")
        except Exception as exc:  # noqa: BLE001 - weather is optional; the import still stands
            typer.echo(f"weather fetch failed ({type(exc).__name__}); rerun later with: flowcast weather-history {lat} {lon} {first} {last} --tz {tz} --out {dst / 'weather.csv'}")
    typer.echo(f"\nWrote {dst}. School calendar: bundled St. Vrain dates (check flowcast/reference/st_vrain_school_calendar.csv).")
    typer.echo(f"Next: flowcast evaluate --data-dir {dst}    then    FLOWCAST_DATA_DIR={dst} flowcast serve")
    (dst / "import_summary.txt").write_text(json.dumps(rep, indent=2, default=str))


@app.command()
def serve(host: str = "127.0.0.1", port: int = 8000, insecure_dev: bool = typer.Option(False, help="Allow http (no Secure cookie flag) for local development.")) -> None:
    """Run the web interface. Set FLOWCAST_* environment variables to configure."""
    import os

    import uvicorn

    if insecure_dev:
        os.environ["FLOWCAST_INSECURE_DEV"] = "1"
    from flowcast.app.main import create_app

    uvicorn.run(create_app(), host=host, port=port, log_level="info")


@app.command("weather-history")
def weather_history(lat: float, lon: float, start: str, end: str, out: str = "weather.csv", tz: str = "America/Denver") -> None:
    """Fetch hourly weather history from Open-Meteo into a CSV for FLOWCAST_DATA_DIR."""
    from flowcast.connectors.weather import fetch_history

    frame = fetch_history(lat, lon, date.fromisoformat(start), date.fromisoformat(end), tz=tz)
    frame.to_csv(out, index=False)
    typer.echo(f"wrote {len(frame)} hours to {out}")


@app.command()
def weather(lat: float, lon: float, days: int = 7, tz: str = "America/Chicago") -> None:
    """Fetch a live hourly forecast from Open-Meteo (network required)."""
    from flowcast.connectors.weather import fetch_forecast, weather_features

    typer.echo(weather_features(fetch_forecast(lat, lon, days=days, tz=tz)).to_string(index=False))


if __name__ == "__main__":
    app()
