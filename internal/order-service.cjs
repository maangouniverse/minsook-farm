const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const clean = value => typeof value === 'string' && !['undefined', 'null'].includes(value.trim()) ? value.trim().replace(/\s+/g, ' ') : '';
function paymentAccount() {
  // The existing published account is the source of truth, not a second constant.
  const html = fs.readFileSync(path.join(__dirname, '../index_new.html'), 'utf8');
  const display = html.match(/class="bank-number">([^<]+)</)?.[1]?.trim() || '';
  const holder = html.match(/class="bank-holder">([^<]+)</)?.[1]?.trim() || '';
  const match = display.match(/^(.+?)\s+([\d-]+)$/);
  return match && holder ? { bankName: match[1], accountNumber: match[2], holder } : null;
}
function normalizeOrder(body) {
  const address = Object.hasOwn(body, 'basicAddress')
    ? [clean(body.postcode) ? `[${clean(body.postcode)}]` : '', clean(body.basicAddress), clean(body.detailAddress)].filter(Boolean).join(' ')
    : clean(body.address);
  const items = Array.isArray(body.items) ? body.items.map(item => ({ grade: clean(item.grade), name: clean(item.name), quantity: Number(item.quantity), unit: clean(item.unit) })) : [];
  if (!clean(body.name) || !clean(body.phone) || !address || (Object.hasOwn(body, 'basicAddress') && !clean(body.basicAddress)) || !items.length || items.some(item => !item.name || !item.unit || !Number.isFinite(item.quantity) || item.quantity <= 0) || !Number.isSafeInteger(Number(body.totalPrice)) || Number(body.totalPrice) < 0) {
    throw Object.assign(new Error('주문자, 연락처, 기본 배송주소와 상품을 확인해 주세요. 상세주소는 선택사항입니다.'), { status: 400 });
  }
  return { name: clean(body.name), phone: clean(body.phone), address, memo: clean(body.memo), items, totalPrice: Number(body.totalPrice) };
}
function createOrderService(db, { env = process.env, sendApprovedTemplate = null } = {}) {
  const run = (sql, args = []) => new Promise((resolve, reject) => db.run(sql, args, function(error) { error ? reject(error) : resolve({ id: this.lastID, changes: this.changes }); }));
  const get = (sql, args = []) => new Promise((resolve, reject) => db.get(sql, args, (error, row) => error ? reject(error) : resolve(row)));
  const all = (sql, args = []) => new Promise((resolve, reject) => db.all(sql, args, (error, rows) => error ? reject(error) : resolve(rows)));
  let ready;
  function ensureSchema() {
    if (!ready) ready = (async () => {
      for (const column of ['request_key', 'request_hash']) {
        try { await run(`ALTER TABLE orders ADD COLUMN ${column} TEXT`); }
        catch (error) { if (error.code !== '42701' && !/duplicate column|already exists/i.test(error.message)) throw error; }
      }
      await run('CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_request_key ON orders(request_key)');
      await run(`CREATE TABLE IF NOT EXISTS order_notifications (
        order_id INTEGER PRIMARY KEY, provider TEXT NOT NULL, status TEXT NOT NULL,
        reason TEXT NOT NULL, provider_message_id TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
    })().catch(error => { ready = null; throw error; });
    return ready;
  }
  function readiness() {
    return { enabled: false, mode: env.BIZTALK_MODE || 'off', reason: '비즈톡 API 규격·인증정보·발신프로필·승인 템플릿·지정 테스트 번호 확인 전입니다. 실제 발송은 비활성화되어 있습니다.' };
  }
  async function recordNotification(order) {
    await run("INSERT INTO order_notifications (order_id, provider, status, reason) VALUES (?, 'biztalk', 'queued', '') ON CONFLICT (order_id) DO NOTHING", [order.id]);
    // Claim once. A replay or second request can never dispatch this row again.
    const claimed = await run("UPDATE order_notifications SET status = 'processing', updated_at = CURRENT_TIMESTAMP WHERE order_id = ? AND status = 'queued'", [order.id]);
    if (!claimed.changes) return;
    let status = 'disabled', reason = readiness().reason, messageId = null;
    // No production transport is wired until the user's actual contract and
    // approved templates are supplied. A test adapter may be injected in tests.
    if (env.BIZTALK_MODE === 'test' && sendApprovedTemplate) {
      const testNumber = String(env.BIZTALK_TEST_PHONE || '').replace(/\D/g, '');
      if (!testNumber || testNumber !== order.phone.replace(/\D/g, '')) {
        status = 'blocked'; reason = '지정 테스트 번호와 달라 발송하지 않았습니다.';
      } else {
        try {
          const result = await sendApprovedTemplate({ order, account: order.address.includes('[직접 픽업]') && order.memo.includes('현장결제') ? null : paymentAccount(), reference: `order-${order.id}` });
          status = result.delivered === true ? 'delivered' : 'accepted';
          reason = result.delivered === true ? '수신 성공 확인' : '발송 요청 접수됨. 실제 수신 결과 확인 필요';
          messageId = String(result.messageId || '').slice(0, 120);
        } catch (error) {
          status = error.uncertain ? 'unknown' : 'failed';
          // Never persist credentials, response bodies, phone numbers or stacks.
          reason = error.uncertain ? '응답을 확인하지 못했습니다. 중복 발송 방지를 위해 자동 재시도하지 않습니다.' : '비즈톡 발송 요청이 실패했습니다. 인증·채널·템플릿·잔액 또는 통신 상태 확인이 필요합니다.';
        }
      }
    }
    await run('UPDATE order_notifications SET status = ?, reason = ?, provider_message_id = ?, updated_at = CURRENT_TIMESTAMP WHERE order_id = ?', [status, reason, messageId, order.id]);
  }
  async function submit(body) {
    const order = normalizeOrder(body);
    const isOnsiteOrder = order.address.includes('[직접 픽업]') && order.memo.includes('현장결제');
    // Resolve receipt data before saving, so a missing source file cannot make
    // an already accepted order look like a failed order.
    const account = isOnsiteOrder ? null : paymentAccount();
    if (!isOnsiteOrder && !account) throw new Error('Payment account configuration unavailable');
    const key = body.requestKey || crypto.randomUUID(); // backward compatibility for old clients
    if (typeof key !== 'string' || !/^[a-zA-Z0-9-]{20,100}$/.test(key)) throw Object.assign(new Error('주문 확인번호가 올바르지 않습니다. 새로고침 후 다시 시도해 주세요.'), { status: 400 });
    const hash = crypto.createHash('sha256').update(JSON.stringify(order)).digest('hex');
    await ensureSchema();
    await run('INSERT INTO orders (name, phone, address, memo, items, total_price, request_key, request_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (request_key) DO NOTHING', [order.name, order.phone, order.address, order.memo, JSON.stringify(order.items), order.totalPrice, key, hash]);
    const saved = await get('SELECT * FROM orders WHERE request_key = ?', [key]);
    if (!saved || saved.request_hash !== hash) throw Object.assign(new Error('이미 사용된 주문 확인번호입니다. 기존 접수 내역을 먼저 확인해 주세요.'), { status: 409 });
    // This point is reached only after the order has been durably saved.
    try { await recordNotification({ ...order, id: saved.id }); }
    catch { console.error('Order notification audit unavailable', { orderId: saved.id, code: 'AUDIT_WRITE_FAILED' }); }
    const isOnsite = saved.address.includes('[직접 픽업]') && (saved.memo || '').includes('현장결제');
    return { success: true, orderId: saved.id, totalPrice: saved.total_price, paymentMethod: isOnsite ? 'onsite' : 'bank', paymentAccount: isOnsite ? null : account };
  }
  async function logs() {
    await ensureSchema();
    return { readiness: readiness(), logs: await all('SELECT order_id, provider, status, reason, provider_message_id, created_at, updated_at FROM order_notifications ORDER BY created_at DESC LIMIT 100') };
  }
  return { submit, logs, ensureSchema };
}
module.exports = { createOrderService, normalizeOrder, paymentAccount };
