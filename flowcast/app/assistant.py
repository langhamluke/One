"""The store assistant: answers questions from the store's own numbers.

Security posture, because the operator forbids external AI services:

- Default backend is `local`: deterministic intent matching over the
  engine's outputs. No model, no network, nothing leaves the process.
- Optional backend `ollama`: a self-hosted open-weights model running on
  the operator's own hardware. The URL must resolve to localhost or a
  private network address; public endpoints are refused at startup.
- Before any model call the context is already free of names (employees are
  IDs) and the question is scrubbed of emails, phone numbers, and card/SSN
  shaped numbers. The redaction count is logged with the exchange.
- Every question and answer is written to the assistant log with the user
  and backend, so a GM can review what was asked.

If a cleared enterprise agreement ever allows a cloud model (private
endpoint, zero retention, no training), it plugs in as another backend
behind the same policy gate. None is wired on purpose.
"""

from __future__ import annotations

import ipaddress
import re
from dataclasses import dataclass
from urllib.parse import urlparse

import httpx
import pandas as pd

EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
PHONE = re.compile(r"(?<!\d)(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}(?!\d)")
LONG_NUMBER = re.compile(r"(?<!\d)(?:\d[ -]?){13,19}(?!\d)|\b\d{3}-\d{2}-\d{4}\b")


def redact(text: str) -> tuple[str, int]:
    n = 0
    for pat, rep in ((EMAIL, "[email]"), (LONG_NUMBER, "[number]"), (PHONE, "[phone]")):
        text, k = pat.subn(rep, text)
        n += k
    return text, n


def is_private_url(url: str) -> bool:
    host = urlparse(url).hostname or ""
    if host in ("localhost",):
        return True
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return host.endswith((".local", ".internal")) or "." not in host
    return ip.is_private or ip.is_loopback


@dataclass
class Answer:
    text: str
    backend: str
    redactions: int = 0
    sources: list[str] | None = None


def _pct(x: float) -> str:
    return f"{100 * x:.1f}%"


class LocalAssistant:
    """Grounded, deterministic answers. Every reply cites which page has the detail."""

    name = "local"

    def __init__(self, state):
        self.state = state

    def answer(self, question: str) -> Answer:
        q = question.lower()
        s = self.state
        today = s.today
        s.day(today)
        ctx = s.day_context(today)

        def has(*words):
            return any(w in q for w in words)

        if has("help", "what can you"):
            return Answer(self._help(), self.name)

        if has("tomorrow"):
            d = today + pd.Timedelta(days=1)
            return Answer(self._day_summary(d), self.name, sources=["Forecast"])
        if has("week", "next 7", "7 day"):
            daily = s.week.groupby("date")[["forecast", "baseline"]].sum()
            lines = [f"{pd.Timestamp(d).strftime('%a %-m/%-d')}: {r.forecast:.0f} (4-wk avg {r.baseline:.0f})" for d, r in daily.iterrows()]
            return Answer("Forecast by day:\n" + "\n".join(lines), self.name, sources=["Forecast"])
        if has("why") and has("busy", "slow", "high", "low", "forecast", "different"):
            return Answer("Today's drivers:\n- " + "\n- ".join(s.drivers(today)), self.name, sources=["Forecast"])
        if has("send home", "send people", "cut", "call in", "call people", "ratio", "pace", "how are we doing", "so far"):
            live = s.live(as_of_hour=14)
            sig = {"hold": "Hold the schedule.", "send_home": "Trending slow: consider sending someone home.",
                   "call_in": "Trending hot: consider calling someone in."}[live["signal"]]
            return Answer(
                f"As of 2pm: {live['observed']:.0f} transactions vs {live['expected']:.0f} expected (ratio {live['ratio']:.2f}). "
                f"{sig} Remaining day now {live['remaining_forecast']:.0f} vs {live['remaining_original']:.0f} originally.",
                self.name, sources=["People: live decision"])
        if has("weather", "rain", "storm", "hot", "cold"):
            return Answer(
                f"Today: {ctx['temp_lo']:.0f}-{ctx['temp_hi']:.0f}F, {ctx['rain_in']:.2f} in of rain over {ctx['rain_hours']} hours"
                f"{', storms possible' if ctx['storm'] else ''}. Weather is in the model; see the Forecast page for the day-by-day assumptions.",
                self.name, sources=["Forecast: assumptions"])
        if has("event", "game", "concert", "festival"):
            evs = [e for d in range(7) for e in s.events_on(today + pd.Timedelta(days=d))]
            if not evs:
                return Answer("No local events loaded for the next 7 days. Add one on the Forecast page if you know of something.", self.name, sources=["Forecast: events"])
            return Answer("Events this week:\n- " + "\n- ".join(f"{e['name']} at {e['start']}, ~{e['attendance']:,} people, {e['distance_mi']:.1f} mi" for e in evs), self.name, sources=["Forecast: events"])
        if has("school"):
            return Answer(f"School today: {ctx['school']}. {'After-school rush expected 3-4pm.' if ctx['school'] == 'in session' else 'Lunch runs heavier; no after-school spike.'}", self.name, sources=["Forecast: assumptions"])
        if has("best at", "who is best", "who's best", "specialist", "put on", "lineup", "who should"):
            if s.cards.empty:
                return Answer("No shift data loaded, so there are no scorecards yet.", self.name)
            for st in sorted({c for c in s.cards["station"]}, key=len, reverse=True):
                if st.replace("_", " ") in q or st in q:
                    top = s.cards[(s.cards["station"] == st) & s.cards["sufficient_data"]].head(3)
                    return Answer(f"Best rated on {st.replace('_', ' ')}: " + ", ".join(f"{r.employee_id} ({r.composite:.0f})" for r in top.itertuples()), self.name, sources=["People: scorecards"])
            lu = s.lineup()
            return Answer("Suggested 6pm lineup:\n- " + "\n- ".join(f"{r.station.replace('_', ' ')}: {r.employee_id or 'unfilled'} ({r.score if r.score is not None else '-'})" for r in lu.itertuples()), self.name, sources=["People: lineup"])
        if has("hire", "hiring", "short on", "coverage", "cross-train", "cross train"):
            gaps = [g for g in s.hiring_needs() if g["gap"] > 0]
            if not gaps:
                return Answer("Every station has enough qualified people for the forecast peaks this week.", self.name, sources=["People: hiring"])
            return Answer("Coverage gaps:\n- " + "\n- ".join(f"{g['station'].replace('_', ' ')}: peak need {g['peak_need']}, {g['qualified']} qualified, short {g['gap']}" for g in gaps), self.name, sources=["People: hiring"])
        if has("overstaff", "over staff", "too many"):
            w = s.overstaff_warnings()
            if not w:
                return Answer("No overstaffing flagged this week versus the 4-week-average plan.", self.name, sources=["People: warnings"])
            return Answer("Overstaff warnings:\n- " + "\n- ".join(f"{pd.Timestamp(x['date']).strftime('%a %-m/%-d')}: {x['hours']} labor hours (${x['dollars']:.0f}) at {x['when']}" for x in w), self.name, sources=["People: warnings"])
        if has("order", "chicken", "inventory", "stock", "deliver"):
            orders = s.orders({}, {})
            top = orders.head(5)
            return Answer(
                "Suggested order (before on-hand counts):\n- " + "\n- ".join(f"{r.ingredient}: {r.order_cases} cases (${r.order_cost:,.0f})" for r in top.itertuples())
                + "\nEnter on-hand counts on the Ordering page for the final numbers.",
                self.name, sources=["Ordering"])
        if has("accura", "how good", "error", "trust", "wrong"):
            sm = s.bt.summary
            return Answer(
                f"Last {s.bt.predictions['fold'].nunique()} weeks: daily error {_pct(sm.loc['model', 'daily_wape'])} for the model vs {_pct(sm.loc['baseline_4wk', 'daily_wape'])} for the 4-week average; "
                f"hourly {_pct(sm.loc['model', 'hourly_wape'])} vs {_pct(sm.loc['baseline_4wk', 'hourly_wape'])}.",
                self.name, sources=["Overview: accuracy"])
        if has("staff", "how many", "schedule", "labor"):
            plan = s.week_plan()
            t = plan[plan["date"] == today]
            return Answer(f"Today's plan: {int(t['total'].sum())} labor hours, peak {int(t['total'].max())} people at {int(t.loc[t['total'].idxmax(), 'hour'])}:00. 4-week-average plan would be {int(t['baseline_total'].sum())} hours.", self.name, sources=["People: staffing"])
        if has("today", "forecast"):
            return Answer(self._day_summary(today), self.name, sources=["Forecast"])
        return Answer("I can only answer from this store's data. " + self._help(), self.name)

    def _day_summary(self, d: pd.Timestamp) -> str:
        day = self.state.day(d)
        if day.empty:
            return "No forecast for that day."
        peak = day.loc[day["forecast"].idxmax()]
        return (f"{d.strftime('%A %-m/%-d')}: {day['forecast'].sum():.0f} transactions expected "
                f"(80% range {day['low'].sum():.0f}-{day['high'].sum():.0f}), 4-week average {day['baseline'].sum():.0f}. "
                f"Peak hour {int(peak['hour'])}:00 at {peak['forecast']:.0f}. Drivers: " + " ".join(self.state.drivers(d)[1:3]))

    @staticmethod
    def _help() -> str:
        return ("Ask about: today's or tomorrow's forecast, the week, why today is busy or slow, how we are pacing (send home / call in), "
                "weather, school, events, who is best at a station, the 6pm lineup, hiring gaps, overstaffing, what to order, or forecast accuracy.")


class OllamaAssistant:
    """Self-hosted LLM over the same grounded context. Refuses non-private endpoints."""

    name = "ollama"

    def __init__(self, state, url: str, model: str, timeout: float = 60.0):
        if not is_private_url(url):
            raise ValueError(f"Refusing assistant endpoint outside the private network: {url}")
        self.state = state
        self.url = url.rstrip("/")
        self.model = model
        self.timeout = timeout
        self.local = LocalAssistant(state)

    def context(self) -> str:
        s = self.state
        today = s.today
        daily = s.week.groupby("date")[["forecast", "baseline"]].sum()
        lines = [f"Store: {s.cfg.name}. Today: {today.strftime('%A %Y-%m-%d')}.",
                 "Forecast by day (model / 4-week average): " + "; ".join(f"{pd.Timestamp(d).strftime('%a')} {r.forecast:.0f}/{r.baseline:.0f}" for d, r in daily.iterrows()),
                 "Today's drivers: " + " ".join(s.drivers(today)),
                 f"Accuracy last weeks: model daily error {_pct(s.bt.summary.loc['model', 'daily_wape'])}, baseline {_pct(s.bt.summary.loc['baseline_4wk', 'daily_wape'])}."]
        gaps = [g for g in s.hiring_needs() if g["gap"] > 0]
        if gaps:
            lines.append("Hiring gaps: " + "; ".join(f"{g['station']} short {g['gap']}" for g in gaps))
        return "\n".join(lines)

    def answer(self, question: str) -> Answer:
        clean, n = redact(question)
        system = ("You are the operations assistant for one restaurant. Answer only from the context. "
                  "If the context does not contain the answer, say so and point to the relevant page "
                  "(Overview, Forecast, People, Ordering). Never invent numbers. Employees are referred to by ID only.\n\n" + self.context())
        try:
            r = httpx.post(f"{self.url}/api/chat", json={"model": self.model, "stream": False,
                           "messages": [{"role": "system", "content": system}, {"role": "user", "content": clean}]}, timeout=self.timeout)
            r.raise_for_status()
            text = r.json()["message"]["content"].strip()
        except (httpx.HTTPError, KeyError, ValueError) as exc:
            fallback = self.local.answer(clean)
            return Answer(f"(Self-hosted model unavailable: {type(exc).__name__}. Answering from the local engine instead.)\n{fallback.text}", "local-fallback", n, fallback.sources)
        return Answer(text, self.name, n)
