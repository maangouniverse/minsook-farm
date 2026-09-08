const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { randomUUID } = require('node:crypto');
const { createOrderService, normalizeOrder, paymentAccount } = require('../internal/order-service.cjs');
const payload = () => ({ name: '로컬 검증', phone: '01000000000', basicAddress: '전남 고흥군 테스트로 1', postcode: '00000', detailAddress: '', memo: '', items: [{ grade: 'special', name: '특품', quantity: 2, unit: 'kg' }], totalPrice: 19480, requestKey: randomUUID() });
async function database() {
  const db = new sqlite3.Database(':memory:');
  await new Promise((ok, fail) => db.run("CREATE TABLE orders (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, phone TEXT, address TEXT, memo TEXT, items TEXT, total_price INTEGER, status TEXT DEFAULT '주문', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)", e => e ? fail(e) : ok()));
  return db;
}
const row = (db, sql) => new Promise((ok, fail) => db.get(sql, (e, r) => e ? fail(e) : ok(r)));
(async () => {
  for (const detail of ['', undefined, null, 'undefined', 'null', '  ']) {
    assert.equal(normalizeOrder({ ...payload(), detailAddress: detail }).address, '[00000] 전남 고흥군 테스트로 1');
  }
  assert.equal(normalizeOrder({ ...payload(), detailAddress: '  101동   202호  ' }).address, '[00000] 전남 고흥군 테스트로 1 101동 202호');
  assert.throws(() => normalizeOrder({ ...payload(), basicAddress: '' }), { status: 400 });
  assert.throws(() => normalizeOrder({ ...payload(), items: [] }), { status: 400 });
  const db = await database();
  const service = createOrderService(db);
  const body = payload();
  const receipts = await Promise.all(Array.from({ length: 8 }, () => service.submit(body)));
  assert.equal(new Set(receipts.map(r => r.orderId)).size, 1);
  assert.equal((await row(db, 'SELECT count(*) AS n FROM orders')).n, 1);
  assert.equal((await row(db, 'SELECT count(*) AS n FROM order_notifications')).n, 1);
  assert.equal((await row(db, 'SELECT status FROM orders')).status, '주문');
  assert.equal(receipts[0].totalPrice, 19480);
  assert.deepEqual(receipts[0].paymentAccount, paymentAccount());
  assert.equal((await service.logs()).logs[0].status, 'disabled');
  assert.equal((await createOrderService(db).submit(body)).orderId, receipts[0].orderId);
  await assert.rejects(service.submit({ ...body, totalPrice: 100 }), { status: 409 });
  const pickup = payload(); delete pickup.basicAddress;
  pickup.address = '[직접 픽업] 2026-09-10 13:00'; pickup.memo = '결제 방식: 현장결제';
  const onsite = await service.submit(pickup);
  assert.equal(onsite.paymentMethod, 'onsite'); assert.equal(onsite.paymentAccount, null);
  db.close();
  const auditDb = await database();
  const auditService = createOrderService(auditDb);
  await auditService.ensureSchema();
  const realRun = auditDb.run.bind(auditDb);
  auditDb.run = function(sql, args, callback) {
    if (/INSERT INTO order_notifications/.test(sql)) { callback(new Error('LOCAL_AUDIT_FAILURE')); return this; }
    return realRun(sql, args, callback);
  };
  assert.equal((await auditService.submit(payload())).success, true);
  assert.equal((await row(auditDb, 'SELECT count(*) AS n FROM orders')).n, 1);
  auditDb.close();
  for (const outcome of ['delivered', 'accepted', 'failed', 'unknown', 'blocked']) {
    const fakeDb = await database(); let calls = 0;
    const fake = createOrderService(fakeDb, { env: { BIZTALK_MODE: 'test', BIZTALK_TEST_PHONE: outcome === 'blocked' ? '01099999999' : '01000000000' }, sendApprovedTemplate: async message => {
      calls++; assert.equal((await row(fakeDb, 'SELECT count(*) AS n FROM orders')).n, 1);
      assert.equal(message.order.totalPrice, 19480);
      if (outcome === 'failed' || outcome === 'unknown') throw Object.assign(new Error('FAKE_ONLY'), { uncertain: outcome === 'unknown' });
      return { delivered: outcome === 'delivered', messageId: 'local-fake' };
    } });
    const request = payload();
    assert.equal((await fake.submit(request)).success, true);
    await fake.submit(request);
    assert.equal(calls, outcome === 'blocked' ? 0 : 1);
    assert.equal((await fake.logs()).logs[0].status, outcome);
    assert.equal((await row(fakeDb, 'SELECT status FROM orders')).status, '주문');
    fakeDb.close();
  }
  console.log('PASS: optional addresses, base validation, 8 concurrent replays, conflict, saved totals/account, onsite exclusion, disabled audit, 5 fake notification outcomes. No network or customer data used.');
})().catch(e => { console.error(e); process.exitCode = 1; });
