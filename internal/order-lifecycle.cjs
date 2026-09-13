// No network transport is imported or called by this module.
const { randomUUID } = require('node:crypto');
const STATUS = { 주문: '주문완료', 결제: '입금완료', 택배사: '택배발송', 주문취소: '주문취소' };
const VARIABLES = ['주문자명', '주문번호', '주문일시', '주문금액', '운송장번호', '택배사', '배송조회링크', '픽업일시'];
const HANJIN = 'https://www.hanjin.com/kor/CMS/DeliveryMgr/WaybillResult.do?mCode=MN038&schLang=KR&wblnum=';
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
  const values = { 주문자명: text(order.name), 주문번호: text(order.id), 주문일시: koreaTime(order.created_at), 주문금액: Number.isFinite(Number(order.total_price)) ? Number(order.total_price).toLocaleString('ko-KR') + '원' : '', 운송장번호: tracking, 택배사: courier, 배송조회링크: hanjin && tracking ? HANJIN + encodeURIComponent(tracking) : '', 픽업일시: date && time ? `${date} ${time.padStart(5, '0')}` : '' };
  const errors = new Set();
  const replace = value => text(value).replace(/#\{([^}]+)\}/g, (_, key) => {
    if (!values[key]) errors.add(key === '배송조회링크' && !hanjin ? '해당 택배사의 배송조회 링크 설정이 필요합니다.' : `${key} 정보가 없습니다.`);
    return values[key] || `〔${key} 없음〕`;
  });
  const result = { body: replace(template.body), button_label: replace(template.button_label), button_url: replace(template.button_url) };
  if (result.button_url && !errors.size) {
    try { if (new URL(result.button_url).protocol !== 'https:') throw Error(); } catch { errors.add('배송조회 버튼 주소를 확인해 주세요.'); }
    if (result.button_url.includes('hanjin.com') && !hanjin) errors.add('다른 택배사에는 한진 배송조회 링크를 사용할 수 없습니다.');
  }
  return { ...result, errors: [...errors] };
}
function createLifecycle(db) {
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
      for (const [status, label] of Object.entries(STATUS)) {
        await connection.run('INSERT INTO notification_templates (status, body, provider_code, button_label, button_url) VALUES (?, ?, ?, ?, ?) ON CONFLICT (status) DO NOTHING', [status, `#{주문자명}님, 주문 #{주문번호} ${label} 안내입니다.` + (status === '택배사' ? '\n#{택배사} 운송장 번호: #{운송장번호}' : ''), '', status === '택배사' ? '배송조회' : '', status === '택배사' ? '#{배송조회링크}' : '']);
      }
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
    const target = shippingChanged ? '택배사' : after.status;
    const template = await tx.get('SELECT * FROM notification_templates WHERE status = ?', [target]);
    const rendered = renderTemplate(template, after);
    let state = 'disabled', reason = '실제 발송은 꺼져 있습니다. 자동 발송하거나 재시도하지 않습니다.';
    if (!template.enabled) reason = '이 상태의 템플릿이 사용 안 함으로 설정되어 있습니다. 실제 발송하지 않았습니다.';
    else if (rendered.errors.length) { state = 'blocked'; reason = rendered.errors.join(' '); }
    else if (!template.provider_code) { state = 'blocked'; reason = '비즈톡 승인 템플릿 코드가 없습니다. 실제 발송하지 않았습니다.'; }
    await tx.run('INSERT INTO order_event_notifications (event_id, order_id, template_status, template_version, template_json, rendered_json, status, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [event, after.id, target, template.version, JSON.stringify(template), JSON.stringify(rendered), state, reason, at]);
    return event;
  }
  async function update(id, patch, expectedRevision, source) {
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) throw fail('주문 정보를 새로 불러온 뒤 다시 저장해 주세요.', 409);
    return transaction(async tx => {
      const before = await tx.get('SELECT * FROM orders WHERE id = ?', [id]);
      if (!before) throw fail('주문을 찾을 수 없습니다.', 404);
      const after = { ...before, ...patch };
      if (!STATUS[after.status]) throw fail('주문 상태를 확인해 주세요.');
      after.courier = text(after.courier); after.tracking_number = text(after.tracking_number);
      const shippingChanged = text(before.courier) !== after.courier || text(before.tracking_number) !== after.tracking_number;
      if (after.status === '택배사' || shippingChanged) {
        if (text(after.address).includes('[직접 픽업]')) throw fail('직접 픽업 주문에는 택배발송을 적용할 수 없습니다.');
        if (!after.courier || !after.tracking_number) throw fail('택배사와 운송장 번호를 모두 입력해 주세요.');
      }
      const keys = ['name', 'phone', 'address', 'memo', 'items', 'total_price', 'status', 'tracking_number', 'courier'];
      if (before.revision !== expectedRevision) throw fail('다른 화면에서 이 주문이 수정되었습니다. 새로고침 후 변경 내용을 확인해 주세요.', 409);
      if (keys.every(k => text(before[k]) === text(after[k]))) return { success: true, revision: before.revision, unchanged: true };
      const result = await tx.run(`UPDATE orders SET ${keys.map(k => k + ' = ?').join(', ')}, revision = revision + 1 WHERE id = ? AND revision = ?`, [...keys.map(k => after[k]), id, expectedRevision]);
      if (!result.changes) throw fail('다른 화면에서 이 주문이 수정되었습니다. 새로고침해 주세요.', 409);
      await record(tx, before, after, source);
      return { success: true, revision: before.revision + 1, notification: '실제 알림톡 발송은 꺼져 있습니다.' };
    });
  }
  async function history(id) {
    await ensureSchema();
    if (!await connection.get('SELECT id FROM orders WHERE id = ?', [id])) throw fail('주문을 찾을 수 없습니다.', 404);
    const events = await connection.all('SELECT e.*, n.reason AS notification_reason, n.status AS notification_status, n.template_status FROM order_events e LEFT JOIN order_event_notifications n ON n.event_id = e.id WHERE e.order_id = ? ORDER BY e.created_at DESC, e.id DESC', [id]);
    return { legacy: !events.some(e => e.kind === 'created'), events: events.map(e => ({ ...e, before: e.before_json ? JSON.parse(e.before_json) : null, after: JSON.parse(e.after_json) })).sort((a, b) => (b.after.revision ?? 0) - (a.after.revision ?? 0) || b.created_at.localeCompare(a.created_at)) };
  }
  async function templates() { await ensureSchema(); return { templates: await connection.all('SELECT * FROM notification_templates'), variables: VARIABLES, statuses: STATUS, sendingEnabled: false }; }
  async function saveTemplate(status, value) {
    if (!STATUS[status]) throw fail('주문 상태를 확인해 주세요.');
    const valid = validateTemplate(value);
    if (status === '택배사' && (!valid.body.includes('#{운송장번호}') || !valid.button_label || !valid.button_url)) throw fail('택배발송 문구에는 #{운송장번호}와 배송조회 버튼이 필요합니다.');
    if (!Number.isInteger(value.version)) throw fail('템플릿을 다시 불러와 주세요.', 409);
    await ensureSchema();
    const result = await connection.run('UPDATE notification_templates SET body = ?, provider_code = ?, button_label = ?, button_url = ?, enabled = ?, version = version + 1 WHERE status = ? AND version = ?', [valid.body, valid.provider_code, valid.button_label, valid.button_url, valid.enabled, status, value.version]);
    if (!result.changes) throw fail('다른 화면에서 템플릿이 수정되었습니다. 다시 불러와 주세요.', 409);
    return templates();
  }
  async function logs() {
    await ensureSchema();
    return connection.all('SELECT order_id, status, reason, created_at, created_at AS updated_at FROM order_event_notifications ORDER BY created_at DESC LIMIT 100');
  }
  return { ensureSchema, transaction, record, update, history, templates, saveTemplate, logs };
}
module.exports = { createLifecycle, sql, STATUS, VARIABLES, HANJIN, validateTemplate, renderTemplate };
