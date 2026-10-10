const assert = require('node:assert/strict');
const { createHmac, randomUUID } = require('node:crypto');
const sqlite3 = require('sqlite3');
const { createSolapi } = require('../internal/solapi.cjs');
const { createLifecycle, sql } = require('../internal/order-lifecycle.cjs');
const { createOrderService } = require('../internal/order-service.cjs');

(async () => {
  const env = { SOLAPI_MODE: 'test', SOLAPI_API_KEY: 'fake-key', SOLAPI_API_SECRET: 'fake-secret', SOLAPI_PF_ID: 'fake-channel', SOLAPI_TEST_PHONE: '01000000000' };
  const requests = []; let responseMode = 'accepted', sequence = 0;
  const transport = createSolapi({ env, fetchImpl: async (url, options) => {
    requests.push({ url, options });
    const auth = /apiKey=(.*), date=(.*), salt=(.*), signature=(.*)$/.exec(options.headers.Authorization);
    assert.equal(auth[4], createHmac('sha256', env.SOLAPI_API_SECRET).update(auth[2] + auth[3]).digest('hex'));
    assert.equal(options.redirect, 'error');
    if (options.method === 'GET') {
      const ids = JSON.parse(new URL(url).searchParams.get('messageIds'));
      return { ok: true, json: async () => ({ messageList: Object.fromEntries(ids.map(id => [id, { messageId: id, status: 'COMPLETE', statusCode: responseMode === 'delivery-failed' ? '4100' : '4000' }])) }) };
    }
    const message = JSON.parse(options.body).messages[0];
    assert.equal(message.kakaoOptions.disableSms, true);
    assert.equal(message.type, 'ATA');
    assert.equal(message.to, env.SOLAPI_TEST_PHONE);
    if (responseMode === 'timeout') throw Error('FAKE SECRET OR PHONE MUST NOT LEAK');
    if (responseMode === 'http500') return { ok: false, status: 500 };
    if (responseMode === 'http401') return { ok: false, status: 401 };
    if (responseMode === 'rejected') return { ok: true, json: async () => ({ failedMessageList: [{ statusCode: '3040', messageId: 'FAIL1' }] }) };
    if (responseMode === 'malformed') return { ok: true, json: async () => ({}) };
    return { ok: true, json: async () => ({ failedMessageList: [], messageList: [{ messageId: `M${++sequence}`, statusCode: '2000' }] }) };
  } });
  const db = new sqlite3.Database(':memory:'), q = sql(db);
  await q.run("CREATE TABLE orders (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, phone TEXT, address TEXT, memo TEXT, items TEXT, total_price INTEGER, status TEXT DEFAULT '주문', tracking_number TEXT, courier TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
  const lifecycle = createLifecycle(db, { notifier: transport }), service = createOrderService(db, { lifecycle });
  for (const template of (await lifecycle.templates()).templates) await lifecycle.saveTemplate(template.status, {
    ...template,
    body: template.status === '주문접수-택배' ? '#{주문자명} #{고객명} #{수령인} #{상품명} #{수량} #{결제금액} #{배송지}' : template.body,
    provider_code: `FAKE-${template.status}`,
    enabled: true
  });
  const payload = { name: '가상주문', phone: '010-0000-0000', address: '가상 배송지', memo: '', items: [{ name: '가상상품', quantity: 1, unit: '개' }], totalPrice: 1000, requestKey: randomUUID() };
  const receipts = await Promise.all(Array.from({ length: 4 }, () => service.submit(payload)));
  assert.equal(new Set(receipts.map(r => r.orderId)).size, 1);
  assert.equal(requests.length, 1, 'duplicate submit sends once');
  const id = receipts[0].orderId;
  assert.equal(JSON.parse(requests[0].options.body).messages[0].kakaoOptions.variables['#{주문자명}'], payload.name);
  const orderVariables = JSON.parse(requests[0].options.body).messages[0].kakaoOptions.variables;
  assert.equal(orderVariables['#{고객명}'], payload.name);
  assert.equal(orderVariables['#{수령인}'], payload.name);
  assert.equal(orderVariables['#{상품명}'], '가상상품');
  assert.equal(orderVariables['#{수량}'], '1개');
  assert.equal(orderVariables['#{결제금액}'], '1,000');
  assert.equal(orderVariables['#{배송지}'], payload.address);
  const paid = await lifecycle.update(id, { status: '입금확인-택배' }, 0, 'test');
  assert.equal(paid.notification.status, 'accepted');
  assert.ok(paid.notification.provider_message_id);
  await lifecycle.update(id, { status: '입금확인-택배' }, 1, 'test');
  assert.equal(requests.length, 2, 'unchanged payment does not resend');
  await lifecycle.update(id, { courier: '한진택배', tracking_number: '123456' }, 1, 'test');
  assert.equal(requests.length, 2, 'preparing a label is not shipment');
  await lifecycle.update(id, { status: '택배발송' }, 2, 'test');
  assert.equal(requests.length, 3);
  const shipping = JSON.parse(requests[2].options.body).messages[0];
  assert.equal(shipping.kakaoOptions.variables['#{운송장번호}'], '123456');
  assert.equal(shipping.kakaoOptions.buttons[0].linkMo, 'https://www.hanjin.com/kor/CMS/DeliveryMgr/WaybillResult.do?mCode=MN038&wblnum=123456&schLang=KR&wblnumText=');
  assert.equal(shipping.kakaoOptions.buttons[0].linkPc, shipping.kakaoOptions.buttons[0].linkMo);
  await lifecycle.update(id, { tracking_number: '654321' }, 3, 'test');
  assert.equal(requests.length, 4, 'shipping correction sends new snapshot');
  assert.equal((await lifecycle.logs()).filter(row => row.status === 'accepted').length, 4);
  await lifecycle.syncResults();
  assert.equal((await lifecycle.logs()).filter(row => row.status === 'delivered').length, 4);
  const cancelled = await lifecycle.update(id, { status: '주문취소', tracking_number: '777777' }, 4, 'test');
  assert.equal(cancelled.notification.status, 'accepted');
  assert.equal(requests.length, 6, 'cancellation sends its own approved template once');
  assert.equal(JSON.parse(requests[5].options.body).messages[0].kakaoOptions.templateId, 'FAKE-주문취소');
  const count = requests.length;
  await service.submit({ ...payload, requestKey: randomUUID(), phone: '01011111111' });
  assert.equal(requests.length, count, 'test mode blocks other customers');
  env.SOLAPI_MODE = 'off';
  const disabled = await service.submit({ ...payload, requestKey: randomUUID() });
  env.SOLAPI_MODE = 'test';
  const old = (await lifecycle.logs()).find(row => row.order_id === disabled.orderId);
  await lifecycle.dispatch(old.event_id);
  assert.equal(requests.length, count, 'enabling transport never sends old disabled events');
  const onsite = await service.submit({ ...payload, requestKey: randomUUID(), address: '[직접 픽업] 날짜: 2026-10-05 / 시간: 14:00', memo: '현장결제' });
  const beforeOnsite = requests.length;
  await assert.rejects(lifecycle.update(onsite.orderId, { status: '입금확인-픽업' }, 0, 'test'), /현장결제/);
  assert.equal(requests.length, beforeOnsite, 'onsite pickup does not receive bank deposit confirmation');
  for (const [mode, expected] of [['timeout', 'unknown'], ['http500', 'unknown'], ['http401', 'failed'], ['rejected', 'failed'], ['malformed', 'unknown']]) {
    responseMode = mode;
    const receipt = await service.submit({ ...payload, requestKey: randomUUID() });
    assert.equal(receipt.success, true, 'transport failure must not lose order');
    const row = (await lifecycle.logs()).find(row => row.order_id === receipt.orderId);
    assert.equal(row.status, expected);
    assert.ok(!row.reason.includes('SECRET'));
    const attempts = requests.length;
    await Promise.all([lifecycle.dispatch(row.event_id), lifecycle.dispatch(row.event_id)]);
    assert.equal(requests.length, attempts, 'uncertain and failed attempts never auto retry');
  }
  responseMode = 'delivery-failed';
  await lifecycle.syncResults();
  assert.equal((await lifecycle.logs()).find(row => row.order_id === onsite.orderId && row.template_status === '주문접수-픽업(현장결제)').status, 'failed');
  const originalRun = db.run.bind(db), beforeRollback = requests.length;
  db.run = function(query, params, callback) {
    if (query.startsWith('INSERT INTO order_event_notifications')) { callback(new Error('SIMULATED_AUDIT_FAILURE')); return this; }
    return originalRun(query, params, callback);
  };
  await assert.rejects(service.submit({ ...payload, requestKey: randomUUID() }), /SIMULATED/);
  await assert.rejects(lifecycle.update(id, { status: '입금확인-택배' }, 5, 'test'), /SIMULATED/);
  assert.equal(requests.length, beforeRollback, 'rolled back order or status never sends');
  assert.equal((await q.get('SELECT status FROM orders WHERE id = ?', [id])).status, '주문취소');
  db.run = originalRun;
  await new Promise(resolve => db.close(resolve));
  console.log('PASS: SOLAPI HMAC, approved variables/buttons, three order events, duplicate protection, off/test gates, pickup, cancellation, tracking edits, delivery results and ambiguous failures. Mock transport only; no real messages.');
})().catch(error => { console.error(error); process.exitCode = 1; });
