// Order workspace: Korea-date filtering and authenticated detail editing.
(() => {
  const koreaDate = value => new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date(value));
  const pickupParts = order => {
    const text = String(order.address || '');
    const date = text.match(/(\d{4})-(\d{2})-(\d{2})/);
    const time = text.match(/(\d{1,2}):(\d{2})/);
    return date && time ? { date: date[0], time: `${time[1].padStart(2, '0')}:${time[2]}` } : null;
  };
  const isPickup = order => String(order.address || '').includes('[직접 픽업]');
  window.getPickupDateTime = order => {
    const parts = pickupParts(order);
    // Missing pickup schedules must never silently use the order creation time.
    return parts ? new Date(`${parts.date}T${parts.time}:00+09:00`) : new Date(8640000000000000);
  };
  window.initializeDateFilter = () => {
    const today = koreaDate(Date.now());
    document.getElementById('filterStartDate').value = today;
    document.getElementById('filterEndDate').value = today;
  };
  window.filterOrdersData = orders => {
    const start = document.getElementById('filterStartDate').value;
    const end = document.getElementById('filterEndDate').value;
    const type = document.getElementById('filterSearchType').value;
    const keyword = document.getElementById('filterSearchKeyword').value.trim().toLowerCase();
    const status = document.getElementById('filterStatus').value;
    return orders.filter(order => {
      const date = isPickup(order) ? pickupParts(order)?.date : koreaDate(order.created_at);
      if ((start || end) && (!date || (start && date < start) || (end && date > end))) return false;
      if (status !== 'all' && order.status !== status) return false;
      return !keyword || (type === 'all' ? ['name', 'phone', 'address'] : [type])
        .some(key => String(order[key] || '').toLowerCase().includes(keyword));
    });
  };
  window.applyFilters = () => {
    if (window.allOrders) renderOrdersTable(window.allOrders);
  };
  const baseReset = window.resetFilters;
  window.resetFilters = () => { baseReset(); initializeDateFilter(); applyFilters(); };
  ['filterStartDate', 'filterEndDate', 'filterSearchType', 'filterStatus'].forEach(id => {
    document.getElementById(id).addEventListener('change', applyFilters);
  });
  document.getElementById('filterSearchKeyword').addEventListener('input', applyFilters);

  const baseRow = window.createOrderRow;
  window.createOrderRow = (order, number) => {
    const row = baseRow(order, number);
    const parts = isPickup(order) && pickupParts(order);
    if (isPickup(order)) {
      row.querySelector('.order-date').textContent = parts ? `${parts.date} ${parts.time}` : '픽업 일시 미등록';
      row.querySelector('.order-card-meta').dataset.label = '번호·픽업일시';
    }
    row.querySelectorAll('td').forEach((cell, index) => {
      if (!index) return;
      cell.tabIndex = 0;
      cell.classList.add('order-edit-cell');
      cell.setAttribute('aria-label', `${cell.dataset.label || '주문'} 수정`);
      cell.addEventListener('click', event => {
        if (event.target.closest('input, select, button, a')) return;
        openOrderEditor(order.id);
      });
      cell.addEventListener('keydown', event => {
        if (event.target !== cell || !['Enter', ' '].includes(event.key)) return;
        event.preventDefault(); openOrderEditor(order.id);
      });
    });
    return row;
  };
  document.querySelector('#pickupOrdersTable th:nth-child(2)').textContent = '주문번호·픽업일시';
  document.querySelector('.filter-group .admin-form-label').textContent = '조회 기간 (픽업: 픽업일 / 택배: 주문일)';

  const modal = document.createElement('div');
  modal.className = 'admin-modal hidden';
  modal.id = 'orderEditModal';
  modal.innerHTML = `<div class="admin-modal-overlay"></div>
    <div class="admin-modal-content" role="dialog" aria-modal="true" aria-labelledby="orderEditTitle">
      <div class="admin-modal-header"><h3 id="orderEditTitle">주문 수정</h3><button type="button" class="admin-modal-close" aria-label="닫기">×</button></div>
      <form id="orderEditForm"><div class="order-edit-fields"></div><p class="order-edit-error" role="alert"></p>
      <div class="admin-modal-footer"><button type="button" class="btn-cancel">취소</button><button type="submit" class="btn-confirm">저장하기</button></div></form>
    </div>`;
  document.body.appendChild(modal);
  const form = modal.querySelector('form');
  let editing, priorFocus;
  const close = () => { modal.classList.add('hidden'); priorFocus?.focus(); };
  modal.querySelectorAll('.admin-modal-overlay, .admin-modal-close, .btn-cancel').forEach(el => el.addEventListener('click', close));
  modal.addEventListener('keydown', event => {
    if (event.key === 'Escape') close();
    if (event.key === 'Tab') {
      const nodes = [...modal.querySelectorAll('button,input,select,textarea')].filter(el => !el.disabled && el.offsetParent);
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  function openOrderEditor(id) {
    editing = window.allOrders.find(order => order.id === id);
    if (!editing) return;
    priorFocus = document.activeElement;
    const fields = modal.querySelector('.order-edit-fields');
    fields.replaceChildren();
    const field = (key, label, value, type = 'text') => {
      const group = document.createElement('div'); group.className = 'admin-form-group';
      const caption = document.createElement('label'); caption.className = 'admin-form-label'; caption.htmlFor = `edit-${key}`; caption.textContent = label;
      const input = document.createElement(type === 'textarea' ? 'textarea' : 'input');
      if (type !== 'textarea') input.type = type;
      input.name = key; input.id = caption.htmlFor; input.className = 'input-field'; input.value = value ?? '';
      if (type === 'number') { input.min = '0'; input.step = 'any'; }
      group.append(caption, input); fields.append(group); return input;
    };
    field('name', '주문자', editing.name).required = true;
    field('phone', '연락처', editing.phone).required = true;
    if (isPickup(editing)) {
      const parts = pickupParts(editing);
      field('pickupDate', '픽업 날짜', parts?.date, 'date').required = true;
      field('pickupTime', '픽업 시간', parts?.time, 'time').required = true;
    } else field('address', '배송지', editing.address, 'textarea').required = true;
    field('memo', '요청사항', editing.memo, 'textarea');
    const items = document.createElement('div'); items.className = 'order-edit-items'; fields.append(items);
    (editing.items || []).forEach((item, index) => {
      field(`itemName${index}`, `상품 ${index + 1}`, item.name).required = true;
      const quantity = field(`itemQuantity${index}`, '수량', item.quantity, 'number'); quantity.min = '0.01'; quantity.required = true;
      field(`itemUnit${index}`, '단위', item.unit);
    });
    field('total_price', '총 결제금액 (원)', editing.total_price, 'number').required = true;
    const state = field('status', '주문상태', editing.status);
    const select = document.createElement('select'); select.className = 'input-field'; select.name = state.name; select.id = state.id;
    ['주문', '결제', '택배사', '주문취소'].forEach(value => select.add(new Option(value, value, false, value === editing.status)));
    state.replaceWith(select);
    field('courier', '택배사', editing.courier);
    field('tracking_number', '송장번호', editing.tracking_number);
    modal.querySelector('.order-edit-error').textContent = '';
    modal.classList.remove('hidden'); form.elements.name.focus();
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    const payload = {
      name: values.name, phone: values.phone,
      address: isPickup(editing) ? `[직접 픽업] 날짜: ${values.pickupDate} / 시간: ${values.pickupTime}` : values.address,
      memo: values.memo, total_price: Number(values.total_price), status: values.status,
      courier: values.courier, tracking_number: values.tracking_number,
      items: (editing.items || []).map((item, index) => ({ ...item,
        name: values[`itemName${index}`], quantity: Number(values[`itemQuantity${index}`]), unit: values[`itemUnit${index}`]
      }))
    };
    const save = form.querySelector('[type="submit"]'); save.disabled = true;
    try {
      const response = await fetch(`/api/admin/orders/${editing.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '저장하지 못했습니다. 다시 시도해 주세요.');
      close(); await loadOrders(); showToast('주문을 수정했습니다.');
    } catch (error) { modal.querySelector('.order-edit-error').textContent = error.message; }
    finally { save.disabled = false; }
  });
})();
