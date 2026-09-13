(() => {
  const labels = { 주문: '주문완료', 결제: '입금완료', 택배사: '택배발송', 주문취소: '주문취소' };
  window.orderStatusLabel = value => labels[value] || value;
  window.renderOrderHistory = async (id, container) => {
    container.replaceChildren();
    const heading = document.createElement('h3'); heading.textContent = `진행사항 · 주문 ${id}`;
    const content = document.createElement('div'); content.textContent = '변경 내역을 불러오고 있습니다.';
    container.append(heading, content);
    try {
      const response = await fetch(`/api/admin/orders/${id}/history`);
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      content.replaceChildren();
      if (data.legacy) { const note = document.createElement('p'); note.textContent = '이력 관리 도입 전 주문입니다. 이전 변경 시각은 기록되어 있지 않습니다.'; content.append(note); }
      for (const event of data.events) {
        const row = document.createElement('article'); row.className = 'order-history-row';
        const title = document.createElement('strong'); title.textContent = event.before ? `${labels[event.before.status]} → ${labels[event.after.status]}` : labels[event.after.status];
        if (event.kind === 'shipping') title.textContent = '운송장 정보 변경 · 알림 재전송 준비';
        const time = document.createElement('time'); time.textContent = new Date(event.created_at).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });
        const source = document.createElement('p'); source.textContent = `${event.actor} · ${event.source}`;
        row.append(title, time, source);
        if (event.kind.includes('shipping')) {
          const shipping = document.createElement('p'); shipping.textContent = `${event.before?.courier || '택배사 없음'} ${event.before?.tracking_number || '송장 없음'} → ${event.after.courier} ${event.after.tracking_number}`; row.append(shipping);
        }
        const notification = document.createElement('p'); notification.className = 'order-history-notice'; notification.textContent = event.notification_reason || ''; row.append(notification);
        content.append(row);
      }
    } catch (e) { content.textContent = e.message || '변경 이력을 불러오지 못했습니다. 다시 열어 주세요.'; }
  };
})();
