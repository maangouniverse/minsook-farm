/* Order notification audit: read-only, never sends or retries a message. */
(() => {
  const button = document.getElementById('btnNotificationLogs');
  if (!button) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'admin-audit-dialog';
  dialog.setAttribute('aria-labelledby', 'notificationTitle');
  dialog.innerHTML = '<div class="admin-modal-header"><h3 id="notificationTitle">주문접수 알림톡</h3><button type="button" class="btn-cancel" data-close>닫기</button></div><div class="admin-audit-body"><p class="admin-audit-readiness" role="status"></p><p>비즈톡 연동 가이드, 발신 채널, 승인 템플릿과 테스트 번호를 확인한 뒤 발송을 연결합니다. 지금은 고객에게 알림톡이 발송되지 않습니다.</p><p>아래는 최근 100건의 처리 기록입니다. 비활성 기간의 주문을 나중에 자동 발송하지 않습니다.</p><div class="admin-audit-list"></div><button type="button" class="btn-action" data-refresh>기록 새로고침</button></div>';
  document.body.appendChild(dialog);
  const statusNames = { disabled: '비활성 · 미발송', queued: '처리 대기', processing: '결과 확인 필요', blocked: '발송 차단', accepted: '요청 접수 · 수신 미확인', delivered: '수신 성공', failed: '발송 실패', unknown: '결과 미확인' };
  async function refresh() {
    const state = dialog.querySelector('[role="status"]');
    const list = dialog.querySelector('.admin-audit-list');
    state.textContent = '상태를 확인하고 있습니다.';
    list.replaceChildren();
    try {
      const response = await fetch('/api/admin/notifications', { credentials: 'same-origin' });
      if (!response.ok) throw new Error('load');
      const data = await response.json();
      state.textContent = data.readiness.reason;
      if (!data.logs.length) list.textContent = '아직 기록이 없습니다. 이 기능 배포 후 접수된 주문부터 기록합니다.';
      for (const log of data.logs) {
        const row = document.createElement('article');
        row.className = 'admin-audit-row';
        const title = document.createElement('strong');
        title.textContent = `주문 #${log.order_id} · ${statusNames[log.status] || '확인 필요'}`;
        const time = document.createElement('time');
        const rawTime = String(log.updated_at || '');
        const timestamp = new Date(/^\d{4}-\d{2}-\d{2} /.test(rawTime) ? `${rawTime.replace(' ', 'T')}Z` : rawTime);
        time.textContent = Number.isNaN(timestamp.getTime()) ? rawTime : timestamp.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false });
        const reason = document.createElement('p');
        reason.textContent = log.reason || '처리 중 중단되었을 수 있습니다. 자동 재발송하지 않으며 발송 결과를 먼저 확인해야 합니다.';
        row.append(title, time, reason);
        list.appendChild(row);
      }
    } catch {
      state.textContent = '기록을 불러오지 못했습니다. 로그인 상태를 확인하고 다시 시도해 주세요. 주문 접수 내역은 유지됩니다.';
    }
  }
  button.addEventListener('click', () => { dialog.showModal(); refresh(); });
  dialog.querySelector('[data-close]').onclick = () => dialog.close();
  dialog.querySelector('[data-refresh]').onclick = refresh;
})();
