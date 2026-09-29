-- MVM step 3b: observed band volume on each closure day vs median of the same site/band/weekday over the previous 6 weeks.
-- Baseline weeks exclude public holidays and days when any closure was active within 200 m of that site.
CREATE OR REPLACE TABLE mvm_site_closure_days AS
SELECT DISTINCT p.site_no, unnest(generate_series(c.d_from, c.d_to, INTERVAL 1 DAY))::DATE AS d
FROM mvm_pairs p JOIN mvm_closures c USING (radar_id);

CREATE OR REPLACE TABLE mvm_impact AS
WITH days AS (
  SELECT p.radar_id, p.site_no, p.same_street, p.dist_m,
         unnest(generate_series(c.d_from, c.d_to, INTERVAL 1 DAY))::DATE AS d
  FROM mvm_pairs p JOIN mvm_closures c USING (radar_id)
),
obs AS (
  SELECT d.*, b.time_band, b.vol AS observed, b.daily AS observed_daily
  FROM days d
  JOIN mvm_site_band b ON b.site_no = d.site_no AND b.date_local = d.d
  JOIN w.main.dim_date k ON k.date_local = d.d
  WHERE NOT k.is_public_holiday
),
base AS (
  SELECT o.radar_id, o.site_no, o.d, o.time_band,
         median(b.vol) AS baseline, median(b.daily) AS baseline_daily, count(*) AS n_base
  FROM obs o
  JOIN mvm_site_band b ON b.site_no = o.site_no AND b.time_band = o.time_band
   AND b.date_local IN (o.d - 7, o.d - 14, o.d - 21, o.d - 28, o.d - 35, o.d - 42)
  JOIN w.main.dim_date k ON k.date_local = b.date_local AND NOT k.is_public_holiday
  WHERE NOT EXISTS (SELECT 1 FROM mvm_site_closure_days x WHERE x.site_no = b.site_no AND x.d = b.date_local)
  GROUP BY ALL
)
SELECT o.*, base.baseline, base.baseline_daily, base.n_base,
       o.observed / nullif(base.baseline, 0) - 1 AS change
FROM obs o JOIN base USING (radar_id, site_no, d, time_band)
WHERE base.n_base >= 3 AND base.baseline > 0;
