"""Level objects, strength scoring, leveraged-ETF mapping, and the Pine paste block."""
from __future__ import annotations

from dataclasses import dataclass, asdict
from datetime import date
from typing import Iterable

import numpy as np

from .gex import GexResult, map_level_leveraged, map_level

LEVERAGE = {"TQQQ": ("QQQ", 3.0), "UPRO": ("SPY", 3.0), "SQQQ": ("QQQ", -3.0), "SPXU": ("SPY", -3.0), "QLD": ("QQQ", 2.0), "SSO": ("SPY", 2.0)}


@dataclass
class Level:
    type: str      # flip, callwall, putwall, maxpain, vt, hvl, lvl, em_hi, em_lo
    price: float
    strength: int  # 0-100
    label: str = ""

    def pine_row(self) -> str:
        return f"{self.type},{self.price:.2f},{int(self.strength)},{self.label}"


def _strength_from_table(res: GexResult, strike: float, col: str) -> int:
    t = res.strike_table
    if t.empty or strike not in t.index:
        return 50
    v = abs(float(t.loc[strike, col]))
    mx = float(t[col].abs().max()) or 1.0
    return int(np.clip(round(100 * v / mx), 10, 100))


def levels_from_gex(res: GexResult, extra_walls: int = 2) -> list[Level]:
    out: list[Level] = []
    if res.flip is not None:
        out.append(Level("flip", res.flip, 80, "Gamma flip"))
    if res.call_wall is not None:
        out.append(Level("callwall", res.call_wall, _strength_from_table(res, res.call_wall, "call_gex"), "Call wall"))
        for k in res.walls.get("call_walls", [])[1:1 + extra_walls]:
            out.append(Level("lvl", k, _strength_from_table(res, k, "call_gex") // 2, "Call GEX"))
    if res.put_wall is not None:
        out.append(Level("putwall", res.put_wall, _strength_from_table(res, res.put_wall, "put_gex"), "Put wall"))
        for k in res.walls.get("put_walls", [])[1:1 + extra_walls]:
            out.append(Level("lvl", k, _strength_from_table(res, k, "put_gex") // 2, "Put GEX"))
    if res.max_pain is not None:
        out.append(Level("maxpain", res.max_pain, 50, "Max pain"))
    # largest vanna strike (hvl) as a secondary magnet
    t = res.strike_table
    if not t.empty and t["vex"].abs().max() > 0:
        k = float(t["vex"].abs().idxmax())
        out.append(Level("hvl", k, 40, "Vanna peak"))
    em = res.expected_move
    if em.get("iv_move_1sd"):
        out.append(Level("em_hi", res.spot + em["iv_move_1sd"], 30, "+1σ expected move"))
        out.append(Level("em_lo", res.spot - em["iv_move_1sd"], 30, "-1σ expected move"))
    return out


def map_levels(levels: Iterable[Level], src_spot: float, dst_spot: float, leverage: float) -> list[Level]:
    out = []
    for lv in levels:
        p = map_level_leveraged(lv.price, src_spot, dst_spot, leverage)
        if leverage < 0:  # inverse ETF: walls swap roles
            t = {"callwall": "putwall", "putwall": "callwall", "em_hi": "em_lo", "em_lo": "em_hi"}.get(lv.type, lv.type)
            out.append(Level(t, p, lv.strength, lv.label))
        else:
            out.append(Level(lv.type, p, lv.strength, lv.label))
    return out


def pine_block(levels: Iterable[Level], sym: str, as_of: date, src: str, ratio: float, catalysts: Iterable[tuple[date, str]] = ()) -> str:
    lines = [f"#v1;sym={sym};date={as_of.isoformat()};src={src};ratio={ratio:.4f}"]
    lines += [lv.pine_row() for lv in levels]
    lines += [f"catalyst,{d.isoformat()},{label}" for d, label in catalysts]
    return "\n".join(lines) + "\n"
