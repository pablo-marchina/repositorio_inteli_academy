from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
from urllib.parse import urlparse, parse_qs
EVENT=json.loads(Path('/tmp/w6_event.json').read_text())
class H(BaseHTTPRequestHandler):
 def log_message(self,*a): pass
 def out(self,status,obj):
  b=json.dumps(obj).encode();self.send_response(status);self.send_header('content-type','application/json');self.send_header('content-length',str(len(b)));self.end_headers();self.wfile.write(b)
 def do_GET(self):
  p=urlparse(self.path);q=parse_qs(p.query)
  if p.path.startswith('/v1/me/'):return self.out(401,{'detail':'not authenticated'})
  if p.path=='/v1/hackathons':
   return self.out(200,{'items':[EVENT],'next_cursor':None,'meta':{'api_version':'v1','filter_schema_version':'w4-filter-v1'}})
  if p.path.startswith('/v1/hackathons/'):
   key=p.path.split('/')[-1]
   if key not in (EVENT['slug'],str(EVENT['id'])):return self.out(404,{'detail':'not found'})
   detail={**EVENT,'subtitle':'Official ETHGlobal event discovered during W6 gate','full_description':'Live canonical event created by the W6 discovery-to-product acceptance test.','registration_url':EVENT['official_url'],'application_url':EVENT['official_url'],'submission_url':None,'eligible_worldwide':True,'location':{'city':EVENT['city'],'state_region':None,'country':EVENT['country'],'country_code':EVENT['country_code']},'organizations':[{'id':'ethglobal','slug':'ethglobal','name':'ETHGlobal','role':'ORGANIZER','website':'https://ethglobal.com','logo_url':None}],'tracks':[],'technologies':[],'prizes':[],'eligibility':EVENT['eligibility'],'phases':[],'requirements':[],'resources':[],'judging':[],'links':[{'link_type':'official','url':EVENT['official_url'],'is_official':True}], 'evidence':[{'source_name':'ETHGlobal','field_path':'name','observed_at':EVENT['verified_at'],'confidence':0.99,'evidence_text':'Official event page'}],'recent_changes':[EVENT['change']],'series_slug':'ethglobal','series_name':'ETHGlobal','edition_label':'Mumbai 2026','edition_year':2026}
   return self.out(200,detail)
  if p.path in ('/v1/organizations','/v1/series','/v1/tracks','/v1/technologies','/v1/sources'):return self.out(200,{'items':[],'next_cursor':None})
  return self.out(404,{'detail':'not found'})
ThreadingHTTPServer(('127.0.0.1',8787),H).serve_forever()
