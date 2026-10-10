(() => {
  const opener = document.getElementById('btnNotificationTemplates');
  if (!opener) return;
  const dialog = document.createElement('dialog'); dialog.className = 'template-dialog';
  dialog.setAttribute('aria-labelledby', 'template-title');
  dialog.innerHTML = `<form><header><h2 id="template-title">알림톡 템플릿 관리</h2><button type="button" data-close>닫기</button></header>
    <p class="template-notice">솔라피 발송 설정을 확인하고 있습니다.</p>
    <p>솔라피에서 승인받은 템플릿 ID와 동일한 문구·변수·버튼을 입력하세요. 이 화면에서 문구를 저장해도 카카오 검수가 신청되지는 않습니다.</p>
    <p>주문 유형별 상태 7개를 각각 관리하고, 사용 설정된 승인 템플릿으로 알림톡을 발송합니다.</p>
    <fieldset><legend>판매자 주문 알림</legend><label>판매자 휴대전화 번호<input name="seller_phone" type="tel" maxlength="13" placeholder="010-1234-5678"></label><p>택배·픽업 주문이 접수되거나 취소되면 선택된 승인 템플릿을 이 번호에도 발송합니다.</p><button type="button" data-save-seller>판매자 번호 저장</button><p data-seller-status aria-live="polite"></p></fieldset>
    <label>주문 상태<select name="status"></select></label>
    <label class="template-checkbox"><input name="enabled" type="checkbox"> 이 템플릿 사용 (솔라피 발송 설정 완료 후 적용)</label>
    <label>솔라피 승인 템플릿 ID<input name="provider_code" maxlength="200"></label>
    <label>안내 문구<textarea name="body" rows="6" maxlength="4000" required></textarea></label>
    <fieldset><legend>변수 넣기 — 선택한 입력칸에 주문 정보가 들어갈 자리를 넣습니다</legend><div data-variables></div></fieldset>
    <label>버튼 이름<input name="button_label" maxlength="50"></label>
    <label>버튼 링크<input name="button_url" maxlength="2000" placeholder="#{배송조회링크}"></label>
    <p>한진택배 배송조회 버튼에는 #{배송조회링크}를 사용하세요. 다른 택배사는 조회 링크 설정이 필요합니다.</p>
    <label>미리보기용 가상 주문<select name="sample"><option value="delivery">택배 주문</option><option value="pickup">직접 픽업 주문</option></select></label>
    <div class="template-actions"><button type="button" data-preview>미리보기</button><button type="submit">문구 저장</button><button type="button" data-reload>저장된 문구 다시 불러오기</button></div>
    <p role="status" aria-live="polite"></p><section data-preview-result aria-label="알림톡 미리보기"></section></form>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form'), fields = form.elements;
  const notice = dialog.querySelector('[role="status"]'), preview = dialog.querySelector('[data-preview-result]');
  let templates = [], target = fields.body, dirty = false;
  const data = () => ({ body: fields.body.value, provider_code: fields.provider_code.value, button_label: fields.button_label.value, button_url: fields.button_url.value, enabled: fields.enabled.checked, version: templates.find(t => t.status === fields.status.value)?.version, pickup: fields.sample.value === 'pickup' });
  async function request(url, options) {
    const response = await fetch(url, options); const value = await response.json();
    if (!response.ok) throw Error(value.error || '처리하지 못했습니다. 다시 확인해 주세요.'); return value;
  }
  let selected = '주문접수-택배';
  function fill() {
    const template = templates.find(t => t.status === fields.status.value);
    if (!template) return;
    for (const name of ['body', 'provider_code', 'button_label', 'button_url']) fields[name].value = template[name];
    fields.enabled.checked = !!template.enabled; selected = template.status; dirty = false;
    preview.replaceChildren(); notice.textContent = '';
  }
  async function load() {
    notice.textContent = '저장된 문구를 불러오고 있습니다.';
    try {
      const value = await request('/api/admin/notification-templates'); templates = value.templates;
      dialog.querySelector('.template-notice').textContent = value.readiness?.reason || '솔라피 설정을 확인해 주세요.';
      fields.seller_phone.value = value.sellerPhone || '';
      fields.status.replaceChildren(...Object.entries(value.statuses).map(([key, label]) => new Option(label, key)));
      fields.status.value = selected; fill();
      dialog.querySelector('[data-variables]').replaceChildren(...value.variables.map(variable => {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = `#{${variable}}`;
        button.onclick = () => { target.setRangeText(button.textContent, target.selectionStart, target.selectionEnd, 'end'); target.focus(); dirty = true; };
        return button;
      }));
    } catch (e) { notice.textContent = e.message; }
  }
  form.addEventListener('input', event => { if (!['status', 'sample', 'seller_phone'].includes(event.target.name)) dirty = true; });
  for (const key of ['body', 'button_label', 'button_url']) fields[key].addEventListener('focus', () => { target = fields[key]; });
  fields.status.onchange = () => { if (dirty && !confirm('저장하지 않은 문구를 버리고 다른 상태를 보시겠습니까?')) { fields.status.value = selected; return; } fill(); };
  dialog.querySelector('[data-close]').onclick = () => { if (!dirty || confirm('저장하지 않은 문구를 버리고 닫으시겠습니까?')) dialog.close(); };
  dialog.addEventListener('cancel', event => { if (dirty && !confirm('저장하지 않은 문구를 버리고 닫으시겠습니까?')) event.preventDefault(); });
  dialog.querySelector('[data-reload]').onclick = () => { if (!dirty || confirm('작성 중인 문구를 버리고 저장된 문구를 불러오시겠습니까?')) load(); };
  dialog.querySelector('[data-preview]').onclick = async () => {
    try {
      const value = await request('/api/admin/notification-templates/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data()) });
      const body = document.createElement('p'); body.textContent = value.body; preview.replaceChildren(body);
      if (value.button_label) { const button = document.createElement('div'); button.className = 'template-preview-button'; button.textContent = value.button_label; const url = document.createElement('p'); url.textContent = value.button_url; preview.append(button, url); }
      notice.textContent = value.errors.length ? value.errors.join(' ') : '가상 주문 미리보기입니다. 알림톡은 발송되지 않았습니다.';
    } catch (e) { notice.textContent = e.message; }
  };
  dialog.querySelector('[data-save-seller]').onclick = async event => {
    const button = event.currentTarget, sellerStatus = dialog.querySelector('[data-seller-status]');
    button.disabled = true; sellerStatus.textContent = '판매자 번호를 저장하고 있습니다.';
    try {
      const value = await request('/api/admin/notification-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sellerPhone: fields.seller_phone.value }) });
      fields.seller_phone.value = value.sellerPhone || '';
      sellerStatus.textContent = value.sellerPhone ? '판매자 주문 접수·취소 알림 번호를 저장했습니다.' : '판매자 알림 번호를 비웠습니다.';
    } catch (e) { sellerStatus.textContent = e.message; }
    finally { button.disabled = false; }
  };
  form.onsubmit = async event => {
    event.preventDefault(); const button = form.querySelector('[type="submit"]'); button.disabled = true;
    try {
      const value = await request(`/api/admin/notification-templates/${encodeURIComponent(fields.status.value)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data()) });
      templates = value.templates; dirty = false; notice.textContent = '문구를 저장했습니다. ' + (value.readiness?.reason || '솔라피 발송 설정을 확인해 주세요.');
    } catch (e) { notice.textContent = e.message; }
    finally { button.disabled = false; }
  };
  opener.onclick = () => { dialog.showModal(); load(); };
})();
