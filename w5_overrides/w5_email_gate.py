import asyncio, json, urllib.request
from hackathon_alerts.delivery import SmtpConfig, SmtpEmailSender, render_email

async def main():
    sender=SmtpEmailSender(SmtpConfig(host='127.0.0.1',port=1025,from_email='alerts@hackathons.test',use_starttls=False))
    subject,text=render_email(
        alert_type='DEADLINE_CHANGED',
        event_name='MoonStone',
        event_url='https://hackathons.test/hackathons/moonstone-4b6701b9',
        payload={'changed_field':'registration_closes_at','deadline_local':'2026-09-24T20:00:00-03:00','timezone':'America/Sao_Paulo'},
    )
    mid=await sender.send(to='pablo@example.test',subject=subject,text=text,idempotency_key='w5-mailpit-gate-1')
    assert mid == 'w5-mailpit-gate-1'
    with urllib.request.urlopen('http://127.0.0.1:8025/api/v1/messages') as r:
        data=json.load(r)
    assert data.get('total',0) == 1, data
    items=data.get('messages') or []
    assert items, data
    msg_id=items[0]['ID']
    with urllib.request.urlopen(f'http://127.0.0.1:8025/api/v1/message/{msg_id}') as r:
        msg=json.load(r)
    raw=json.dumps(msg)
    for needle in ['MoonStone','registration_closes_at','https://hackathons.test/hackathons/moonstone-4b6701b9','2026-09-24T20:00:00-03:00','America/Sao_Paulo']:
        assert needle in raw, needle
    print(json.dumps({'smtp_message_id':mid,'mailpit_total':data['total'],'direct_link':True,'changed_field':True,'deadline_local':True,'timezone':True},sort_keys=True))

asyncio.run(main())
