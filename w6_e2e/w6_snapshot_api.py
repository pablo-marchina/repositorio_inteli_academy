from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from urllib.parse import urlparse,parse_qs
import json
DATA=json.load(open("w6-e2e-evidence.json")); EVENT=DATA["snapshot"]; QUEUE=DATA["admin_uncertain_decisions"]
class H(BaseHTTPRequestHandler):
    def sendj(self,obj,status=200):
        b=json.dumps(obj,default=str).encode(); self.send_response(status); self.send_header("content-type","application/json"); self.send_header("content-length",str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        p=urlparse(self.path); q=parse_qs(p.query)
        if p.path=="/v1/hackathons":
            needle=(q.get("q",[""])[0] or "").casefold(); items=[EVENT] if not needle or needle in EVENT["name"].casefold() else []
            return self.sendj({"items":items,"next_cursor":None,"meta":{"api_version":"v1","filter_schema_version":"w4-v1"}})
        if p.path==f"/v1/hackathons/{EVENT['slug']}": return self.sendj(EVENT)
        if p.path=="/admin/review-queue": return self.sendj(QUEUE)
        if p.path=="/admin/source-health": return self.sendj([{"id":"mponline","name":"MPOnline official","active":True,"last_success_at":EVENT["last_verified_at"],"last_failure_at":None,"success_rate":1.0,"valid_event_count":1,"parser_version":"w6-e2e-html","last_failed_run_id":None}])
        if p.path=="/admin/quality": return self.sendj({"total_events":1,"field_coverage":{"dates":1.0,"eligibility":1.0,"provenance":1.0},"active_stale":0,"single_source_without_corroboration":1,"unresolved_high_conflicts":0})
        if p.path=="/admin/anomalies": return self.sendj([])
        if p.path.startswith("/v1/me/state/"): return self.sendj({"state":None})
        return self.sendj({"error":"not found"},404)
    def do_POST(self): return self.sendj({"ok":True})
    def do_PATCH(self): return self.sendj({"ok":True})
    def log_message(self,*a): pass
ThreadingHTTPServer(("127.0.0.1",8787),H).serve_forever()
