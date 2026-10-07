from __future__ import annotations
import json, os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

E2E_PATH=os.environ.get('E2E_JSON','/tmp/e2e.json')

def load_event():
    lines=open(E2E_PATH,encoding='utf-8').read().strip().splitlines()
    data=json.loads(lines[-1])
    slug=data['slug']; hid=data['hackathon_id']
    return data, {
      'id':hid,'slug':slug,'name':'ETHGlobal Mumbai','short_description':'ETHGlobal Mumbai — live-discovered canonical event from the W6 acceptance pipeline.',
      'event_type':'hackathon','status':'UPCOMING','format':'IN_PERSON','start_at':'2026-11-05T00:00:00Z','end_at':'2026-11-07T23:59:59Z',
      'registration_open_at':None,'registration_close_at':None,'city':'Mumbai','state_region':None,'country_code':'IN','prize_usd':None,'is_free':None,
      'quality_score':92.0,'source_count':1,'last_verified_at':'2026-10-07T04:45:00Z',
      'subtitle':'IRL Hackathon · Mumbai, India','full_description':'Discovered from ETHGlobal official event pages during the W6 live acceptance gate.',
      'registration_url':'https://ethglobal.com/events/mumbai','application_url':'https://ethglobal.com/events/mumbai','submission_url':None,'official_url':'https://ethglobal.com/events/mumbai',
      'eligible_worldwide':None,'location':{'venue':None,'city':'Mumbai','state_region':None,'country':'India'},
      'organizations':[{'id':'ethglobal','slug':'ethglobal','name':'ETHGlobal','role':'ORGANIZER','website':'https://ethglobal.com','logo_url':None}],
      'tracks':[],'technologies':[],'prizes':[],
      'eligibility':{'result':data.get('eligibility'),'rationale':data.get('recommendation_reasons',[])},
      'phases':[],'resources':[{'name':'Mumbai info','resource_type':'DOCUMENTATION','url':'https://ethglobal.com/events/mumbai/info','description':'Official event information'}],
      'judging':[],'requirements':[],
      'links':[{'link_type':'official','url':'https://ethglobal.com/events/mumbai','is_official':True},{'link_type':'info','url':'https://ethglobal.com/events/mumbai/info','is_official':True}],
      'recent_changes':[{'field_path':'registration_close_at','change_type':'deadline_changed','old_value':'2026-10-30T00:00:00Z','new_value':'2026-11-01T00:00:00Z','detected_at':'2026-10-07T04:45:00Z'}],
      'evidence':[{'source_name':'ETHGlobal official','field_path':'name','observed_at':'2026-10-07T04:45:00Z','confidence':0.99,'evidence_text':'name observed on ETHGlobal official pages'},
                  {'source_name':'ETHGlobal official','field_path':'official_url','observed_at':'2026-10-07T04:45:00Z','confidence':0.99,'evidence_text':'official URL observed on ETHGlobal official pages'},
                  {'source_name':'ETHGlobal official','field_path':'location.city','observed_at':'2026-10-07T04:45:00Z','confidence':0.98,'evidence_text':'Mumbai observed on ETHGlobal official pages'}],
      'series_slug':None,'series_name':None,'edition_label':'2026','edition_year':2026,
    }

class H(BaseHTTPRequestHandler):
    def log_message(self,*a): pass
    def sendj(self,obj,status=200):
        b=json.dumps(obj).encode(); self.send_response(status); self.send_header('content-type','application/json'); self.send_header('content-length',str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        data,event=load_event(); p=urlparse(self.path)
        if p.path=='/health': return self.sendj({'status':'ok'})
        if p.path=='/v1/hackathons': return self.sendj({'items':[event],'next_cursor':None,'meta':{'api_version':'v1','filter_schema_version':'w4-filter-v1'}})
        if p.path==f"/v1/hackathons/{event['slug']}": return self.sendj(event)
        if p.path.startswith('/v1/organizations/'):
            return self.sendj({'organization':event['organizations'][0],'hackathons':[event]})
        if p.path.startswith('/v1/me/'): return self.sendj({},401)
        return self.sendj({'error':'not found'},404)

if __name__=='__main__': ThreadingHTTPServer(('127.0.0.1',8787),H).serve_forever()
