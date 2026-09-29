"""Minimum viable closure-impact model: lookup (learned from ~2,700 past Melbourne closures) + hour-by-hour queue.

    from mvm_predict import predict, compare_windows
    r = predict(closure_type="lanes closed", work_window="night", aadt=40000, lanes_per_direction=2, lanes_open=1,
                site_no=4391)                      # site_no (nearest signal) sets the road class; or pass road_class=
    print(r["summary"]); print(r["hourly"])
    print(compare_windows("lanes closed", aadt=40000, lanes_per_direction=2, lanes_open=1, site_no=4391))

Inputs
  closure_type : 'lanes closed' | 'ramp closed' | 'unspecified'   (as in the RADAR/DTP text)
  work_window  : 'night' (20:00-05:00) | 'day' (09:00-15:00) | '24 hours'
  aadt         : two-way daily traffic on the closed road (e.g. from stg.aadt), one direction assumed = 50 %
  lanes_per_direction, lanes_open : lanes in the affected direction, and lanes left open while works are active
Assumptions (all overridable, state them on the slide)
  capacity_per_lane = 800 veh/h (signalised arterial ~1,800 veh/h of green x ~45 % green)
  work_zone_factor  = 0.85 (capacity of open lanes next to works)
  max_queue_m_per_lane = 500 (queue drivers tolerate; vehicles beyond it are counted as forced diversions)
  value_of_time_per_veh_h = None (set from ATAP guidance to get $; left blank until verified)
Output: expected change in traffic (P10/P50/P90 from the lookup, with n past closures), vehicle-hours of delay,
        max queue length (m) and queue duration, for P50 and for the P10 (worse-case: less diversion) scenario."""
import pathlib
import pandas as pd

HERE = pathlib.Path(__file__).resolve().parent
LOOKUP = pd.read_csv(HERE / "output" / "mvm_lookup.csv")
PROFILE = pd.read_csv(HERE.parent / "headline_stats" / "output" / "01_scats_hourly_profile.csv")
SITES = pd.read_csv(HERE.parent / "headline_stats" / "output" / "02_scats_site_daily.csv")

WINDOWS = {"night": list(range(20, 24)) + list(range(0, 5)), "day": list(range(9, 15)), "24 hours": list(range(24))}
BAND = {h: ("AM peak" if 7 <= h <= 8 else "Inter-peak" if 9 <= h <= 15 else "PM peak" if 16 <= h <= 18 else "Night")
        for h in range(24)}


def road_class_from_volume(v):
    return "low (<20k/day)" if v < 20000 else "medium (20-40k/day)" if v < 40000 else "high (>40k/day)"


def lookup(closure_type, work_window, time_band, road_class, site_relation="same street"):
    """most specific lookup row with >= 20 past closures (level 1 -> 2 -> 3)"""
    L = LOOKUP[(LOOKUP.site_relation == site_relation) & (LOOKUP.time_band == time_band)]
    for lvl, cond in [(1, (L.closure_type == closure_type) & (L.work_window == work_window) & (L.road_class == road_class)),
                      (2, (L.closure_type == closure_type) & (L.work_window == work_window)),
                      (3, L.level == 3)]:
        hit = L[(L.level == lvl) & cond]
        if len(hit):
            return hit.iloc[0].to_dict()
    raise ValueError("no lookup row")


def predict(closure_type="lanes closed", work_window="night", aadt=30000, lanes_per_direction=2, lanes_open=1,
            site_no=None, road_class=None, day_type="Weekday", direction_split=0.5,
            capacity_per_lane=800, work_zone_factor=0.85, value_of_time_per_veh_h=None, veh_length_m=7.0,
            max_queue_m_per_lane=500):
    if road_class is None:
        if site_no is None:
            raise ValueError("give site_no (nearest signalised intersection) or road_class")
        s = SITES[(SITES.site_no == site_no) & (SITES.day_type == "Weekday")]
        road_class = road_class_from_volume(float(s.avg_daily_vehicles.iloc[0])) if len(s) else "medium (20-40k/day)"
    prof = PROFILE[PROFILE.day_type == day_type].set_index("hour_local").share_of_day
    active = set(WINDOWS[work_window])
    max_queue_veh = max_queue_m_per_lane / veh_length_m * max(lanes_open, 1)
    rows, q = [], {"typical": 0.0, "worst": 0.0}
    for h in list(range(5, 24)) + list(range(0, 5)):          # start at 05:00 so overnight works run continuously
        band = BAND[h]
        lk = lookup(closure_type, work_window, band, road_class)
        demand = aadt * direction_split * float(prof.get(h, 0))
        works = h in active
        cap = (lanes_open * capacity_per_lane * work_zone_factor) if works else lanes_per_direction * capacity_per_lane
        row = {"hour": h, "time_band": band, "works_active": works, "base_demand_veh_h": round(demand),
               "capacity_veh_h": round(cap), "lookup_level": int(lk["level"]), "n_past_closures": int(lk["n_closures"])}
        # typical = P50 traffic change from past closures; worst = P90 (least traffic avoided the site)
        for sc, change in [("typical", lk["p50"]), ("worst", lk["p90"])]:
            d = demand * (1 + (change if works else 0.0))
            q_prev = q[sc]
            q_new = max(0.0, q_prev + d - cap)
            forced = max(0.0, q_new - max_queue_veh)                # beyond the tolerable queue, drivers divert
            q[sc] = q_new - forced
            row[f"demand_{sc}"] = round(d); row[f"queue_veh_{sc}"] = round(q[sc])
            row[f"forced_diversion_veh_{sc}"] = round(forced); row[f"delay_veh_h_{sc}"] = (q_prev + q[sc]) / 2
        rows.append(row)
    hourly = pd.DataFrame(rows)
    lk_w = lookup(closure_type, work_window, "Night" if work_window == "night" else "Inter-peak", road_class)
    summ = {"closure_type": closure_type, "work_window": work_window, "road_class": road_class,
            "traffic_change_typical": lk_w["p50"], "traffic_change_range": (lk_w["p10"], lk_w["p90"]),
            "chance_of_over_15pct_drop": lk_w["share_over_15pct_drop"], "based_on_n_past_closures": int(lk_w["n_closures"]),
            "lookup_level": int(lk_w["level"])}
    for sc in ["typical", "worst"]:
        delay = hourly[f"delay_veh_h_{sc}"].sum()
        summ[f"delay_veh_h_{sc}"] = round(delay, 1)
        summ[f"max_queue_m_{sc}"] = round(hourly[f"queue_veh_{sc}"].max() * veh_length_m / max(lanes_open, 1))
        summ[f"queue_hours_{sc}"] = int((hourly[f"queue_veh_{sc}"] > 0).sum())
        summ[f"forced_diversions_veh_{sc}"] = int(hourly[f"forced_diversion_veh_{sc}"].sum())
        if value_of_time_per_veh_h:
            summ[f"delay_cost_{sc}"] = round(delay * value_of_time_per_veh_h)
    return {"summary": summ, "hourly": hourly}


def compare_windows(closure_type="lanes closed", **kw):
    out = []
    for w in ["night", "day", "24 hours"]:
        s = predict(closure_type=closure_type, work_window=w, **kw)["summary"]
        out.append({k: s[k] for k in s if k not in ("traffic_change_range",)})
    df = pd.DataFrame(out).sort_values("delay_veh_h_worst")
    df["recommended"] = df.index == df.index[0]
    return df


if __name__ == "__main__":
    pd.set_option("display.width", 200)
    print(compare_windows("lanes closed", aadt=40000, lanes_per_direction=2, lanes_open=1, site_no=4391).to_string(index=False))
