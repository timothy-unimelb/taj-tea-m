-- 01 Network-wide traffic profile by hour of day and day type
-- Source: stg.scats_site_hour (SCATS detector volumes summed per site per local hour)
-- Period: 12 months, 1 Sep 2025 - 31 Aug 2026. Only complete site-days (24 hours, no missing slots).
-- Grain of output: one row per day_type x hour_local.
WITH complete_days AS (
    SELECT site_no, date_local
    FROM stg.scats_site_hour
    WHERE date_local BETWEEN DATE '2025-09-01' AND DATE '2026-08-31'
    GROUP BY site_no, date_local
    HAVING count(*) = 24 AND max(n_missing_slots) = 0 AND sum(volume) > 0
),
h AS (
    SELECT s.site_no, s.date_local, s.hour_local, s.volume,
           CASE WHEN c.is_public_holiday THEN 'Public holiday'
                WHEN c.dow = 6 THEN 'Saturday'
                WHEN c.dow = 7 THEN 'Sunday'
                ELSE 'Weekday' END AS day_type
    FROM stg.scats_site_hour s
    JOIN complete_days d ON d.site_no = s.site_no AND d.date_local = s.date_local
    JOIN tableau.calendar c ON c.date_local = s.date_local
)
SELECT day_type,
       hour_local,
       sum(volume)                                            AS vehicles,
       count(DISTINCT date_local)                             AS n_days,
       count(DISTINCT site_no)                                AS n_sites,
       sum(volume) / sum(sum(volume)) OVER (PARTITION BY day_type) AS share_of_day
FROM h
GROUP BY day_type, hour_local
ORDER BY day_type, hour_local
