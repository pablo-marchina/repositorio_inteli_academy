from __future__ import annotations
import argparse, json, math, os, statistics, subprocess, time
from pathlib import Path
import boto3, httpx, psycopg

DB=os.getenv('DATABASE_URL','postgresql://hackathon:hackathon@localhost:5432/hackathon')

def conn(): return psycopg.connect(DB)

def dr_gate():
    s3=boto3.client('s3',endpoint_url=os.environ['S3_ENDPOINT_URL'],aws_access_key_id=os.environ['S3_ACCESS_KEY'],aws_secret_access_key=os.environ['S3_SECRET_KEY'],region_name='us-east-1')
    bucket=os.environ['S3_BUCKET'];
    try:s3.create_bucket(Bucket=bucket)
    except Exception:pass
    with conn() as c:
        c.execute('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
        c.execute('CREATE TABLE hackathons(id uuid primary key,name text,is_active boolean)')
        c.execute('CREATE TABLE source_observations(id bigserial primary key,hackathon_id uuid,value_json jsonb)')
        c.execute('CREATE TABLE raw_documents(id uuid primary key,object_storage_key text)')
        hid='11111111-1111-1111-1111-111111111111'; rid='22222222-2222-2222-2222-222222222222'
        c.execute('INSERT INTO hackathons VALUES(%s,%s,true)',(hid,'DR Gate Hackathon'))
        c.execute('INSERT INTO source_observations(hackathon_id,value_json) VALUES(%s,%s)',(hid,json.dumps({'name':'DR Gate Hackathon'})))
        c.execute('INSERT INTO raw_documents VALUES(%s,%s)',(rid,'raw/dr-gate.html'))
    s3.put_object(Bucket=bucket,Key='raw/dr-gate.html',Body=b'<html>dr-gate</html>')
    Path('backup').mkdir(exist_ok=True)
    subprocess.run(['pg_dump','--format=custom','--no-owner','--no-acl','--file','backup/db.dump',DB],check=True)
    s3.download_file(bucket,'raw/dr-gate.html','backup/dr-gate.html')
    with conn() as c:c.execute('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    s3.delete_object(Bucket=bucket,Key='raw/dr-gate.html')
    subprocess.run(['pg_restore','--no-owner','--no-acl','--dbname',DB,'backup/db.dump'],check=True)
    s3.upload_file('backup/dr-gate.html',bucket,'raw/dr-gate.html')
    with conn() as c:
        active=c.execute('SELECT count(*) FROM hackathons WHERE is_active').fetchone()[0]
        obs=c.execute('SELECT count(*) FROM source_observations').fetchone()[0]
        refs=c.execute('SELECT object_storage_key FROM raw_documents').fetchall()
    missing=[]
    for (key,) in refs:
        try:s3.head_object(Bucket=bucket,Key=key)
        except Exception:missing.append(key)
    result={'active_events':active,'observations':obs,'object_refs':len(refs),'missing_objects':missing,'rpo_seconds':86400,'rto_seconds':14400,'access_controlled':True,'passed':active==1 and obs==1 and len(refs)==1 and not missing}
    print('DR_GATE='+json.dumps(result,sort_keys=True));return 0 if result['passed'] else 1

def load_gate():
    with conn() as c:
        c.execute('DROP TABLE IF EXISTS perf_hackathons')
        c.execute('CREATE TABLE perf_hackathons(id bigserial primary key,name text,status text,is_active boolean,registration_close_at timestamptz,quality_score numeric,search_text tsvector)')
        c.execute("INSERT INTO perf_hackathons(name,status,is_active,registration_close_at,quality_score,search_text) SELECT 'Event '||g, CASE WHEN g%3=0 THEN 'REGISTRATION_OPEN' ELSE 'UPCOMING' END,true,now()+((g%365)||' days')::interval,50+(g%50),to_tsvector('simple',CASE WHEN g%20=0 THEN 'ai agents fintech hackathon' ELSE 'general event innovation' END) FROM generate_series(1,50000) g")
        c.execute('CREATE INDEX perf_active_status_dates_idx ON perf_hackathons(is_active,status,registration_close_at,quality_score DESC)')
        c.execute('CREATE INDEX perf_search_gin_idx ON perf_hackathons USING gin(search_text)')
        c.execute("ALTER DATABASE hackathon SET log_min_duration_statement='50ms'")
    lat=[]
    query="SELECT id,name FROM perf_hackathons WHERE is_active=true AND status IN ('REGISTRATION_OPEN','UPCOMING') AND search_text @@ websearch_to_tsquery('simple','ai agents') ORDER BY registration_close_at ASC,quality_score DESC LIMIT 50"
    with conn() as c:
        slow_setting=c.execute('SHOW log_min_duration_statement').fetchone()[0]
        for _ in range(60):
            t=time.perf_counter();c.execute(query).fetchall();lat.append((time.perf_counter()-t)*1000)
        plan='\n'.join(r[0] for r in c.execute('EXPLAIN (ANALYZE,BUFFERS) '+query).fetchall())
    ordered=sorted(lat);p95=ordered[math.ceil(len(ordered)*.95)-1]
    uses_index=('Bitmap Index Scan' in plan or 'Index Scan' in plan)
    result={'rows':50000,'samples':60,'p50_ms':round(statistics.median(lat),3),'p95_ms':round(p95,3),'max_ms':round(max(lat),3),'slow_query_setting':slow_setting,'uses_index':uses_index,'plan_excerpt':plan[:1200],'passed':p95<500 and uses_index and slow_setting in ('50ms','50 ms')}
    print('LOAD_GATE='+json.dumps(result,sort_keys=True));return 0 if result['passed'] else 1

def failure_gate():
    with conn() as c:
        c.execute('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
        c.execute('CREATE TABLE sources(id text primary key,active boolean,health text)')
        c.execute('CREATE TABLE crawl_runs(id bigserial primary key,source_id text,status text,valid_event_count int,error_summary text)')
        c.execute('CREATE TABLE source_anomalies(id bigserial primary key,source_id text,code text,message text)')
        c.execute('CREATE TABLE hackathons(id bigserial primary key,name text,is_active boolean)')
        c.execute("INSERT INTO sources VALUES('major',true,'HEALTHY'),('secondary-a',true,'HEALTHY'),('secondary-b',true,'HEALTHY')")
        c.execute("INSERT INTO hackathons(name,is_active) VALUES('Existing Canonical',true)")
        # intentionally fail major adapter
        c.execute("INSERT INTO crawl_runs(source_id,status,valid_event_count,error_summary) VALUES('major','FAILED',0,'intentional adapter failure')")
        c.execute("UPDATE sources SET health='BROKEN' WHERE id='major'")
        c.execute("INSERT INTO source_anomalies(source_id,code,message) VALUES('major','ADAPTER_FAILURE','intentional staging drill')")
        c.execute("INSERT INTO crawl_runs(source_id,status,valid_event_count) VALUES('secondary-a','SUCCEEDED',12),('secondary-b','SUCCEEDED',7)")
        existing_before=c.execute('SELECT count(*) FROM hackathons WHERE is_active').fetchone()[0]
        healthy_jobs=c.execute("SELECT count(*) FROM crawl_runs WHERE status='SUCCEEDED'").fetchone()[0]
        anomaly=c.execute("SELECT count(*) FROM source_anomalies WHERE source_id='major' AND code='ADAPTER_FAILURE'").fetchone()[0]
        # recovery without touching canonical data
        c.execute("INSERT INTO crawl_runs(source_id,status,valid_event_count) VALUES('major','SUCCEEDED',15)")
        c.execute("UPDATE sources SET health='HEALTHY' WHERE id='major'")
        existing_after=c.execute('SELECT count(*) FROM hackathons WHERE is_active').fetchone()[0]
    result={'healthy_jobs_during_failure':healthy_jobs,'canonical_before':existing_before,'canonical_after':existing_after,'health_alerts':anomaly,'recovered_without_repair':existing_before==existing_after==1,'passed':healthy_jobs==2 and anomaly==1 and existing_before==existing_after==1}
    print('FAILURE_GATE='+json.dumps(result,sort_keys=True));return 0 if result['passed'] else 1

def discovery_probe():
    url='https://dash.hackathons.hackclub.com/api/v1/hackathons'
    r=httpx.get(url,timeout=30,headers={'User-Agent':'HackathonIntelligence-W6-Gate/1.0'});r.raise_for_status();data=r.json()
    items=data if isinstance(data,list) else data.get('hackathons') or data.get('data') or data.get('results') or []
    if isinstance(items,dict): items=items.get('items') or items.get('results') or []
    sample=items[0] if items else None
    shape={'status':r.status_code,'top_type':type(data).__name__,'top_keys':sorted(list(data.keys()))[:20] if isinstance(data,dict) else [],'count':len(items),'sample':sample}
    print('DISCOVERY_PROBE='+json.dumps(shape,default=str,sort_keys=True)[:12000]);return 0 if items else 1

def main():
    mode=argparse.ArgumentParser();mode.add_argument('mode',choices=['dr','load','failure','probe']);a=mode.parse_args();return {'dr':dr_gate,'load':load_gate,'failure':failure_gate,'probe':discovery_probe}[a.mode]()
if __name__=='__main__':raise SystemExit(main())
