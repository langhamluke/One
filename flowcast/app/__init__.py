"""Self-hosted web interface for flowcast.

Design constraints, in priority order:
1. No customer, employee, or sales data leaves the operator's network. No
   external scripts, fonts, or analytics. No cloud AI calls unless the
   operator explicitly enables a provider they have cleared.
2. Every decision the system influences (send home, call in, order export,
   assistant answer) is written to an audit log with who, when, and what.
3. Everything a page shows is reproducible from the engine in `flowcast/`.
"""
