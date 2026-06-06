import sys; sys.stdout.reconfigure(encoding='utf-8')
import urllib.request, urllib.parse, json

# Login (form-encoded)
data = urllib.parse.urlencode({'username':'admin','password':'Admin@123'}).encode()
resp = urllib.request.urlopen(urllib.request.Request('http://localhost:8000/auth/login', data=data))
token = json.loads(resp.read())['access_token']
print("Login OK")

# Get alerts
req2 = urllib.request.Request('http://localhost:8000/actionplan/alerts',
    headers={'Authorization': f'Bearer {token}'})
alerts = json.loads(urllib.request.urlopen(req2).read())
print(f'Total alerts: {len(alerts)}')
for a in alerts:
    print(f'  id={a["id"]} | code={a["alert_code"]} | severity={a["severity"]} | {a["title"][:50]}')

# Test items for first alert
if alerts:
    alert_id = alerts[0]['id']
    req3 = urllib.request.Request(f'http://localhost:8000/actionplan/alerts/{alert_id}/items',
        headers={'Authorization': f'Bearer {token}'})
    items = json.loads(urllib.request.urlopen(req3).read())
    print(f'\nAction plan items for alert {alert_id}: {len(items)} items')
    for it in items:
        print(f'  {it}')
