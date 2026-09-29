-- MVM step 1+2: closures (RADAR, Greater Melbourne, <=7 days, 2024-01-01..2026-09-23) and signal sites within 200 m
-- Run inside analysis/mvm/mvm.duckdb with the warehouse attached read-only as w.
CREATE OR REPLACE TABLE mvm_closures AS
WITH c AS (
  SELECT radar_id, category_clean, street_name, side_street, end_side_street, description, lat, lon, lv_access, hv_access,
         ts_from, ts_to,
         CAST(timezone('Australia/Melbourne', ts_from) AS DATE) AS d_from,
         CAST(timezone('Australia/Melbourne', ts_to)   AS DATE) AS d_to
  FROM w.stg.radar_roadworks
  WHERE state = 'VIC' AND lat BETWEEN -38.2 AND -37.5 AND lon BETWEEN 144.5 AND 145.5
    AND category_clean IN ('Planned Roadworks','Unplanned Roadworks','Utilities / Construction','Planned Event')
    AND street_name IS NOT NULL
)
SELECT *,
  -- DTP planned-disruption text: "... during the following times: Weekdays 8:00 PM to 5:00 AM. Impact to traffic will be lanes closed both directions."
  CASE WHEN regexp_matches(lower(coalesce(description,'')), 'impact to traffic will be (road|carriageway) closed|road (is |will be )?closed|full (road )?closure|closed to (all )?traffic') THEN 'road closed'
       WHEN regexp_matches(lower(coalesce(description,'')), 'impact to traffic will be [^.]*ramp') THEN 'ramp closed'
       WHEN regexp_matches(lower(coalesce(description,'')), 'impact to traffic will be [^.]*lane') THEN 'lanes closed'
       ELSE 'unspecified' END AS closure_type,
  regexp_extract(description, 'Impact to traffic will be ([^.]*)', 1) AS impact_text,
  regexp_extract(description, 'during the following times: ([^.]*?)\. Impact', 1) AS work_times_text,
  CASE WHEN regexp_matches(coalesce(description,''), '(Weekdays|Weekends) 12:00 AM to 12:00 AM') THEN '24 hours'
       WHEN regexp_matches(coalesce(description,''), '(Weekdays|Weekends) ([7-9]|1[01]):[0-9]{2} PM to ([1-9]|1[0-2]):[0-9]{2} AM')
         OR regexp_matches(coalesce(description,''), '(Weekdays|Weekends) 12:[0-9]{2} AM to [1-6]:[0-9]{2} AM') THEN 'night'
       WHEN regexp_matches(coalesce(description,''), '(Weekdays|Weekends) ([5-9]|1[01]):[0-9]{2} AM to ([1-9]|1[0-2]):[0-9]{2} (AM|PM)') THEN 'day'
       ELSE 'unspecified' END AS work_window,
  trim(regexp_replace(regexp_replace(upper(street_name), '\s*-\s.*$', ''),
        '\s+(STREET|ST|ROAD|RD|AVENUE|AVE|AV|HIGHWAY|HWY|PARADE|PDE|DRIVE|DR|BOULEVARD|BVD|BLVD|LANE|LA|PLACE|PL|CRESCENT|CRES|WAY|FREEWAY|FWY|TERRACE|TCE|GROVE|GR|COURT|CT)\b.*$', '')) AS street_key
FROM c
WHERE d_to >= DATE '2024-01-01' AND d_from <= DATE '2026-09-23' AND d_to - d_from BETWEEN 0 AND 7;

CREATE OR REPLACE TABLE mvm_pairs AS
WITH p AS (
  SELECT c.radar_id, s.site_no, s.site_name,
         2*6371000*asin(sqrt(pow(sin(radians(s.lat-c.lat)/2),2) + cos(radians(c.lat))*cos(radians(s.lat))*pow(sin(radians(s.lon-c.lon)/2),2))) AS dist_m,
         length(c.street_key) >= 3 AND strpos(upper(s.site_name), c.street_key) > 0 AS same_street
  FROM mvm_closures c
  JOIN w.stg.scats_sites s ON s.site_type = 'INT' AND abs(s.lat - c.lat) < 0.002 AND abs(s.lon - c.lon) < 0.0025
)
SELECT * FROM p WHERE dist_m <= 200;
