"""Run one headline-stat SQL file read-only against the warehouse and save the result as CSV.
Usage: python run_query.py 01_scats_hourly_profile.sql"""
import sys, time, pathlib, duckdb
here = pathlib.Path(__file__).resolve().parent
db = here.parent.parent / 'warehouse' / 'city.duckdb'
sql_file = here / sys.argv[1]
out = here / 'output' / (sql_file.stem + '.csv')
out.parent.mkdir(exist_ok=True)
t = time.time()
con = duckdb.connect(str(db), read_only=True)
df = con.sql(sql_file.read_text()).df()
df.to_csv(out, index=False)
print(f'{sql_file.name}: {len(df)} rows -> {out.name} in {time.time()-t:.1f}s')
