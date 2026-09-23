import {cookies} from 'next/headers';
import {apiBase} from '../../lib/api';
import {SavedSearchManager} from '../../components/SavedSearchManager';
import type {SavedSearch} from '../../lib/types';

export default async function SavedSearchesPage(){
  const c=await cookies();
  const r=await fetch(`${apiBase()}/v1/me/saved-searches`,{headers:{cookie:c.toString()},cache:'no-store'}).catch(()=>null);
  if(!r||r.status===401)return <main><h1>Sign in to save searches.</h1></main>;
  if(!r.ok)return <main><div className="outage">Saved searches could not be loaded.</div></main>;
  return <main><p className="eyebrow">Saved searches</p><h1>Turn structured filters into persistent monitors.</h1><SavedSearchManager initial={await r.json() as SavedSearch[]}/></main>;
}
