-- MVM validation: build the lookup from closures starting before 2026, predict closures starting in 2026.
-- Prediction = most specific lookup level with >= 20 closures. Compared with a naive "no change" prediction.
CREATE OR REPLACE TABLE mvm_lookup_train AS SELECT * FROM mvm_build_lookup(DATE '2026-01-01');

CREATE OR REPLACE TABLE mvm_validation AS
WITH test AS (SELECT *, mvm_road_class(site_daily_volume) AS road_class FROM mvm_per_closure WHERE d_from >= DATE '2026-01-01'),
cand AS (
  SELECT t.radar_id, t.site_relation, t.time_band, t.change AS actual, l.level, l.p10, l.p50, l.p90, l.n_closures,
         row_number() OVER (PARTITION BY t.radar_id, t.site_relation, t.time_band ORDER BY l.level) AS rk
  FROM test t JOIN mvm_lookup_train l
    ON l.site_relation = t.site_relation AND l.time_band = t.time_band
   AND ((l.level = 1 AND l.closure_type = t.closure_type AND l.work_window = t.work_window AND l.road_class = t.road_class)
     OR (l.level = 2 AND l.closure_type = t.closure_type AND l.work_window = t.work_window)
     OR  l.level = 3)
)
SELECT * EXCLUDE (rk) FROM cand WHERE rk = 1;

CREATE OR REPLACE VIEW mvm_validation_summary AS
SELECT site_relation, count(*) AS n_test,
       median(abs(actual - p50)) AS mae_model, median(abs(actual)) AS mae_no_change,
       avg(abs(actual - p50)) AS mean_abs_err_model, avg(abs(actual)) AS mean_abs_err_no_change,
       avg((actual BETWEEN p10 AND p90)::INT) AS p10_p90_coverage,
       avg((level = 1)::INT) AS share_level1
FROM mvm_validation GROUP BY 1;
