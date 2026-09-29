-- 02 Average daily traffic per SCATS site by day type
-- Source: stg.scats_site_hour + stg.scats_sites (names, type, location)
-- Period: 1 Sep 2025 - 31 Aug 2026, complete site-days only (24 hours, no missing slots).
-- Grain of output: one row per site x day_type.
WITH site_day AS (
    SELECT site_no, date_local, sum(volume) AS daily_vehicles
    FROM stg.scats_site_hour
    WHERE date_local BETWEEN DATE '2025-09-01' AND DATE '2026-08-31'
    GROUP BY site_no, date_local
    HAVING count(*) = 24 AND max(n_missing_slots) = 0 AND sum(volume) > 0
),
typed AS (
    SELECT d.*, CASE WHEN c.is_public_holiday THEN 'Public holiday'
                     WHEN c.dow = 6 THEN 'Saturday'
                     WHEN c.dow = 7 THEN 'Sunday'
                     ELSE 'Weekday' END AS day_type
    FROM site_day d JOIN tableau.calendar c ON c.date_local = d.date_local
)
SELECT t.site_no, s.site_name, s.site_type, s.lat, s.lon, t.day_type,
       count(*)                    AS n_days,
       avg(t.daily_vehicles)       AS avg_daily_vehicles,
       median(t.daily_vehicles)    AS median_daily_vehicles
FROM typed t
LEFT JOIN stg.scats_sites s ON s.site_no = t.site_no
GROUP BY ALL
ORDER BY avg_daily_vehicles DESC
