import {cookies} from 'next/headers';
import Link from 'next/link';
import {apiBase} from '../../lib/api';
import type {AlertEvent} from '../../lib/types';

export default async function AlertsPage(){
  const c=await cookies();
  const r=await fetch(`${apiBase()}/v1/me/alerts?limit=50`,{headers:{cookie:c.toString()},cache:'no-store'}).catch(()=>null);
  if(!r||r.status===401)return <main><h1>Sign in to view alerts.</h1></main>;
  if(!r.ok)return <main><div className="outage">Alerts could not be loaded.</div></main>;
  const body=await r.json() as {items:AlertEvent[]};
  return <main><p className="eyebrow">Inbox</p><h1>Material changes, not noise.</h1><div className="data-list">{body.items.map(a=><article className="event-card" key={a.id}><div className="card-topline"><strong>{a.alert_type}</strong><span>{new Date(a.created_at).toLocaleString()}</span></div><h2>{a.hackathon_name??'Hackathon update'}</h2><pre>{JSON.stringify(a.payload,null,2)}</pre>{a.hackathon_slug&&<Link className="button" href={`/hackathons/${a.hackathon_slug}`}>Open event</Link>}</article>)}</div></main>;
}
