"""Build the minimum viable closure-impact model (MVM) from the warehouse (opened read-only).
    python analysis/mvm/run_mvm.py            (from the project folder; ~1 min)
Writes a scratch DuckDB (analysis/mvm/mvm.duckdb, or $MVM_WORKDB) and CSVs in analysis/mvm/output/.
Steps: 01 closures + site pairs, 02 site x day x time-band volumes, 03 impact vs 6-week baseline,
       04 lookup table (the model), 05 validation (train < 2026, test 2026)."""
import os, pathlib, time, duckdb
HERE = pathlib.Path(__file__).resolve().parent
WAREHOUSE = HERE.parent.parent / "warehouse" / "city.duckdb"
WORK = pathlib.Path(os.environ.get("MVM_WORKDB", HERE / "mvm.duckdb"))
OUT = HERE / "output"; OUT.mkdir(exist_ok=True)

con = duckdb.connect(str(WORK))
con.sql(f"ATTACH '{WAREHOUSE.as_posix()}' AS w (READ_ONLY)")
for f in ["01_closures_pairs.sql", "02_site_band.sql", "03_impact.sql", "04_lookup.sql", "05_validation.sql"]:
    t = time.time(); con.sql((HERE / f).read_text(encoding="utf-8")); print(f"{f}: {time.time()-t:.1f}s")

exports = {
    "mvm_lookup": "SELECT * FROM mvm_lookup ORDER BY level, site_relation, closure_type, work_window, road_class, time_band",
    "mvm_per_closure": """SELECT p.*, c.street_name, c.side_street, c.category_clean, c.d_to, c.lat, c.lon, c.impact_text, c.work_times_text
                          FROM mvm_per_closure p JOIN mvm_closures c USING (radar_id)""",
    "mvm_validation_summary": "SELECT * FROM mvm_validation_summary",
    "mvm_validation_risk_bands": """
        WITH v AS (SELECT v.*, l.share_over_15pct_drop AS predicted_risk FROM mvm_validation v
                   JOIN mvm_lookup_train l ON l.level = v.level AND l.site_relation = v.site_relation AND l.time_band = v.time_band
                    AND l.p50 = v.p50 AND l.p10 = v.p10 AND l.n_closures = v.n_closures)
        SELECT site_relation,
               CASE WHEN predicted_risk < 0.1 THEN '1: <10%' WHEN predicted_risk < 0.2 THEN '2: 10-20%'
                    WHEN predicted_risk < 0.3 THEN '3: 20-30%' ELSE '4: >=30%' END AS predicted_risk_band,
               count(*) AS n_test, avg(predicted_risk) AS predicted_share_over_15pct_drop,
               avg((actual < -0.15)::INT) AS actual_share_over_15pct_drop
        FROM v GROUP BY ALL ORDER BY 1, 2""",
}
for name, q in exports.items():
    con.sql(q).df().to_csv(OUT / f"{name}.csv", index=False)
    print("wrote", f"output/{name}.csv")
