from datetime import date

import pytest

from flowcast.features import build_features
from flowcast.synth import StoreConfig, generate_store


@pytest.fixture(scope="session")
def store():
    # ~13 months: enough for 4-week lags, one of every season, and a short backtest.
    return generate_store(StoreConfig(), date(2025, 9, 1), date(2026, 10, 6), seed=3)


@pytest.fixture(scope="session")
def frame(store):
    return build_features(store["transactions"], store["weather"], store["calendar"], store["events"])
