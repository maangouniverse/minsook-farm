// Commit order history before invoking the optional notification transport.
const { randomUUID } = require('node:crypto');
const ORDER_STATUSES = [
  '주문접수-택배',
  '주문접수-픽업(계좌이체)',
  '주문접수-픽업(현장결제)',
  '입금확인-택배',
  '입금확인-픽업',
  '택배발송',
  '주문취소'
];
const TEMPLATE_STATUS = Object.fromEntries(ORDER_STATUSES.map(status => [status, status]));
const LEGACY_TEMPLATE_STATUS = {
  '주문접수-택배': '주문',
  '주문접수-픽업(계좌이체)': '주문',
  '주문접수-픽업(현장결제)': '주문',
  '입금확인-택배': '결제',
  '입금확인-픽업': '결제',
  '택배발송': '택배사',
  '주문취소': '주문취소'
};
const PICKUP_STATUSES = new Set(['주문접수-픽업(계좌이체)', '주문접수-픽업(현장결제)', '입금확인-픽업']);
const DELIVERY_STATUSES = new Set(['주문접수-택배', '입금확인-택배', '택배발송']);
const notificationStatus = status => ORDER_STATUSES.includes(status) && status !== '주문취소' ? status
  : status === '주문' ? '주문접수-택배'
  : status === '결제' ? '입금확인-택배'
  : status === '택배사' ? '택배발송'
  : null;
const isPickupOrder = order => text(order.address).includes('[직접 픽업]');
function normalizeOrderStatus(status, order = {}) {
  if (ORDER_STATUSES.includes(status)) return status;
  if (status === '택배사') return '택배발송';
  if (status === '결제') return isPickupOrder(order) ? '입금확인-픽업' : '입금확인-택배';
  if (status === '주문') {
    if (!isPickupOrder(order)) return '주문접수-택배';
    return text(order.memo).includes('현장결제') ? '주문접수-픽업(현장결제)' : '주문접수-픽업(계좌이체)';
  }
  return status;
}
const VARIABLES = ['주문자명', '고객명', '수령인', '주문번호', '주문일시', '주문금액', '결제금액', '상품명', '수량', '배송지', '운송장번호', '택배사', '배송조회링크', '픽업일시'];
const HANJIN = 'https://www.hanjin.com/kor/CMS/DeliveryMgr/WaybillResult.do?mCode=MN038&wblnum=';
const hanjinTrackingUrl = tracking => `${HANJIN}${encodeURIComponent(tracking)}&schLang=KR&wblnumText=`;
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const sql = db => ({
  run: (q, p = []) => new Promise((yes, no) => db.run(q, p, function(e) { e ? no(e) : yes({ id: this.lastID, changes: this.changes }); })),
  get: (q, p = []) => new Promise((yes, no) => db.get(q, p, (e, r) => e ? no(e) : yes(r))),
  all: (q, p = []) => new Promise((yes, no) => db.all(q, p, (e, r) => e ? no(e) : yes(r)))
});
const text = value => String(value ?? '').trim();
function koreaTime(value) {
  const raw = String(value || '');
  const date = new Date(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(raw) ? raw.replace(' ', 'T') + 'Z' : raw);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });
}
function validateTemplate(value) {
  const result = { body: text(value.body), provider_code: text(value.provider_code), button_label: text(value.button_label), button_url: text(value.button_url), enabled: value.enabled === true || value.enabled === 1 ? 1 : 0 };
  if (!result.body || result.body.length > 4000 || result.provider_code.length > 200 || result.button_label.length > 50 || result.button_url.length > 2000) throw fail('안내 문구와 입력 길이를 확인해 주세요.');
  for (const field of ['body', 'button_label', 'button_url']) {
    const unknown = [...result[field].matchAll(/#\{([^}]*)\}/g)].map(m => m[1]).filter(v => !VARIABLES.includes(v));
    if (unknown.length || result[field].replace(/#\{[^}]*\}/g, '').includes('#{')) throw fail('지원하지 않거나 닫히지 않은 변수가 있습니다. 변수 목록에서 선택해 주세요.');
  }
  if (!!result.button_label !== !!result.button_url) throw fail('버튼 이름과 링크를 함께 입력해 주세요.');
  if (result.button_url && result.button_url !== '#{배송조회링크}' && !/^https:\/\//i.test(result.button_url)) throw fail('버튼 링크는 https://로 시작하거나 #{배송조회링크}를 사용해야 합니다.');
  return result;
}
function renderTemplate(template, order) {
  const pickup = text(order.address).includes('[직접 픽업]');
  const date = pickup && text(order.address).match(/\d{4}-\d{2}-\d{2}/)?.[0];
  const time = pickup && text(order.address).match(/\d{1,2}:\d{2}/)?.[0];
  const tracking = text(order.tracking_number), courier = text(order.courier);
  const hanjin = /^(한진|한진택배)$/i.test(courier);
  let items = [];
  try { items = Array.isArray(order.items) ? order.items : JSON.parse(order.items || '[]'); } catch {}
  const amount = Number.isFinite(Number(order.total_price)) ? Number(order.total_price).toLocaleString('ko-KR') : '';
  const values = {
    주문자명: text(order.name), 고객명: text(order.name), 수령인: text(order.name), 주문번호: text(order.id), 주문일시: koreaTime(order.created_at),
    주문금액: amount ? amount + '원' : '', 결제금액: amount,
    상품명: items.map(item => text(item.name)).filter(Boolean).join(', '),
    수량: items.map(item => `${Number(item.quantity)}${text(item.unit)}`).filter(value => !value.startsWith('NaN')).join(', '),
    배송지: text(order.address), 운송장번호: tracking, 택배사: courier,
    배송조회링크: hanjin && tracking ? hanjinTrackingUrl(tracking) : '', 픽업일시: date && time ? `${date} ${time.padStart(5, '0')}` : ''
  };
  const errors = new Set(), variables = {};
  const replace = value => text(value).replace(/#\{([^}]+)\}/g, (_, key) => {
    if (!values[key]) errors.add(key === '배송조회링크' && !hanjin ? '해당 택배사의 배송조회 링크 설정이 필요합니다.' : `${key} 정보가 없습니다.`);
    variables[`#{${key}}`] = values[key] || '';
    return values[key] || `〔${key} 없음〕`;
  });
  const result = { body: replace(template.body), button_label: replace(template.button_label), button_url: replace(template.button_url) };
  if (result.button_url && !errors.size) {
    try { if (new URL(result.button_url).protocol !== 'https:') throw Error(); } catch { errors.add('배송조회 버튼 주소를 확인해 주세요.'); }
    if (result.button_url.includes('hanjin.com') && !hanjin) errors.add('다른 택배사에는 한진 배송조회 링크를 사용할 수 없습니다.');
  }
  return { ...result, variables, errors: [...errors] };
}
function createLifecycle(db, { notifier = null } = {}) {
  const connection = sql(db);
  let ready, queue = Promise.resolve();
  async function ensureSchema() {
    if (!ready) ready = (async () => {
      try { await connection.run('ALTER TABLE orders ADD COLUMN revision INTEGER NOT NULL DEFAULT 0'); }
      catch (e) { if (e.code !== '42701' && !/duplicate column|already exists/i.test(e.message)) throw e; }
      await connection.run('CREATE TABLE IF NOT EXISTS order_events (id TEXT PRIMARY KEY, order_id INTEGER NOT NULL, kind TEXT NOT NULL, actor TEXT NOT NULL, source TEXT NOT NULL, before_json TEXT, after_json TEXT NOT NULL, created_at TEXT NOT NULL)');
      await connection.run('CREATE INDEX IF NOT EXISTS idx_order_events_order ON order_events(order_id, created_at)');
      await connection.run('CREATE TABLE IF NOT EXISTS notification_templates (status TEXT PRIMARY KEY, body TEXT NOT NULL, provider_code TEXT NOT NULL, button_label TEXT NOT NULL, button_url TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1)');
      await connection.run('CREATE TABLE IF NOT EXISTS order_event_notifications (event_id TEXT PRIMARY KEY, order_id INTEGER NOT NULL, template_status TEXT NOT NULL, template_version INTEGER NOT NULL, template_json TEXT NOT NULL, rendered_json TEXT NOT NULL, status TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL)');
      for (const column of ['recipient_phone TEXT', 'provider_message_id TEXT', 'provider_status_code TEXT', 'updated_at TEXT']) {
        try { await connection.run(`ALTER TABLE order_event_notifications ADD COLUMN ${column}`); }
        catch (e) { if (e.code !== '42701' && !/duplicate column|already exists/i.test(e.message)) throw e; }
      }
      for (const [status, label] of Object.entries(TEMPLATE_STATUS)) {
        const legacy = await connection.get('SELECT * FROM notification_templates WHERE status = ?', [LEGACY_TEMPLATE_STATUS[status]]);
        const body = legacy?.body || `#{주문자명}님, 주문 #{주문번호} ${label} 안내입니다.` + (status === '택배발송' ? '\n#{택배사} 운송장 번호: #{운송장번호}' : '');
        await connection.run('INSERT INTO notification_templates (status, body, provider_code, button_label, button_url, enabled, version) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (status) DO NOTHING', [status, body, legacy?.provider_code || '', legacy?.button_label || (status === '택배발송' ? '배송조회' : ''), legacy?.button_url || (status === '택배발송' ? '#{배송조회링크}' : ''), legacy?.enabled || 0, legacy?.version || 1]);
      }
      await connection.run("DELETE FROM notification_templates WHERE status IN ('주문', '결제', '택배사')");
      await connection.run(`UPDATE orders SET status = CASE
        WHEN status = '주문' AND address LIKE '%[직접 픽업]%' AND COALESCE(memo, '') LIKE '%현장결제%' THEN '주문접수-픽업(현장결제)'
        WHEN status = '주문' AND address LIKE '%[직접 픽업]%' THEN '주문접수-픽업(계좌이체)'
        WHEN status = '주문' THEN '주문접수-택배'
        WHEN status = '결제' AND address LIKE '%[직접 픽업]%' THEN '입금확인-픽업'
        WHEN status = '결제' THEN '입금확인-택배'
        WHEN status = '택배사' THEN '택배발송'
        ELSE status END
        WHERE status IN ('주문', '결제', '택배사')`);
    })().catch(e => { ready = null; throw e; });
    return ready;
  }
  async function transaction(work) {
    await ensureSchema();
    if (db.transaction) return db.transaction(raw => work(sql(raw)));
    // Serialized fallback for isolated, in-memory tests only.
    const pending = queue.then(async () => {
      await connection.run('BEGIN IMMEDIATE');
      try { const result = await work(connection); await connection.run('COMMIT'); return result; }
      catch (e) { await connection.run('ROLLBACK'); throw e; }
    });
    queue = pending.catch(() => {}); return pending;
  }
  async function record(tx, before, after, source) {
    const statusChanged = !before || before.status !== after.status;
    const shippingChanged = !!before && (text(before.courier) !== text(after.courier) || text(before.tracking_number) !== text(after.tracking_number));
    if (before && !statusChanged && !shippingChanged) return null;
    const event = randomUUID(), at = new Date().toISOString();
    const snapshot = o => o ? JSON.stringify({ status: o.status, courier: o.courier || '', tracking_number: o.tracking_number || '', revision: o === after ? (before ? before.revision + 1 : 0) : o.revision }) : null;
    await tx.run('INSERT INTO order_events (id, order_id, kind, actor, source, before_json, after_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [event, after.id, !before ? 'created' : statusChanged && shippingChanged ? 'status_shipping' : shippingChanged ? 'shipping' : 'status', before ? '관리자' : '신규 주문 접수', source, snapshot(before), snapshot(after), at]);
    const target = notificationStatus(after.status);
    const previousTarget = before ? notificationStatus(before.status) : null;
    const templateStatus = target || '주문취소';
    const template = await tx.get('SELECT * FROM notification_templates WHERE status = ?', [templateStatus]);
    const rendered = renderTemplate(template, after);
    let state = 'disabled', reason = '실제 발송은 꺼져 있습니다. 자동 발송하거나 재시도하지 않습니다.';
    if (!template.enabled) reason = '이 상태의 템플릿이 사용 안 함으로 설정되어 있습니다. 실제 발송하지 않았습니다.';
    else if (rendered.errors.length) { state = 'blocked'; reason = rendered.errors.join(' '); }
    else if (rendered.body.length > 1000) { state = 'blocked'; reason = '변수 치환 후 알림톡 본문이 1,000자를 초과합니다.'; }
    else if (!template.provider_code) { state = 'blocked'; reason = '솔라피 승인 템플릿 ID가 없습니다. 실제 발송하지 않았습니다.'; }
    else if (notifier) { const eligible = notifier.eligibility(after.phone); state = eligible.status; reason = eligible.reason; }
    const shouldNotify = !!target && (!before || target !== previousTarget || (target === '택배발송' && shippingChanged));
    if (!shouldNotify) {
      state = 'disabled'; reason = '주문접수·입금확인·택배발송 시점의 알림만 발송합니다.';
    }
    await tx.run('INSERT INTO order_event_notifications (event_id, order_id, template_status, template_version, template_json, rendered_json, status, reason, created_at, recipient_phone, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [event, after.id, templateStatus, template.version, JSON.stringify(template), JSON.stringify(rendered), state, reason, at, after.phone, at]);
    return event;
  }
  function readiness() {
    return notifier?.readiness() || { provider: 'solapi', mode: 'off', enabled: false, reason: '솔라피 발송이 꺼져 있습니다. 채널 연결과 승인 템플릿 설정이 필요합니다.' };
  }
  async function dispatch(eventId) {
    if (!eventId || !notifier) return;
    // A committed event can be claimed only once, across processes as well.
    // Never throw a notification error back as an order-save failure.
    try {
      const claimed = await connection.run("UPDATE order_event_notifications SET status = 'processing', reason = ?, updated_at = ? WHERE event_id = ? AND status = 'queued'", ['솔라피 응답 확인 중입니다. 중단된 경우 솔라피 내역을 먼저 확인해 주세요.', new Date().toISOString(), eventId]);
      if (!claimed.changes) return;
      const row = await connection.get('SELECT * FROM order_event_notifications WHERE event_id = ?', [eventId]);
      let result;
      try { result = await notifier.send({ to: row.recipient_phone, template: JSON.parse(row.template_json), rendered: JSON.parse(row.rendered_json), reference: eventId }); }
      catch (error) { result = { status: error.uncertain ? 'unknown' : 'failed', reason: error.uncertain ? '응답을 확인하지 못했습니다. 솔라피 발송 내역을 확인해 주세요. 자동 재발송하지 않습니다.' : '솔라피 요청 실패. 인증·채널·승인 템플릿·잔액을 확인해 주세요.' }; }
      await connection.run('UPDATE order_event_notifications SET status = ?, reason = ?, provider_message_id = ?, provider_status_code = ?, updated_at = ? WHERE event_id = ?', [result.status, result.reason, result.messageId || null, result.code || null, new Date().toISOString(), eventId]);
    } catch { console.error('Notification audit requires review', { eventId, code: 'NOTIFICATION_AUDIT_FAILED' }); }
  }
  async function syncResults() {
    await ensureSchema();
    if (!notifier || !readiness().enabled) throw fail(readiness().reason);
    const rows = await connection.all("SELECT event_id, provider_message_id FROM order_event_notifications WHERE status = 'accepted' AND provider_message_id IS NOT NULL ORDER BY created_at LIMIT 100");
    const results = await notifier.results(rows.map(row => row.provider_message_id));
    for (const row of rows) {
      const result = results[row.provider_message_id];
      if (result) await connection.run("UPDATE order_event_notifications SET status = ?, reason = ?, provider_status_code = ?, updated_at = ? WHERE event_id = ? AND status = 'accepted'", [result.status, result.reason, result.code || null, new Date().toISOString(), row.event_id]);
    }
    return { checked: Object.keys(results).length };
  }
  async function update(id, patch, expectedRevision, source) {
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) throw fail('주문 정보를 새로 불러온 뒤 다시 저장해 주세요.', 409);
    const result = await transaction(async tx => {
      const before = await tx.get('SELECT * FROM orders WHERE id = ?', [id]);
      if (!before) throw fail('주문을 찾을 수 없습니다.', 404);
      const after = { ...before, ...patch };
      if (!ORDER_STATUSES.includes(after.status)) throw fail('주문 상태를 확인해 주세요.');
      after.courier = text(after.courier); after.tracking_number = text(after.tracking_number);
      const shippingChanged = text(before.courier) !== after.courier || text(before.tracking_number) !== after.tracking_number;
      const pickup = isPickupOrder(after);
      if (pickup && DELIVERY_STATUSES.has(after.status)) throw fail('직접 픽업 주문에는 픽업 상태를 선택해 주세요.');
      if (!pickup && PICKUP_STATUSES.has(after.status)) throw fail('택배 주문에는 택배 상태를 선택해 주세요.');
      const onsitePickup = pickup && text(after.memo).includes('현장결제');
      if (onsitePickup && !['주문접수-픽업(현장결제)', '주문취소'].includes(after.status)) throw fail('현장결제 픽업 주문에는 입금확인 상태를 적용할 수 없습니다.');
      if (pickup && !onsitePickup && after.status === '주문접수-픽업(현장결제)') throw fail('계좌이체 픽업 주문에는 계좌이체 상태를 선택해 주세요.');
      if (after.status === '택배발송' || shippingChanged) {
        if (pickup) throw fail('직접 픽업 주문에는 택배발송을 적용할 수 없습니다.');
        if (!after.courier || !after.tracking_number) throw fail('택배사와 운송장 번호를 모두 입력해 주세요.');
      }
      const keys = ['name', 'phone', 'address', 'memo', 'items', 'total_price', 'status', 'tracking_number', 'courier'];
      if (before.revision !== expectedRevision) throw fail('다른 화면에서 이 주문이 수정되었습니다. 새로고침 후 변경 내용을 확인해 주세요.', 409);
      if (keys.every(k => text(before[k]) === text(after[k]))) return { success: true, revision: before.revision, unchanged: true };
      const result = await tx.run(`UPDATE orders SET ${keys.map(k => k + ' = ?').join(', ')}, revision = revision + 1 WHERE id = ? AND revision = ?`, [...keys.map(k => after[k]), id, expectedRevision]);
      if (!result.changes) throw fail('다른 화면에서 이 주문이 수정되었습니다. 새로고침해 주세요.', 409);
      const eventId = await record(tx, before, after, source);
      return { success: true, revision: before.revision + 1, eventId };
    });
    await dispatch(result.eventId);
    if (!result.eventId) return result;
    const notification = await connection.get('SELECT status, reason, provider_message_id, provider_status_code FROM order_event_notifications WHERE event_id = ?', [result.eventId]);
    return { ...result, notification };
  }
  async function history(id) {
    await ensureSchema();
    if (!await connection.get('SELECT id FROM orders WHERE id = ?', [id])) throw fail('주문을 찾을 수 없습니다.', 404);
    const events = await connection.all('SELECT e.*, n.reason AS notification_reason, n.status AS notification_status, n.template_status FROM order_events e LEFT JOIN order_event_notifications n ON n.event_id = e.id WHERE e.order_id = ? ORDER BY e.created_at DESC, e.id DESC', [id]);
    return { legacy: !events.some(e => e.kind === 'created'), events: events.map(e => ({ ...e, before: e.before_json ? JSON.parse(e.before_json) : null, after: JSON.parse(e.after_json) })).sort((a, b) => (b.after.revision ?? 0) - (a.after.revision ?? 0) || b.created_at.localeCompare(a.created_at)) };
  }
  async function templates() {
    await ensureSchema();
    const rows = await connection.all('SELECT * FROM notification_templates');
    return { templates: ORDER_STATUSES.map(status => rows.find(row => row.status === status)).filter(Boolean), variables: VARIABLES, statuses: TEMPLATE_STATUS, sendingEnabled: readiness().enabled, readiness: readiness() };
  }
  async function saveTemplate(status, value) {
    if (!TEMPLATE_STATUS[status]) throw fail('주문 상태를 확인해 주세요.');
    const valid = validateTemplate(value);
    if (status === '택배발송' && (!valid.body.includes('#{운송장번호}') || !valid.button_label || !valid.button_url)) throw fail('택배발송 문구에는 #{운송장번호}와 배송조회 버튼이 필요합니다.');
    if (!Number.isInteger(value.version)) throw fail('템플릿을 다시 불러와 주세요.', 409);
    await ensureSchema();
    const result = await connection.run('UPDATE notification_templates SET body = ?, provider_code = ?, button_label = ?, button_url = ?, enabled = ?, version = version + 1 WHERE status = ? AND version = ?', [valid.body, valid.provider_code, valid.button_label, valid.button_url, valid.enabled, status, value.version]);
    if (!result.changes) throw fail('다른 화면에서 템플릿이 수정되었습니다. 다시 불러와 주세요.', 409);
    return templates();
  }
  async function logs() {
    await ensureSchema();
    return connection.all("SELECT event_id, order_id, 'solapi' AS provider, template_status, status, reason, provider_message_id, provider_status_code, created_at, COALESCE(updated_at, created_at) AS updated_at FROM order_event_notifications ORDER BY created_at DESC LIMIT 100");
  }
  return { ensureSchema, transaction, record, dispatch, readiness, syncResults, update, history, templates, saveTemplate, logs };
}
module.exports = { createLifecycle, sql, TEMPLATE_STATUS, ORDER_STATUSES, PICKUP_STATUSES, DELIVERY_STATUSES, normalizeOrderStatus, notificationStatus, VARIABLES, HANJIN, hanjinTrackingUrl, validateTemplate, renderTemplate };
