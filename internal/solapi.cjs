const { createHmac, randomBytes } = require('node:crypto');

const phoneNumber = value => String(value || '').replace(/[^0-9]/g, '');
const safeId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(value) ? value : '';
const safeCode = value => /^\d{4}$/.test(String(value)) ? String(value) : '';
const uncertain = () => Object.assign(new Error('솔라피 응답을 확인하지 못했습니다. 자동 재발송하지 않습니다.'), { uncertain: true });

function deliveryResult(message) {
  const code = safeCode(message?.statusCode);
  if (code === '4000') return { status: 'delivered', reason: '솔라피에서 수신 성공을 확인했습니다.', code };
  if (message?.status === 'COMPLETE' && code && !code.startsWith('2')) return { status: 'failed', reason: `솔라피 발송 실패 (코드 ${code}). 솔라피 발송 내역을 확인해 주세요.`, code };
  return { status: 'accepted', reason: '솔라피 요청 접수 · 고객 수신 결과는 아직 확인되지 않았습니다.', code };
}

function createSolapi({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  function readiness() {
    const mode = env.SOLAPI_MODE || 'off';
    const missing = ['SOLAPI_API_KEY', 'SOLAPI_API_SECRET', 'SOLAPI_PF_ID'].filter(key => !String(env[key] || '').trim());
    if (!['test', 'live'].includes(mode)) return { provider: 'solapi', mode: 'off', enabled: false, reason: '솔라피 발송이 꺼져 있습니다. 채널 연결과 템플릿 승인 후 테스트 모드로 확인해 주세요.' };
    if (missing.length) return { provider: 'solapi', mode, enabled: false, reason: `솔라피 서버 설정이 필요합니다: ${missing.join(', ')}` };
    if (mode === 'test' && !/^01[016789]\d{7,8}$/.test(phoneNumber(env.SOLAPI_TEST_PHONE))) return { provider: 'solapi', mode, enabled: false, reason: '지정 테스트 휴대전화 번호 설정이 필요합니다.' };
    return { provider: 'solapi', mode, enabled: true, reason: mode === 'test' ? '솔라피 테스트 모드입니다. 지정 테스트 번호의 새 알림만 발송합니다.' : '솔라피 운영 모드입니다. 사용 설정된 템플릿으로 새 주문 알림을 발송합니다.' };
  }
  function eligibility(phone) {
    const state = readiness(), to = phoneNumber(phone);
    if (!state.enabled) return { status: 'disabled', reason: state.reason };
    if (!/^01[016789]\d{7,8}$/.test(to)) return { status: 'blocked', reason: '알림톡 수신 휴대전화 번호를 확인해 주세요.' };
    if (state.mode === 'test' && to !== phoneNumber(env.SOLAPI_TEST_PHONE)) return { status: 'blocked', reason: '지정 테스트 번호와 달라 발송하지 않았습니다.' };
    return { status: 'queued', reason: '주문 저장 완료 후 솔라피에 발송 요청합니다.' };
  }
  async function request(path, body) {
    const date = new Date().toISOString(), salt = randomBytes(16).toString('hex');
    const signature = createHmac('sha256', env.SOLAPI_API_SECRET).update(date + salt).digest('hex');
    let response;
    try {
      response = await fetchImpl(`https://api.solapi.com${path}`, {
        method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(8000),
        headers: { 'Content-Type': 'application/json', Authorization: `HMAC-SHA256 apiKey=${env.SOLAPI_API_KEY}, date=${date}, salt=${salt}, signature=${signature}` },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
    } catch { throw uncertain(); }
    if (!response.ok) {
      if (response.status >= 500 || response.status === 408) throw uncertain();
      throw new Error(`솔라피 요청이 거절되었습니다 (HTTP ${response.status}). 인증·채널·템플릿·잔액을 확인해 주세요.`);
    }
    try { return await response.json(); } catch { throw uncertain(); }
  }
  async function send({ to, template, rendered, reference }) {
    const allowed = eligibility(to);
    if (allowed.status !== 'queued') return allowed;
    const message = {
      to: phoneNumber(to), type: 'ATA', country: '82',
      customFields: { orderEventId: reference },
      kakaoOptions: { pfId: env.SOLAPI_PF_ID, templateId: template.provider_code, disableSms: true, variables: rendered.variables }
    };
    if (rendered.button_label) message.kakaoOptions.buttons = [{ buttonType: 'WL', buttonName: rendered.button_label, linkMo: rendered.button_url, linkPc: rendered.button_url }];
    const data = await request('/messages/v4/send-many/detail', { messages: [message], allowDuplicates: false, showMessageList: true });
    const failure = data.failedMessageList?.[0];
    if (failure) return { status: 'failed', reason: `솔라피 접수 거절${safeCode(failure.statusCode) ? ` (코드 ${safeCode(failure.statusCode)})` : ''}. 솔라피 발송 내역을 확인해 주세요.`, messageId: safeId(failure.messageId), code: safeCode(failure.statusCode) };
    const accepted = data.messageList?.[0];
    if (!safeId(accepted?.messageId) || !['2000', '4000'].includes(String(accepted?.statusCode))) throw uncertain();
    return { ...deliveryResult(accepted), messageId: safeId(accepted.messageId) };
  }
  async function results(ids) {
    if (!readiness().enabled) throw new Error(readiness().reason);
    const valid = ids.filter(id => safeId(id));
    if (!valid.length) return {};
    const query = new URLSearchParams({ messageIds: JSON.stringify(valid), limit: String(valid.length) });
    const data = await request(`/messages/v4/list?${query}`);
    const result = {};
    for (const id of valid) {
      const message = data.messageList?.[id];
      if (message && message.messageId === id) result[id] = deliveryResult(message);
    }
    return result;
  }
  return { readiness, eligibility, send, results };
}
module.exports = { createSolapi, phoneNumber, deliveryResult };
