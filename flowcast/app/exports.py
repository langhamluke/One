"""Order export templates: map a suggested order onto a vendor's file layout.

Every distributor portal (Sysco, PFG, US Foods, a franchisor order guide)
wants a slightly different flat file. A template is a small JSON spec that
the GM can edit in the UI once they have a real order guide in hand:

{
  "name": "distributor_order_guide",
  "format": "csv",                  # csv | tsv
  "header": true,
  "store_number": "0423",
  "columns": [
    {"field": "store_number", "label": "Store"},
    {"field": "vendor_code",  "label": "Item Code"},
    {"field": "ingredient",   "label": "Description"},
    {"field": "order_cases",  "label": "Cases"},
    {"field": "unit",         "label": "UOM"},
    {"field": "delivery_date","label": "Delivery", "date_format": "%m/%d/%Y"},
    {"const": "STD",          "label": "Order Type"}
  ],
  "item_codes": {"chicken_lb": "CHK-TND-40", "fries_lb": "FRY-CRK-30"},
  "skip_zero": true
}

The Raising Cane's / distributor format is not public. The built-in
"distributor_order_guide" template is a placeholder layout; replace its
columns and item codes with the real order guide when you have it.
"""

from __future__ import annotations

import csv
import io
from datetime import date

import pandas as pd

ALLOWED_FIELDS = {
    "store_number", "vendor_code", "ingredient", "order_cases", "order_units", "unit",
    "case_size", "delivery_date", "on_hand", "protected_usage", "safety_stock", "order_cost",
}

BUILTIN_TEMPLATES: dict[str, dict] = {
    "generic_csv": {
        "name": "generic_csv",
        "format": "csv",
        "header": True,
        "store_number": "",
        "columns": [
            {"field": "ingredient", "label": "ingredient"},
            {"field": "vendor_code", "label": "vendor_code"},
            {"field": "order_cases", "label": "cases"},
            {"field": "order_units", "label": "units"},
            {"field": "unit", "label": "uom"},
            {"field": "delivery_date", "label": "delivery_date", "date_format": "%Y-%m-%d"},
        ],
        "item_codes": {},
        "skip_zero": True,
    },
    "distributor_order_guide": {
        "name": "distributor_order_guide",
        "format": "csv",
        "header": True,
        "store_number": "0000",
        "columns": [
            {"field": "store_number", "label": "Store #"},
            {"field": "vendor_code", "label": "Item #"},
            {"field": "ingredient", "label": "Description"},
            {"field": "order_cases", "label": "Qty (CS)"},
            {"field": "delivery_date", "label": "Delivery Date", "date_format": "%m/%d/%Y"},
            {"const": "STD", "label": "Order Type"},
        ],
        "item_codes": {
            "chicken_lb": "CHK-TND-40", "fries_lb": "FRY-CRK-30", "toast_slice": "BRD-TX-240",
            "bun": "BRD-BUN-96", "slaw_oz": "SLW-320", "sauce_cup": "SAU-CUP-500",
            "cup_32": "CUP-32-600", "lemonade_oz": "LEM-CONC", "tea_oz": "TEA-BAG", "syrup_oz": "SYR-BIB",
        },
        "skip_zero": True,
    },
}


def validate_template(spec: dict) -> list[str]:
    errors = []
    if not isinstance(spec, dict):
        return ["template must be a JSON object"]
    if not isinstance(spec.get("name"), str) or not spec["name"].strip():
        errors.append("name is required")
    if spec.get("format", "csv") not in ("csv", "tsv"):
        errors.append("format must be csv or tsv")
    cols = spec.get("columns")
    if not isinstance(cols, list) or not cols:
        errors.append("columns must be a non-empty list")
    else:
        for i, c in enumerate(cols):
            if not isinstance(c, dict) or ("field" not in c and "const" not in c):
                errors.append(f"column {i + 1}: needs 'field' or 'const'")
            elif "field" in c and c["field"] not in ALLOWED_FIELDS:
                errors.append(f"column {i + 1}: unknown field '{c['field']}' (allowed: {', '.join(sorted(ALLOWED_FIELDS))})")
    if not isinstance(spec.get("item_codes", {}), dict):
        errors.append("item_codes must be an object")
    return errors


def render_order(spec: dict, orders: pd.DataFrame, delivery: date, case_sizes: dict[str, float]) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf, delimiter="\t" if spec.get("format") == "tsv" else ",", lineterminator="\r\n")
    cols = spec["columns"]
    if spec.get("header", True):
        writer.writerow([c.get("label", c.get("field", "")) for c in cols])
    codes = spec.get("item_codes", {})
    for r in orders.itertuples(index=False):
        if spec.get("skip_zero", True) and int(r.order_cases) == 0:
            continue
        row = []
        for c in cols:
            if "const" in c:
                row.append(c["const"])
                continue
            f = c["field"]
            if f == "store_number":
                row.append(spec.get("store_number", ""))
            elif f == "vendor_code":
                row.append(codes.get(r.ingredient, r.ingredient))
            elif f == "delivery_date":
                row.append(delivery.strftime(c.get("date_format", "%Y-%m-%d")))
            elif f == "case_size":
                row.append(case_sizes.get(r.ingredient, ""))
            else:
                row.append(getattr(r, f))
        writer.writerow(row)
    return buf.getvalue()
