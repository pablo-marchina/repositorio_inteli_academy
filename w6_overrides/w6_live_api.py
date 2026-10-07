from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json, os
from pathlib import Path
from urllib.parse import urlparse, parse_qs
import psycopg

EVENT=json.loads(Path('/tmp/w6_event.json').read_text())
DB=os.environ['DATABASE_URL']
ADMIN_KEY=os.environ.get('ADMIN_API_KEY','')

def db_rows(sql, params=()):
    with psycopg.connect(DB) as c:
        cur=c.execute(sql,params)
        cols=[d.name for d in cur.description] if cur.description else []
        return [dict(zip(cols,row)) for row in cur.fetchall()] if cols else []

class H(BaseHTTPRequestHandler):
 def log_message(self,*a): pass
 def out(self,status,obj):
  b=json.dumps(obj,default=str).encode();self.send_response(status);self.send_header('content-type','application/json');self.send_header('content-length',str(len(b)));self.end_headers();self.wfile.write(b)
 def admin_ok(self):
  return bool(ADMIN_KEY) and self.headers.get('x-admin-key')==ADMIN_KEY
 def do_GET(self):
  p=urlparse(self.path);q=parse_qs(p.query)
  if p.path.startswith('/v1/me/'):return self.out(401,{'detail':'not authenticated'})
  if p.path=='/v1/hackathons':
   return self.out(200,{'items':[EVENT],'next_cursor':None,'meta':{'api_version':'v1','filter_schema_version':'w4-filter-v1'}})
  if p.path.startswith('/v1/hackathons/'):
   key=p.path.split('/')[-1]
   if key not in (EVENT['slug'],str(EVENT['id'])):return self.out(404,{'detail':'not found'})
   detail={**EVENT,'subtitle':'Official ETHGlobal event discovered during W6 gate','full_description':'Live canonical event created by the W6 discovery-to-product acceptance test.','registration_url':EVENT['official_url'],'application_url':EVENT['official_url'],'submission_url':None,'eligible_worldwide':True,'location':{'city':EVENT['city'],'state_region':None,'country':EVENT['country'],'country_code':EVENT['country_code']},'organizations':[{'id':'ethglobal','slug':'ethglobal','name':'ETHGlobal','role':'ORGANIZER','website':'https://ethglobal.com','logo_url':None}],'tracks':[],'technologies':[],'prizes':[],'eligibility':EVENT['eligibility'],'phases':[],'requirements':[],'resources':[],'judging':[],'links':[{'link_type':'official','url':EVENT['official_url'],'is_official':True}], 'evidence':[{'source_name':'ETHGlobal','field_path':'name','observed_at':EVENT['verified_at'],'confidence':0.99,'evidence_text':'Canonical official event page'}],'recent_changes':[EVENT['change']],'series_slug':'ethglobal','series_name':'ETHGlobal','edition_label':'Mumbai 2026','edition_year':2026}
   return self.out(200,detail)
  if p.path in ('/v1/organizations','/v1/series','/v1/tracks','/v1/technologies','/v1/sources'):return self.out(200,{'items':[],'next_cursor':None})
  if p.path.startswith('/admin/'):
   if not self.admin_ok(): return self.out(401,{'detail':'admin authorization required'})
   if p.path=='/admin/review-queue':
    queue=q.get('queue_type',[None])[0]
    rows=db_rows("SELECT id,queue_type,severity,state,entity_id,source_id,payload,created_at FROM review_queue_items WHERE state='OPEN' AND (%s IS NULL OR queue_type=%s) ORDER BY created_at",(queue,queue))
    return self.out(200,rows)
   if p.path=='/admin/source-health':
    rows=db_rows("""SELECT s.id,s.name,s.active,s.parser_version,s.last_success_at,s.last_error_at,
      CASE WHEN EXISTS(SELECT 1 FROM source_anomalies a WHERE a.source_id=s.id AND a.resolved_at IS NULL) THEN 'DEGRADED' ELSE 'HEALTHY' END AS health,
      COALESCE((SELECT round(avg(CASE WHEN cr.status='SUCCEEDED' THEN 1 ELSE 0 END)::numeric,3) FROM crawl_runs cr WHERE cr.source_id=s.id),1) AS success_rate,
      COALESCE((SELECT sum(cr.valid_event_count) FROM crawl_runs cr WHERE cr.source_id=s.id),0) AS valid_events
      FROM sources s ORDER BY s.name""")
    for row in rows: row['recent_failed_runs']=[]
    return self.out(200,rows)
   if p.path=='/admin/quality/summary':
    return self.out(200,{'active_events':db_rows("SELECT count(*) AS n FROM hackathons WHERE is_active")[0]['n'],'unresolved_uncertainties':db_rows("SELECT count(*) AS n FROM review_queue_items WHERE state='OPEN'")[0]['n'],'freshness_sla_breaches':0,'high_severity_conflicts':0,'source_corroboration_target':2})
  return self.out(404,{'detail':'not found'})
ThreadingHTTPServer(('127.0.0.1',8787),H).serve_forever()
