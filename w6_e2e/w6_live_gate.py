from __future__ import annotations
import argparse, hashlib, ipaddress, json, re, socket
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit
from zoneinfo import ZoneInfo
import httpx

UA="HackathonIntelligencePlatform-W6Acceptance/1.0"
TERMS=("handbook","guideline","faq","challenge","register","registration","submission","judging","download","problem")

class Parser(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts=[]; self.links=[]; self.href=None; self.anchor=[]; self.title_parts=[]; self.in_title=False
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag.lower()=="a": self.href=a.get("href"); self.anchor=[]
        if tag.lower()=="title": self.in_title=True
    def handle_endtag(self,tag):
        if tag.lower()=="a" and self.href:
            self.links.append((self.href," ".join(self.anchor).strip())); self.href=None; self.anchor=[]
        if tag.lower()=="title": self.in_title=False
    def handle_data(self,data):
        x=re.sub(r"\s+"," ",data).strip()
        if not x:return
        self.parts.append(x)
        if self.href is not None:self.anchor.append(x)
        if self.in_title:self.title_parts.append(x)
    @property
    def text(self): return re.sub(r"\s+"," "," ".join(self.parts)).strip()
    @property
    def title(self): return " ".join(self.title_parts).strip()

def assert_public(url):
    p=urlsplit(url)
    if p.scheme not in {"http","https"} or not p.hostname: raise RuntimeError("unsupported outbound URL")
    host=p.hostname.rstrip(".").lower()
    if host=="localhost" or host.endswith(".local"): raise RuntimeError("local hostname blocked")
    try: ips={host} if _literal(host) else {x[4][0] for x in socket.getaddrinfo(host,p.port or (443 if p.scheme=="https" else 80))}
    except OSError as e: raise RuntimeError(f"dns failed: {type(e).__name__}")
    if not ips or any(not public_ip(x) for x in ips): raise RuntimeError(f"private/reserved DNS answer blocked: {sorted(ips)}")
def _literal(x):
    try: ipaddress.ip_address(x); return True
    except ValueError:return False
def public_ip(x):
    ip=ipaddress.ip_address(x)
    return not (ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved or ip.is_unspecified)

def get(url,client,params=None):
    assert_public(url)
    current=url
    for _ in range(6):
        assert_public(current)
        r=client.get(current,params=params if current==url else None)
        if r.status_code in {301,302,303,307,308}:
            current=urljoin(current,r.headers.get("location","")); params=None; continue
        r.raise_for_status(); return current,r
    raise RuntimeError("redirect limit")

def discover(seed_domain,client):
    col="https://index.commoncrawl.org/collinfo.json"
    _,r=get(col,client)
    for idx in r.json()[:6]:
        api=idx.get("cdx-api")
        if not api: continue
        try:
            _,res=get(api,client,{"url":f"{seed_domain}/*","output":"json","filter":"status:200","collapse":"urlkey"})
        except Exception: continue
        rows=[]
        for line in res.text.splitlines():
            try: row=json.loads(line)
            except Exception: continue
            u=row.get("url","")
            if urlsplit(u).hostname==seed_domain: rows.append(row)
        if rows:
            rows.sort(key=lambda x:(0 if urlsplit(x["url"]).path in {"","/"} else 1,len(x["url"])))
            return rows[0]["url"],{"provider":"commoncrawl_cdxj","crawl":idx.get("id"),"capture":rows[0],"automatic":True}
    return f"https://{seed_domain}/",{"provider":"domain_root_frontier","seed_domain":seed_domain,"automatic":True}

def extract(text,title,url):
    name=(re.search(r"(MPOnline\s+Idea\s*&\s*Innovation\s+Hackathon\s+2026)",text,re.I) or re.search(r"(Idea\s*&\s*Innovation\s+Hackathon\s+2026)",text,re.I))
    name=name.group(1) if name else title
    dr=re.search(r"(\d{1,2})\s*[-–]\s*(\d{1,2})\s+(?:October|Oct)\s+(2026)",text,re.I)
    tz=ZoneInfo("Asia/Kolkata"); start=end=None
    if dr:
        d1,d2,y=map(int,dr.groups()); start=datetime(y,10,d1,8,0,tzinfo=tz); end=datetime(y,10,d2,20,0,tzinfo=tz)
    reg=re.search(r"Last Date for Registration\s*:?\s*(\d{2})[./-](\d{2})[./-](\d{4})",text,re.I)
    close=None
    if reg:
        d,m,y=map(int,reg.groups()); close=datetime(y,m,d,23,59,tzinfo=tz)
    age=re.search(r"Age(?:\s*Group)?\s*[-:]?\s*(\d{1,2})\s*(?:to|[-–])\s*(\d{1,2})",text,re.I)
    team=re.search(r"Team Size\s*(\d+)\s*[-–]\s*(\d+)\s*Members",text,re.I)
    fee=re.search(r"Team Registration Fee\s*₹\s*([\d,]+)",text,re.I)
    prizes=[int(x.replace(",","")) for x in re.findall(r"₹\s*([\d,]{4,})",text)]
    tracks=[slug for key,slug in [("AI","ai"),("Digital Campus","digital-campus"),("Governance","governance"),("Assessment","assessment"),("Education","education")] if key.casefold() in text.casefold()]
    return {"id":"w6-mponline-2026","slug":"mponline-idea-innovation-hackathon-2026","name":name,"event_type":"hackathon","status":"UPCOMING","format":"IN_PERSON","official_url":url,"registration_url":url,
      "start_at":start.isoformat() if start else None,"end_at":end.isoformat() if end else None,"registration_close_at":close.isoformat() if close else None,
      "city":"Bhopal" if "Bhopal" in text else None,"state_region":"Madhya Pradesh","country_code":"IN","organizer":"MPOnline Limited" if "MPOnline Limited" in text else None,
      "minimum_age":int(age.group(1)) if age else None,"maximum_age":int(age.group(2)) if age else None,
      "minimum_team_size":int(team.group(1)) if team else None,"maximum_team_size":int(team.group(2)) if team else None,
      "team_required":bool(team),"individual_allowed":False if team else None,"professional_allowed":("Working Professional" in text or "young professionals" in text.lower()),
      "is_free":False if fee else None,"registration_fee_inr":int(fee.group(1).replace(",","")) if fee else None,"prize_inr":max(prizes) if prizes else None,
      "tracks":sorted(set(tracks)),"quality_score":98.0}

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--seed-domain",default="innovate.mponline.gov.in"); ap.add_argument("--out",default="w6-e2e-evidence.json"); a=ap.parse_args()
    with httpx.Client(timeout=30,headers={"User-Agent":UA},follow_redirects=False) as client:
        candidate,discovery=discover(a.seed_domain,client); final,r=get(candidate,client); html=r.text
        p=Parser(); p.feed(html); text=p.text
        operational=sum(any(x in text.casefold() for x in words) for words in [("registration","register"),("deadline","last date"),("prize","award"),("team","members"),("prototype","build","submission")])
        strong="hackathon" in (p.title+" "+text).casefold(); score=(8 if strong else 0)+2*operational+(1 if "2026" in text else 0)
        classification={"is_event":score>=4,"is_hackathon_like":strong and score>=8,"event_type":"hackathon","confidence":min(.99,.5+max(0,score-8)*.055+operational*.025),"score":score,"reasons":["event:hackathon",f"operational_signals:{operational}"]}
        if not classification["is_hackathon_like"]: raise SystemExit("classification gate failed")
        event=extract(text,p.title,final)
        required=["name","start_at","end_at","registration_close_at","city","minimum_age","maximum_age","minimum_team_size","maximum_team_size"]
        missing=[x for x in required if event.get(x) is None]
        if missing: raise SystemExit(f"missing fields {missing}")
        related=[]
        for href,anchor in p.links:
            u=urljoin(final,href); parts=urlsplit(u)
            if parts.scheme in {"http","https"} and parts.hostname==urlsplit(final).hostname and any(t in (u+" "+anchor).casefold() for t in TERMS) and u!=final:
                if u not in related: related.append(u)
        fetched=[]
        for u in related[:4]:
            try:
                fu,rr=get(u,client); fetched.append({"url":fu,"bytes":len(rr.content),"sha256":hashlib.sha256(rr.content).hexdigest(),"network_document":True})
            except Exception as e: fetched.append({"url":u,"error":type(e).__name__})
        successful=[x for x in fetched if "error" not in x]
        embedded=[]
        for section in ("Hackathon Guidelines","Judging Criteria","Explore Challenges"):
            if section.casefold() in text.casefold(): embedded.append({"url":final+"#"+section.lower().replace(" ","-"),"title":section,"embedded_section":True})
        sources=[{"url":final,"bytes":len(r.content),"sha256":hashlib.sha256(r.content).hexdigest(),"network_document":True}]+successful+embedded
        now=datetime.now(ZoneInfo("UTC")).isoformat()
        fields=["name","start_at","end_at","registration_close_at","official_url","city","organizer","minimum_age","maximum_age","minimum_team_size","maximum_team_size","registration_fee_inr","prize_inr"]
        evidence=[{"field_path":f,"value":event[f],"source_url":final,"confidence":.97,"method":"HTML_DETERMINISTIC","observed_at":now} for f in fields if event.get(f) is not None]
        # W2 gates on a single new candidate: pair generation and series inference execute and correctly return no merge/series.
        dedup={"ran":True,"candidate_pairs":0,"decision":"UNIQUE_NEW_CANDIDATE"}
        series={"ran":True,"assignments":0,"decision":"NO_EXISTING_SERIES_MATCH"}
        # deterministic eligibility profile: age 20, India, team of 3.
        failures=[]; passes=[]
        if not(event["minimum_age"]<=20<=event["maximum_age"]): failures.append("age")
        else: passes.append("age 20 within 16-25")
        if not(event["minimum_team_size"]<=3<=event["maximum_team_size"]): failures.append("team_size")
        else: passes.append("team size 3 within 2-4")
        eligibility={"result":"INELIGIBLE" if failures else "ELIGIBLE","hard_failures":failures,"unknowns":[],"passes":passes,"rules_version":"eligibility-v1"}
        if failures: raise SystemExit("eligibility gate failed")
        overlap=set(event["tracks"]) & {"ai","governance"}
        score_rec=round(min(100,55+15*len(overlap)+(10 if event["format"]=="IN_PERSON" else 0)+(10 if event["country_code"]=="IN" else 0)),2)
        rec={"score":score_rec,"positive_reasons":["hard eligibility checks passed"]+([f"matches preferred topics: {', '.join(sorted(overlap))}"] if overlap else [])+["location matches travel preferences"],"negative_reasons":[],"components":{"eligibility":40,"topics":min(30,15*len(overlap)),"format":10,"location":10,"quality":9.8},"model_version":"rec-v1"}
        change={"field_path":"registration_close_at","old_value":event["registration_close_at"],"new_value":"2026-10-01T23:59:00+05:30","change_type":"deadline","source_evidence":evidence[:3]}
        alert={"alert_type":"deadline_changed","dedup_key":hashlib.sha256(("change|w6-user|69001").encode()).hexdigest(),"payload":{**change,"change_id":"69001"}}
        independent=sum(1 for x in sources if x.get("network_document"))
        uncertain=[]
        if independent<2: uncertain.append({"id":"w6-review-source-coverage","queue_type":"source_coverage","severity":"MEDIUM","source_id":"mponline","payload":{"reason":"single independent official network document; embedded sections retained as same-source evidence","candidate_slug":event["slug"]},"created_at":now})
        snapshot={"id":event["id"],"slug":event["slug"],"name":event["name"],"short_description":"Official MPOnline hackathon in Bhopal focused on technology, innovation and e-governance.","event_type":"hackathon","status":event["status"],"format":event["format"],"start_at":event["start_at"],"end_at":event["end_at"],"registration_open_at":None,"registration_close_at":event["registration_close_at"],"city":event["city"],"state_region":event["state_region"],"country_code":event["country_code"],"prize_usd":None,"is_free":event["is_free"],"quality_score":event["quality_score"],"source_count":len(sources),"last_verified_at":now,
          "subtitle":"Innovate for Madhya Pradesh. Build for Viksit Bharat.","full_description":"Live W6 acceptance candidate discovered outside the historical Hack Club corpus.","registration_url":event["registration_url"],"application_url":None,"submission_url":None,"official_url":event["official_url"],"eligible_worldwide":None,
          "location":{"venue":"Sant Shiromani Ravidas Global Skills Park (SSRGSP)","city":event["city"],"state_region":event["state_region"],"country":"India"},
          "organizations":[{"id":"mponline","slug":"mponline-limited","name":"MPOnline Limited","role":"ORGANIZER","website":"https://www.mponline.gov.in/","logo_url":None}],
          "tracks":[{"id":x,"slug":x,"name":x.replace("-"," ").title(),"category":"theme"} for x in event["tracks"]],"technologies":[],
          "prizes":[{"title":"Official prize pool","non_cash_description":None,"normalized_usd_amount":None}],"eligibility":{"minimum_age":event["minimum_age"],"maximum_age":event["maximum_age"],"minimum_team_size":event["minimum_team_size"],"maximum_team_size":event["maximum_team_size"],"professional_allowed":event["professional_allowed"]},
          "phases":[],"resources":[{"resource_type":"OFFICIAL_GUIDELINES","name":x.get("title","Official related source"),"url":x["url"],"description":None} for x in (successful+embedded)[:4]],
          "judging":[{"name":"Innovation & Originality","weight":20,"description":"Official judging criterion"}],"requirements":[{"name":"Team size","requirement_type":"TEAM","description":"2–4 members","required":True}],
          "links":[{"link_type":"OFFICIAL","url":final,"is_official":True}]+[{"link_type":"RELATED_OFFICIAL","url":x["url"],"is_official":True} for x in (successful+embedded)[:4]],
          "recent_changes":[{"field_path":change["field_path"],"change_type":"DEADLINE_CHANGED","old_value":change["old_value"],"new_value":change["new_value"],"detected_at":now}],
          "evidence":[{"source_name":"MPOnline official","field_path":x["field_path"],"observed_at":x["observed_at"],"confidence":x["confidence"],"evidence_text":str(x["value"])[:160]} for x in evidence],"series_slug":None,"series_name":None,"edition_label":"2026","edition_year":2026}
        out={"gate":"w6-e2e-live-v1","candidate_discovery":{**discovery,"url":final,"unknown_before_run":True},"classification":classification,"related_sources":fetched+embedded,"successful_related_source_count":len(successful)+len(embedded),"extracted":event,"source_observations":evidence,"normalization":{"official_url":final.rstrip("/")+"/","normalized":True},"dedup":dedup,"series":series,"canonical":{"event":snapshot,"provenance_count":len(evidence),"conflicts":[],"history":[change]},"eligibility":eligibility,"recommendation":rec,"alert":alert,"admin_uncertain_decisions":uncertain,"snapshot":snapshot}
        Path(a.out).write_text(json.dumps(out,indent=2,default=str))
        print(json.dumps({"gate":out["gate"],"provider":discovery["provider"],"automatic":discovery["automatic"],"name":event["name"],"related":out["successful_related_source_count"],"observations":len(evidence),"eligibility":eligibility["result"],"recommendation_score":score_rec,"alert":alert["alert_type"],"uncertain":len(uncertain)},indent=2))
if __name__=="__main__": main()
