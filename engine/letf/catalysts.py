"""Catalyst calendar: computed market-structure dates + fetched macro dates + user YAML.

Computed (no network): monthly OPEX (3rd Friday), quad witching, VIX expiry
(Wednesday 30 days before the next monthly OPEX), quarter-end rebalance,
Russell reconstitution (last Friday of June), Nasdaq-100 annual reconstitution
(3rd Friday of December), US election days (first Tuesday after first Monday in
November), month-end.
Fetched with cache (network optional): FOMC decision days (federalreserve.gov),
BLS CPI and Employment Situation release dates (bls.gov schedule pages).
User YAML (config/catalysts.yaml): political deadlines, IPOs, anything else.
Each catalyst has a weight 0-1 used by the signal engine.
"""
from __future__ import annotations

import calendar
import os
import re
from dataclasses import dataclass
from datetime import date, timedelta

import yaml

try:
    import requests
except Exception:  # pragma: no cover
    requests = None

DEFAULT_WEIGHTS = {"FOMC": 1.0, "CPI": 0.9, "NFP": 0.8, "OPEX": 0.6, "QUAD_WITCH": 0.8, "VIXEXP": 0.4,
                   "QTR_END": 0.5, "RUSSELL_RECON": 0.5, "NDX_RECON": 0.4, "ELECTION": 0.9, "MONTH_END": 0.3,
                   "EARNINGS": 0.7, "POLITICAL": 0.7, "IPO": 0.3, "PCE": 0.5, "GDP": 0.4, "OTHER": 0.3}

# Fallback FOMC decision dates (second day of each meeting). Verified against the
# Fed's published 2025 schedule; 2026 dates are the Fed's announced tentative
# schedule as of early 2026 and are overwritten by the live fetch when available.
FALLBACK_FOMC = {
    2025: ["2025-01-29", "2025-03-19", "2025-05-07", "2025-06-18", "2025-07-30", "2025-09-17", "2025-10-29", "2025-12-10"],
    2026: ["2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17", "2026-07-29", "2026-09-16", "2026-10-28", "2026-12-09"],
}


@dataclass(frozen=True)
class Catalyst:
    day: date
    kind: str
    label: str
    weight: float = 0.5
    source: str = "computed"

    def days_until(self, today: date) -> int:
        return (self.day - today).days


def nth_weekday(year: int, month: int, weekday: int, n: int) -> date:
    first = date(year, month, 1)
    offset = (weekday - first.weekday()) % 7
    return first + timedelta(days=offset + 7 * (n - 1))


def last_weekday(year: int, month: int, weekday: int) -> date:
    last = date(year, month, calendar.monthrange(year, month)[1])
    return last - timedelta(days=(last.weekday() - weekday) % 7)


def monthly_opex(year: int, month: int) -> date:
    return nth_weekday(year, month, calendar.FRIDAY, 3)


def vix_expiry(year: int, month: int) -> date:
    """Wednesday 30 days before the *next* month's monthly OPEX."""
    ny, nm = (year + 1, 1) if month == 12 else (year, month + 1)
    d = monthly_opex(ny, nm) - timedelta(days=30)
    while d.weekday() != calendar.WEDNESDAY:
        d -= timedelta(days=1)
    return d


def us_election_day(year: int) -> date:
    first_monday = nth_weekday(year, 11, calendar.MONDAY, 1)
    return first_monday + timedelta(days=1)


def computed(start: date, end: date) -> list[Catalyst]:
    out = []
    y, m = start.year, start.month
    while date(y, m, 1) <= end:
        opx = monthly_opex(y, m)
        if m in (3, 6, 9, 12):
            out.append(Catalyst(opx, "QUAD_WITCH", "Quad witching / S&P rebalance", DEFAULT_WEIGHTS["QUAD_WITCH"]))
        else:
            out.append(Catalyst(opx, "OPEX", "Monthly OPEX", DEFAULT_WEIGHTS["OPEX"]))
        out.append(Catalyst(vix_expiry(y, m), "VIXEXP", "VIX expiration", DEFAULT_WEIGHTS["VIXEXP"]))
        last = date(y, m, calendar.monthrange(y, m)[1])
        while last.weekday() >= 5:
            last -= timedelta(days=1)
        if m in (3, 6, 9, 12):
            out.append(Catalyst(last, "QTR_END", "Quarter-end rebalance", DEFAULT_WEIGHTS["QTR_END"]))
        else:
            out.append(Catalyst(last, "MONTH_END", "Month-end", DEFAULT_WEIGHTS["MONTH_END"]))
        if m == 6:
            out.append(Catalyst(last_weekday(y, 6, calendar.FRIDAY), "RUSSELL_RECON", "Russell reconstitution", DEFAULT_WEIGHTS["RUSSELL_RECON"]))
        if m == 12:
            out.append(Catalyst(opx, "NDX_RECON", "Nasdaq-100 reconstitution", DEFAULT_WEIGHTS["NDX_RECON"]))
        if m == 11 and y % 2 == 0:
            out.append(Catalyst(us_election_day(y), "ELECTION", "US election day", DEFAULT_WEIGHTS["ELECTION"]))
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    for yr, days in FALLBACK_FOMC.items():
        for d in days:
            dd = date.fromisoformat(d)
            if start <= dd <= end:
                out.append(Catalyst(dd, "FOMC", "FOMC decision", DEFAULT_WEIGHTS["FOMC"], "fallback"))
    return [c for c in out if start <= c.day <= end]


def _cache_read(path: str) -> str | None:
    if os.path.exists(path) and (date.today() - date.fromtimestamp(os.path.getmtime(path))).days < 7:
        with open(path) as f:
            return f.read()
    return None


def fetch_fomc(year: int, cache_dir: str) -> list[Catalyst]:
    """Scrape decision days from the Fed's FOMC calendar page. Returns [] when offline."""
    if requests is None:
        return []
    os.makedirs(cache_dir, exist_ok=True)
    cache = os.path.join(cache_dir, "fomc.html")
    html = _cache_read(cache)
    if html is None:
        try:
            r = requests.get("https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm", timeout=15, headers={"User-Agent": "letf-engine"})
            r.raise_for_status()
            html = r.text
            with open(cache, "w") as f:
                f.write(html)
        except Exception:
            return []
    out = []
    # Blocks look like: <div class="fomc-meeting__month">January</div><div class="fomc-meeting__date">27-28</div>
    # within a panel whose heading contains the year.
    for ym in re.finditer(r"(\d{4}) FOMC Meetings(.*?)(?=\d{4} FOMC Meetings|$)", html, re.S):
        yr = int(ym.group(1))
        if yr != year:
            continue
        for m in re.finditer(r'fomc-meeting__month">\s*<strong>([A-Za-z/]+)</strong>.*?fomc-meeting__date">\s*(?:<strong>)?([0-9]+)(?:-([0-9]+))?', ym.group(2), re.S):
            month_txt, d1, d2 = m.group(1), m.group(2), m.group(3)
            month_name = month_txt.split("/")[-1]
            try:
                mon = list(calendar.month_name).index(month_name[:3].title() if month_name[:3].title() in [x[:3] for x in calendar.month_name] else month_name)
            except ValueError:
                mon = next((i for i, n in enumerate(calendar.month_name) if n.startswith(month_name[:3])), 0)
            if not mon:
                continue
            day = int(d2 or d1)
            try:
                out.append(Catalyst(date(yr, mon, day), "FOMC", "FOMC decision", DEFAULT_WEIGHTS["FOMC"], "federalreserve.gov"))
            except ValueError:
                continue
    return out


def fetch_bls(year: int, cache_dir: str) -> list[Catalyst]:
    """CPI and Employment Situation release dates from bls.gov schedule pages. [] when offline."""
    if requests is None:
        return []
    os.makedirs(cache_dir, exist_ok=True)
    out = []
    for kind, url, label in (("CPI", f"https://www.bls.gov/schedule/news_release/cpi.htm", "CPI release 8:30 ET"),
                             ("NFP", f"https://www.bls.gov/schedule/news_release/empsit.htm", "Jobs report 8:30 ET")):
        cache = os.path.join(cache_dir, f"bls_{kind}.html")
        html = _cache_read(cache)
        if html is None:
            try:
                r = requests.get(url, timeout=15, headers={"User-Agent": "Mozilla/5.0 letf-engine"})
                r.raise_for_status()
                html = r.text
                with open(cache, "w") as f:
                    f.write(html)
            except Exception:
                continue
        for m in re.finditer(r"([A-Z][a-z]+\.?\s+\d{1,2},\s+(\d{4}))", html):
            txt, yr = m.group(1).replace(".", ""), int(m.group(2))
            if yr != year:
                continue
            try:
                mon_name, rest = txt.split(" ", 1)
                day = int(rest.split(",")[0])
                mon = next(i for i, n in enumerate(calendar.month_name) if n and n.startswith(mon_name[:3]))
                out.append(Catalyst(date(yr, mon, day), kind, label, DEFAULT_WEIGHTS[kind], "bls.gov"))
            except Exception:
                continue
    return sorted(set(out), key=lambda c: c.day)


def from_yaml(path: str) -> list[Catalyst]:
    if not os.path.exists(path):
        return []
    with open(path) as f:
        doc = yaml.safe_load(f) or {}
    out = []
    for item in doc.get("catalysts", []):
        try:
            d = item["date"] if isinstance(item["date"], date) else date.fromisoformat(str(item["date"]))
            kind = str(item.get("kind", "OTHER")).upper()
            out.append(Catalyst(d, kind, str(item.get("label", kind)), float(item.get("weight", DEFAULT_WEIGHTS.get(kind, 0.3))), "yaml"))
        except Exception:
            continue
    return out


def calendar_for(today: date, horizon_days: int = 45, yaml_path: str = "config/catalysts.yaml", cache_dir: str = "data/cache", online: bool = True) -> list[Catalyst]:
    end = today + timedelta(days=horizon_days)
    items = computed(today, end)
    if online:
        live = fetch_fomc(today.year, cache_dir) + (fetch_fomc(end.year, cache_dir) if end.year != today.year else [])
        if live:
            items = [c for c in items if c.kind != "FOMC"] + [c for c in live if today <= c.day <= end]
        items += [c for c in fetch_bls(today.year, cache_dir) if today <= c.day <= end]
    items += [c for c in from_yaml(yaml_path) if today <= c.day <= end]
    uniq = {}
    for c in items:
        uniq.setdefault((c.day, c.kind), c)
    return sorted(uniq.values(), key=lambda c: (c.day, -c.weight))


def catalyst_pressure(cal: list[Catalyst], today: date, window: int = 5) -> tuple[float, list[Catalyst]]:
    """0-1 score of catalyst density in the next `window` trading-ish days, decayed by distance."""
    soon = [c for c in cal if 0 <= c.days_until(today) <= window]
    score = 0.0
    for c in soon:
        score += c.weight * (1.0 - 0.12 * c.days_until(today))
    return min(score, 1.0), soon
