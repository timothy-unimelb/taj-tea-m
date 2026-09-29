-- MVM step 4: the lookup table (the model). One value per closure first, so long closures don't dominate.
-- level 1 = closure_type x work_window x time_band x road_class ; level 2 = without road_class ; level 3 = time_band only.
-- Parameter: training period (default = all closures). Validation re-runs this with d_from < 2026-01-01.
CREATE OR REPLACE TABLE mvm_per_closure AS
SELECT i.radar_id, c.closure_type, c.work_window, i.time_band,
       CASE WHEN i.same_street THEN 'same street' ELSE 'cross street' END AS site_relation,
       c.d_from,
       median(i.change) AS change,
       median(i.baseline_daily) AS site_daily_volume,
       count(DISTINCT i.d) AS n_days, count(DISTINCT i.site_no) AS n_sites
FROM mvm_impact i JOIN mvm_closures c USING (radar_id)
GROUP BY ALL;

CREATE OR REPLACE MACRO mvm_road_class(v) AS
  CASE WHEN v < 20000 THEN 'low (<20k/day)' WHEN v < 40000 THEN 'medium (20-40k/day)' ELSE 'high (>40k/day)' END;

CREATE OR REPLACE MACRO mvm_build_lookup(train_before) AS TABLE
WITH pc AS (SELECT *, mvm_road_class(site_daily_volume) AS road_class FROM mvm_per_closure WHERE d_from < train_before),
g AS (
  SELECT 1 AS level, site_relation, closure_type, work_window, time_band, road_class, change FROM pc
  UNION ALL SELECT 2, site_relation, closure_type, work_window, time_band, 'any', change FROM pc
  UNION ALL SELECT 3, site_relation, 'any', 'any', time_band, 'any', change FROM pc
)
SELECT level, site_relation, closure_type, work_window, time_band, road_class,
       count(*) AS n_closures,
       quantile_cont(change, 0.1) AS p10, quantile_cont(change, 0.5) AS p50, quantile_cont(change, 0.9) AS p90,
       avg(change) AS mean_change,
       avg((change < -0.15)::INT) AS share_over_15pct_drop
FROM g GROUP BY ALL HAVING count(*) >= 20;

CREATE OR REPLACE TABLE mvm_lookup AS SELECT * FROM mvm_build_lookup(DATE '2100-01-01');
