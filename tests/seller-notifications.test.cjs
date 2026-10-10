const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { randomUUID } = require('node:crypto');
const { createLifecycle, sql } = require('../internal/order-lifecycle.cjs');
const { createOrderService } = require('../internal/order-service.cjs');

(async () => {
  const db = new sqlite3.Database(':memory:');
  const q = sql(db);
  await q.run("CREATE TABLE orders (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, phone TEXT, address TEXT, memo TEXT, items TEXT, total_price INTEGER, status TEXT, tracking_number TEXT, courier TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
  const sent = [];
  const notifier = {
    readiness: () => ({ provider: 'solapi', mode: 'live', enabled: true, reason: 'ready' }),
    eligibility: () => ({ status: 'queued', reason: 'queued' }),
    send: async message => { sent.push(message); return { status: 'accepted', reason: 'accepted', messageId: `msg-${sent.length}` }; },
    results: async () => ({})
  };
  const lifecycle = createLifecycle(db, { notifier });
  const service = createOrderService(db, { lifecycle });
  for (const template of (await lifecycle.templates()).templates) {
    await lifecycle.saveTemplate(template.status, { ...template, provider_code: `TPL_${template.status}`, enabled: true });
  }
  assert.deepEqual(await lifecycle.saveSettings({ sellerPhone: '010-9999-8888' }), { sellerPhone: '01099998888' });

  const payload = { name: '택배 고객', phone: '01011112222', address: '가상 배송지', memo: '', items: [{ name: '오이', quantity: 1, unit: 'kg' }], totalPrice: 1000, requestKey: randomUUID() };
  const delivery = await service.submit(payload);
  assert.deepEqual(sent.map(item => item.to), ['01011112222', '01099998888']);
  await lifecycle.update(delivery.orderId, { status: '주문취소' }, 0, 'test cancel');
  assert.deepEqual(sent.slice(2).map(item => item.to), ['01011112222', '01099998888']);

  const pickup = await service.submit({ ...payload, name: '픽업 고객', phone: '01033334444', address: '[직접 픽업] 날짜: 2026-10-12 / 시간: 14:00', requestKey: randomUUID() });
  assert.ok(pickup.orderId);
  assert.deepEqual(sent.slice(4).map(item => item.to), ['01033334444', '01099998888']);
  const sellerLogs = await q.all("SELECT * FROM order_event_notifications WHERE template_status LIKE '판매자 · %'");
  assert.equal(sellerLogs.length, 3);
  assert.ok(sellerLogs.every(row => row.recipient_phone === '01099998888'));
  await new Promise(resolve => db.close(resolve));
  console.log('PASS: seller receives delivery/pickup order receipts and cancellations with separate audited Solapi sends. Mock transport only.');
})().catch(error => { console.error(error); process.exitCode = 1; });
