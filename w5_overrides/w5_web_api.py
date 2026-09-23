from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from urllib.parse import urlparse, parse_qs
EVENTS=[
 {"id":"4b6701b9-204b-4feb-9850-e8634c4038bf","slug":"moonstone-4b6701b9","name":"MoonStone","event_type":"hackathon","status":"UPCOMING","format":"IN_PERSON","city":"Shanghai","state_region":"Shanghai","country":"China","country_code":"CN","official_url":"https://www.moonstone.org.cn/","source_count":1,"start_at":"2026-09-25T14:00:00+00:00","end_at":"2026-09-27T18:00:00+00:00","last_verified_at":"2026-09-23T13:54:34+00:00","quality_score":100.0,"description":"Canonical event from W2 live corpus."},
 {"id":"779ab485-80ac-42d0-a742-528f19336da3","slug":"bay-valley-hacks-779ab485","name":"Bay-Valley Hacks","event_type":"hackathon","status":"UPCOMING","format":"IN_PERSON","city":"Mountain House","state_region":"California","country":"United States","country_code":"US","official_url":"https://bayvalleyhacks.com/","source_count":1,"start_at":"2026-09-26T08:00:00+00:00","end_at":"2026-09-26T22:00:00+00:00","last_verified_at":"2026-09-23T13:54:34+00:00","quality_score":100.0,"description":"Canonical event from W2 live corpus."},
 {"id":"b7fbfdac-1746-4a61-a855-42e1cc201d9a","slug":"banana-hacks-b7fbfdac","name":"Banana Hacks","event_type":"hackathon","status":"UPCOMING","format":"ONLINE","city":None,"state_region":None,"country":None,"country_code":None,"official_url":"https://www.bananahacks.tech/","source_count":1,"start_at":"2026-10-09T00:00:00+00:00","end_at":"2026-10-12T22:00:00+00:00","last_verified_at":"2026-09-23T13:54:34+00:00","quality_score":83.33,"description":"Canonical event from W2 live corpus."}
]
class H(BaseHTTPRequestHandler):
 def log_message(self,*a): pass
 def out(self,status,obj):
  b=json.dumps(obj).encode();self.send_response(status);self.send_header('content-type','application/json');self.send_header('content-length',str(len(b)));self.end_headers();self.wfile.write(b)
 def do_GET(self):
  p=urlparse(self.path); q=parse_qs(p.query)
  if p.path.startswith('/v1/me/'):
   return self.out(401,{"detail":"not authenticated"})
  if p.path=='/v1/hackathons':
   items=EVENTS
   if 'status' in q: items=[e for e in items if e['status'] in q['status']]
   return self.out(200,{"items":items,"next_cursor":None,"meta":{"api_version":"v1","filter_schema_version":"w4-filter-v1"}})
  if p.path.startswith('/v1/hackathons/'):
   key=p.path.split('/')[-1]; e=next((x for x in EVENTS if x['slug']==key or x['id']==key),None)
   if not e:return self.out(404,{"detail":"not found"})
   detail={**e,"subtitle":None,"full_description":e['description'],"registration_url":None,"application_url":None,"submission_url":None,"eligible_worldwide":None,"location":{"city":e['city'],"state_region":e['state_region'],"country":e['country'],"country_code":e['country_code']} if e['city'] else None,"organizations":[],"tracks":[],"technologies":[],"prizes":[],"eligibility":[],"phases":[],"requirements":[],"resources":[],"judging":[],"links":[{"link_type":"official","url":e['official_url'],"is_official":True}],"evidence":[],"recent_changes":[],"series_slug":None,"series_name":None,"edition_label":None,"edition_year":None}
   return self.out(200,detail)
  if p.path in ('/v1/organizations','/v1/series','/v1/tracks','/v1/technologies','/v1/sources'):
   return self.out(200,{"items":[],"next_cursor":None})
  return self.out(404,{"detail":"not found"})
ThreadingHTTPServer(('127.0.0.1',8787),H).serve_forever()
