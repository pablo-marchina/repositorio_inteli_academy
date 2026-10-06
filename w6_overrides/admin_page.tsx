import {decideReview,setSourceState} from './actions';
const apiBase=()=> (process.env.API_URL??'http://localhost:8000').replace(/\/$/,'');
const h=()=>({'x-admin-key':process.env.ADMIN_API_KEY??''});
async function get(path:string){const r=await fetch(`${apiBase()}${path}`,{headers:h(),cache:'no-store'});if(!r.ok)throw new Error(`admin API ${path}: ${r.status}`);return r.json()}
export default async function AdminPage(){
  if(!process.env.ADMIN_API_KEY)return <main><div className="outage">Admin UI disabled: ADMIN_API_KEY is not configured.</div></main>;
  const [queue,health,quality,anomalies]=await Promise.all([get('/admin/review-queue?limit=50'),get('/admin/source-health'),get('/admin/quality'),get('/admin/anomalies')]);
  const items=Array.isArray(queue)?queue:queue.items??[]; const sources=Array.isArray(health)?health:health.items??[];
  return <main><p className="eyebrow">Operations</p><h1>Admin & data-quality control plane</h1>
    <section className="section"><h2>Review queues</h2><div className="data-list">{items.map((x:any)=><article className="event-card" key={x.id}><div className="card-topline"><strong>{x.queue_type}</strong><span>{x.severity}</span></div><pre>{JSON.stringify(x.payload??{},null,2)}</pre><form action={decideReview}><input type="hidden" name="item_id" value={x.id}/><label>Reason<input name="reason" required/></label><div className="tag-row">{['approve','reject','merge','split'].map(d=><button key={d} name="decision" value={d}>{d}</button>)}</div></form></article>)}</div></section>
    <section className="section"><h2>Source health</h2><div className="data-list">{sources.map((s:any)=><article className="event-card" key={s.id}><strong>{s.name}</strong><pre>{JSON.stringify(s,null,2)}</pre><form action={setSourceState}><input type="hidden" name="source_id" value={s.id}/><input type="hidden" name="active" value={String(!s.active)}/><input type="hidden" name="reason" value="admin control plane"/><button>{s.active?'Pause source':'Resume source'}</button></form></article>)}</div></section>
    <section className="section"><h2>Quality & freshness</h2><pre>{JSON.stringify(quality,null,2)}</pre></section>
    <section className="section"><h2>Parser/source anomalies</h2><pre>{JSON.stringify(anomalies,null,2)}</pre></section>
  </main>
}
