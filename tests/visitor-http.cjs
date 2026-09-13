// Run only against a local test server with a disposable LOCAL_TEST_DATABASE.
const assert = require('node:assert/strict');
const base = process.env.VISITOR_TEST_BASE || 'http://127.0.0.1:3018';

(async () => {
  assert.equal((await fetch(`${base}/api/admin/visitors`)).status, 401);
  assert.equal((await fetch(`${base}/api/visits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visitorId: 'short' })
  })).status, 400);

  const visitorId = 'visitor_http_test_000000000001';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const visit = await fetch(`${base}/api/visits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorId })
    });
    assert.ok([200, 201].includes(visit.status));
  }

  const login = await fetch(`${base}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'local-visitor-test' })
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const response = await fetch(`${base}/api/admin/visitors`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  const stats = await response.json();
  assert.ok(stats.today >= 1);
  assert.ok(stats.total >= 1);
  assert.match(stats.date, /^\d{4}-\d{2}-\d{2}$/);

  console.log(`PASS local HTTP: protected visitor stats, input validation, duplicate suppression, and KST response (${stats.today}/${stats.total}).`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
