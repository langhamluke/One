"""End-to-end run on recorded chains (skipped when fixtures are absent)."""
import glob
import os

import pytest

FIX = os.path.join(os.path.dirname(__file__), "..", "..", "data", "fixtures")
CACHE = os.path.join(os.path.dirname(__file__), "..", "..", "data", "cache")

pytestmark = pytest.mark.skipif(not glob.glob(os.path.join(FIX, "QQQ_chain_*.csv")), reason="no recorded chains")


def test_fixture_provider_and_gex_on_real_chain():
    from letf.data.fixtures import FixtureProvider
    from letf import gex, levels, ranker
    prov = FixtureProvider(FIX)
    snap = prov.chain("QQQ")
    assert snap.spot > 0 and len(snap.chain) > 50
    res = gex.analyze(snap.chain, "QQQ", snap.spot, snap.as_of, dte_filter="all")
    s = res.summary()
    assert s["call_wall"] is not None and s["put_wall"] is not None
    assert s["put_wall"] <= snap.spot <= s["call_wall"]
    assert res.flip is None or 0.8 * snap.spot < res.flip < 1.2 * snap.spot
    lv = levels.levels_from_gex(res)
    assert any(l.type == "callwall" for l in lv)
    out = ranker.rank_singles(snap.chain, snap.spot, 0.6, "LONG_CALL", snap.as_of, ranker.RankParams(n_sims=3000, max_dte=30, min_oi=1, min_volume=0), symbol="QQQ")
    assert not out.empty and out["pop"].between(0, 1).all()


def test_cli_run_offline(tmp_path):
    if not glob.glob(os.path.join(CACHE, "QQQ_daily.csv")):
        pytest.skip("no price cache")
    from letf import cli, config
    cfg = config.load("nonexistent.yaml")
    cfg.update(provider="fixtures", fixtures_dir=FIX, cache_dir=CACHE, out_dir=str(tmp_path), catalysts_yaml=os.path.join(os.path.dirname(__file__), "..", "..", "config", "catalysts.yaml"))
    cfg["sentiment"]["enabled"] = False
    cfg["ranker"]["min_oi"] = 1
    cfg["ranker"]["min_volume"] = 0
    run = cli.run_once(cfg, online=False, verbose=False)
    assert "QQQ" in run["gex"] and "QQQ" in run["signals"]
    assert os.path.exists(tmp_path / "latest.md") and os.path.exists(tmp_path / "levels_QQQ.txt")
    txt = (tmp_path / "levels_QQQ.txt").read_text()
    assert txt.startswith("#v1;sym=QQQ")
