-- MVM step 3a: complete site-days for the matched signal sites, volume per time band
CREATE OR REPLACE TABLE mvm_site_band AS
WITH h AS (
  SELECT site_no, date_local, hour_local, volume, n_missing_slots
  FROM w.stg.scats_site_hour
  WHERE site_no IN (SELECT DISTINCT site_no FROM mvm_pairs)
),
ok AS (
  SELECT site_no, date_local, sum(volume) AS daily FROM h
  GROUP BY 1,2 HAVING count(*) = 24 AND max(n_missing_slots) = 0 AND sum(volume) > 0
)
SELECT h.site_no, h.date_local, ok.daily,
       CASE WHEN h.hour_local BETWEEN 7 AND 8 THEN 'AM peak' WHEN h.hour_local BETWEEN 9 AND 15 THEN 'Inter-peak'
            WHEN h.hour_local BETWEEN 16 AND 18 THEN 'PM peak' ELSE 'Night' END AS time_band,
       sum(h.volume) AS vol
FROM h JOIN ok USING (site_no, date_local)
GROUP BY ALL;
