'use server';
import {revalidatePath} from 'next/cache';
import {apiBase} from '../../lib/api';
function headers(){const key=process.env.ADMIN_API_KEY;if(!key) throw new Error('ADMIN_API_KEY is not configured');return {'content-type':'application/json','x-admin-key':key,'x-admin-actor':'web-admin'}}
async function call(path:string,body:unknown){const r=await fetch(`${apiBase()}${path}`,{method:'POST',headers:headers(),body:JSON.stringify(body),cache:'no-store'});if(!r.ok) throw new Error(`Admin action failed: ${r.status}`);revalidatePath('/admin')}
export async function reviewAction(form:FormData){const id=String(form.get('item_id')||'');const action=String(form.get('action')||'');const reason=String(form.get('reason')||'Reviewed from Admin Console');const payloadText=String(form.get('payload')||'{}');let payload:Record<string,unknown>={};try{payload=JSON.parse(payloadText)}catch{throw new Error('Invalid JSON payload')}await call(`/admin/review-queue/${encodeURIComponent(id)}/actions`,{action,reason,payload})}
export async function sourceAction(form:FormData){const id=String(form.get('source_id')||'');const action=String(form.get('source_action')||'pause');const reason=String(form.get('reason')||'Changed from Admin Console');await call(`/admin/sources/${encodeURIComponent(id)}/${action}`,{reason})}
