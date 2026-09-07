// Capture locally: customer data and generated images never leave this browser.
(() => {
  let busy = false;
  const preview = document.createElement('div');
  preview.id = 'orderPrintPreview';
  preview.className = 'hidden';
  preview.innerHTML = `<div class="print-preview-toolbar"><strong>선택 주문 이미지 인쇄</strong>
    <button type="button" class="btn-confirm">인쇄 / PDF 저장</button>
    <button type="button" class="btn-cancel">닫기</button></div><div class="print-preview-pages"></div>`;
  document.body.append(preview);
  preview.querySelector('.btn-confirm').addEventListener('click', () => window.print());
  const close = () => { preview.classList.add('hidden'); preview.querySelector('.print-preview-pages').replaceChildren(); };
  preview.querySelector('.btn-cancel').addEventListener('click', close);
  preview.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  window.openPrintTemplate = async () => {
    if (busy) return;
    const selected = [...document.querySelectorAll('.order-checkbox:checked')].map(input => input.dataset.id);
    if (!selected.length) { showToast('인쇄할 주문을 먼저 선택해 주세요.'); return; }
    if (typeof html2canvas !== 'function') { showToast('이미지 인쇄를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.'); return; }
    busy = true;
    showToast('선택한 주문의 인쇄 이미지를 만들고 있습니다.');
    try {
      await document.fonts.ready;
      const source = document.getElementById('dashboardSection');
      const cuts = [];
      const canvas = await html2canvas(source, {
        scale: 2, backgroundColor: '#ffffff', useCORS: true,
        scrollX: 0, scrollY: 0, logging: false,
        onclone: doc => {
          const root = doc.getElementById('dashboardSection');
          root.style.minHeight = '0';
          root.style.height = 'auto';
          doc.querySelectorAll('.order-card-row').forEach(row => {
            if (!selected.includes(row.dataset.orderId)) row.remove();
          });
          const chosen = (window.allOrders || []).filter(order => selected.includes(String(order.id)));
          ['pickup', 'delivery'].forEach(kind => {
            const table = doc.getElementById(`${kind}OrdersTable`);
            const rows = chosen.filter(order => String(order.address || '').includes('[직접 픽업]') === (kind === 'pickup'));
            const total = doc.getElementById(`${kind}PaymentTotal`);
            if (total) total.textContent = `선택 결제금액 합계 (${rows.length}건): ${rows.reduce((sum, order) => sum + Number(order.total_price || 0), 0).toLocaleString()}원`;
            doc.getElementById(`${kind}CountBadge`).textContent = `${rows.length}건`;
            if (!rows.length) table.parentElement.parentElement.style.display = 'none';
          });
          const statMap = { statTotalOrders: null, statStatusOrder: '주문', statStatusPay: '결제', statStatusDelivery: '택배사', statStatusCancel: '주문취소' };
          Object.entries(statMap).forEach(([id, status]) => {
            doc.getElementById(id).textContent = `${chosen.filter(order => !status || order.status === status).length}건`;
          });
          doc.querySelectorAll('.admin-modal, #toast, #orderPrintPreview').forEach(node => node.remove());
          const top = root.getBoundingClientRect().top;
          doc.querySelectorAll('.order-card-row').forEach(row => cuts.push(Math.round(row.getBoundingClientRect().bottom - top)));
        }
      });
      const pages = preview.querySelector('.print-preview-pages'); pages.replaceChildren();
      const pageHeight = Math.floor(canvas.width * 190 / 277);
      const edges = cuts.map(value => value * 2);
      for (let y = 0; y < canvas.height;) {
        let bottom = Math.min(y + pageHeight, canvas.height);
        if (bottom < canvas.height) {
          const edge = edges.filter(value => value > y + pageHeight * .4 && value <= bottom).pop();
          if (edge) bottom = edge;
        }
        const page = document.createElement('canvas'); page.width = canvas.width; page.height = bottom - y;
        page.getContext('2d').drawImage(canvas, 0, y, canvas.width, bottom - y, 0, 0, canvas.width, bottom - y);
        const image = new Image(); image.alt = `선택 주문 인쇄 ${pages.children.length + 1}페이지`;
        image.src = page.toDataURL('image/png');
        const sheet = document.createElement('div'); sheet.className = 'print-image-sheet'; sheet.append(image); pages.append(sheet);
        y = bottom;
      }
      await Promise.all([...pages.querySelectorAll('img')].map(image => image.decode()));
      preview.classList.remove('hidden'); preview.querySelector('.btn-confirm').focus();
    } catch (error) {
      console.error('Print image generation failed', error);
      showToast('인쇄 이미지를 만들지 못했습니다. 다시 시도해 주세요.');
    } finally { busy = false; }
  };
})();
