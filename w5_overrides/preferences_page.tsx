import {cookies} from 'next/headers';
import {apiBase} from '../../lib/api';
import {PreferenceEditor} from '../../components/PreferenceEditor';
import type {RecommendationPreferences} from '../../lib/types';

export default async function PreferencesPage(){
  const c=await cookies();
  const r=await fetch(`${apiBase()}/v1/me/preferences`,{headers:{cookie:c.toString()},cache:'no-store'}).catch(()=>null);
  if(!r||r.status===401)return <main><p className="eyebrow">Preferences</p><h1>Sign in to personalize recommendations.</h1></main>;
  if(!r.ok)return <main><div className="outage">Preferences could not be loaded.</div></main>;
  const body=await r.json() as RecommendationPreferences;
  return <main><p className="eyebrow">Recommendation profile</p><h1>Control hard constraints and soft preferences.</h1><p className="lead">Missing values stay unknown/no-preference; they are never coerced to false.</p><PreferenceEditor initial={body}/></main>;
}
