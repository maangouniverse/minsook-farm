// Presentation only: the existing order calculator remains the source of prices.
document.addEventListener('DOMContentLoaded', () => {
  'use strict';
  const api = window.MinsookOrder;
  const shop = document.getElementById('farmShop');
  if (!api || !shop) return;
  const money = value => `${Number(value || 0).toLocaleString('ko-KR')}원`;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const photo = value => esc(value || 'minsook_main.jpg');
  const biteNotice = '한입오이만 주문하면 6kg까지 담을 수 있어요. 다른 오이와 함께 주문하면 모두 합쳐 9kg까지 담을 수 있어요. 이때도 한입오이는 6kg을 넘을 수 없어요.';
  const policy = `<p>무게 1kg 또는 개수 10개를 1단위로 계산하며, 모든 상품의 kg·개수 옵션을 함께 합산합니다.</p><p>합계 2단위 미만은 할인 없음, 2단위부터 <strong>전체 상품금액에 2%</strong> 할인됩니다. 이후 1단위마다 1%씩 늘어나 최대 12%까지 적용됩니다. 소수점 단위는 버림합니다.</p><p>예: 2kg 또는 20개 → 2%, 3kg 또는 30개 → 3%. 1kg + 10개도 2단위로 2% 할인됩니다.</p><p>할인 계산 후 상품금액의 10원 미만은 버림하며, 이 차액도 할인금액에 포함됩니다. 배송비는 할인 대상이 아닙니다.</p><p>택배 배송비 4,000원 · 직접픽업 배송비 0원. 제주·도서산간은 추가 배송비가 발생할 수 있습니다.</p><p>일반 오이는 총 12kg까지 주문할 수 있습니다. 개수 옵션은 1개당 0.18kg으로 환산합니다. ${biteNotice}</p>`;
  let quote = api.snapshot();
  let renderedProducts;
  let busy = false;
  let opener;
  shop.innerHTML = `<div class="shop-policy"><div><strong>여러 종류를 함께 담아도 할인돼요</strong><p>2kg 또는 20개부터 전체 상품금액을 2% 할인해요.<br>1kg 또는 10개를 더 담을 때마다 1%씩 늘어나요. 최대 12%까지 할인돼요.<br>무게와 개수를 섞어도 함께 계산해요. 예: 1kg + 10개 → 2% 할인</p></div><button type="button" class="shop-link" id="shopPolicyButton">할인정책 자세히 보기 ↗</button></div><div class="shop-toolbar"><span>① 주문 단위 선택 → ② 수량 입력 → ③ 장바구니 담기</span><button type="button" class="shop-secondary" id="shopCartButton">장바구니 보기 (0종)</button></div>`;
  const headerButton = document.createElement('button');
  headerButton.type = 'button'; headerButton.id = 'headerCart'; headerButton.className = 'shop-header-cart';
  headerButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h2l2.5 12h11l2-8H6M9 20h.01M18 20h.01"/></svg><span class="shop-cart-label">장바구니</span><span id="shopCount">0</span>';
  document.querySelector('.nav-container').append(headerButton);
  const drawer = document.createElement('dialog');
  drawer.className = 'shop-drawer'; drawer.setAttribute('aria-labelledby', 'shopDrawerTitle');
  drawer.innerHTML = `<div class="shop-drawer-head"><div><small>민숙농장 직거래</small><h2 id="shopDrawerTitle">장바구니</h2></div><button type="button" class="shop-icon" id="shopClose" aria-label="장바구니 닫기">×</button></div><div class="shop-drawer-body"><div id="shopSuccess" hidden role="status"></div><div id="shopCartContent"><div id="shopDeliveryTabs"></div><p class="shop-hint">담은 상품 <span id="shopItemCount">0</span>종 · 수량은 판매 단위에 맞춰 변경됩니다.</p><div id="shopLines"></div><div id="shopTotals"></div><p id="shopProgress" class="shop-progress"></p><button type="button" class="shop-link" id="shopCartPolicy">할인정책 자세히 보기</button><p class="shop-hint">택배 4,000원 · 직접픽업 0원<br>제주·도서산간은 추가 배송비가 발생할 수 있습니다.</p><p id="shopError" class="shop-error" role="alert"></p><button type="button" class="shop-primary shop-wide" id="shopCheckout">주문하기</button><button type="button" class="shop-link shop-wide" id="shopContinue">계속 쇼핑하기</button></div><div id="shopCheckoutContent" hidden><button type="button" class="shop-link" id="shopBack">← 장바구니 수정</button><div id="shopCheckoutSummary"></div><div id="shopFormMount"></div></div></div>`;
  document.body.append(drawer);
  const $ = selector => drawer.querySelector(selector);
  $('#shopDeliveryTabs').append(document.querySelector('.order-type-tabs'));
  const orderForm = document.getElementById('orderForm');
  $('#shopFormMount').append(orderForm);
  orderForm.className = 'shop-order-form';
  orderForm.querySelector('h3').textContent = '주문자 정보';
  orderForm.querySelector('.sms-guide').remove();
  orderForm.querySelector('.sms-desc').textContent = '장바구니 상품이 그대로 접수됩니다. 주문 접수는 결제완료가 아니며, 입금 확인 후 처리됩니다.';
  orderForm.querySelector('.sms-store-link').remove();
  const labels = { orderName: '주문자', orderPhone: '연락처', orderPostcode: '우편번호', orderAddress: '배송지 주소', orderAddressDetail: '상세주소 (선택)', orderMemoSelect: '배송메모', orderMemo: '배송메모 직접 입력' };
  Object.entries(labels).forEach(([id, label]) => {
    const input = document.getElementById(id);
    input.setAttribute('aria-label', label);
    if (['orderName', 'orderPhone'].includes(id)) { const el = document.createElement('label'); el.htmlFor = id; el.textContent = label; input.before(el); }
  });
  // Keep lookup while also accepting the customer's own road or lot address.
  ['orderAddress', 'orderPostcode'].forEach(id => { const input = document.getElementById(id); input.readOnly = false; input.addEventListener('input', api.refresh); });
  document.getElementById('orderAddress').placeholder = '도로명 또는 지번 주소';
  document.getElementById('orderAddressDetail').required = false;
  const onsiteNote = document.createElement('p'); onsiteNote.className = 'shop-hint'; onsiteNote.textContent = '현장결제는 카드 및 고흥사랑상품권 결제가 가능합니다.';
  document.querySelector('.payment-tabs').after(onsiteNote);
  const submit = document.getElementById('btnSendSms');
  submit.textContent = '주문 접수하기'; submit.removeAttribute('style'); submit.className = 'shop-primary shop-wide';
  const finalNotice = document.createElement('p'); finalNotice.className = 'shop-bite'; finalNotice.id = 'shopFinalBite'; finalNotice.textContent = biteNotice; submit.before(finalNotice);
  const paymentNotice = document.createElement('p'); paymentNotice.className = 'shop-hint'; submit.before(paymentNotice);
  const formError = document.createElement('p'); formError.className = 'shop-error'; formError.setAttribute('role', 'alert'); submit.before(formError);
  const preview = document.getElementById('smsPreview');
  const details = document.createElement('details'); details.className = 'shop-template';
  details.innerHTML = '<summary>문자·카카오톡용 주문양식 보기</summary><button type="button" class="shop-secondary" id="shopCopyTemplate">주문양식 복사</button>';
  preview.replaceWith(details); details.append(preview);
  const modal = document.createElement('dialog'); modal.className = 'shop-modal'; modal.setAttribute('aria-labelledby', 'shopModalTitle'); document.body.append(modal);
  function closeDrawer() { if (busy) return; drawer.close(); document.body.append(document.getElementById('toast')); document.body.classList.remove('shop-locked'); opener?.focus(); }
  function setStage(stage) {
    $('#shopCartContent').hidden = stage !== 'cart'; $('#shopCheckoutContent').hidden = stage !== 'checkout'; $('#shopSuccess').hidden = stage !== 'success';
    $('#shopDrawerTitle').textContent = stage === 'checkout' ? '주문서' : stage === 'success' ? '주문 접수 완료' : '장바구니';
    $('.shop-drawer-body').scrollTop = 0;
  }
  function openCart() { opener = document.activeElement; setStage('cart'); drawer.append(document.getElementById('toast')); if (!drawer.open) drawer.showModal(); document.body.classList.add('shop-locked'); }
  api.openCart = openCart;
  function openModal(title, content) {
    modal.innerHTML = `<div class="shop-modal-head"><h2 id="shopModalTitle">${esc(title)}</h2><button type="button" class="shop-icon" aria-label="창 닫기">×</button></div>${content}`;
    modal.querySelector('.shop-icon').onclick = () => modal.close(); if (!modal.open) modal.showModal();
  }
  function openPolicy() { openModal('할인정책 · 주문 수량 안내', `<div class="shop-policy-detail">${policy}</div>`); }
  const optionLabel = option => `${option.step}${option.unit} 단위 · ${money(option.isQty ? option.price : option.price * option.step)}`;
  function renderProducts() {
    if (renderedProducts === quote.products) return;
    renderedProducts = quote.products;
    if (!quote.products.length) return;
    document.querySelectorAll('#mainProductGrid .product-card[data-product-ids]').forEach((card, index) => {
      const ids = card.dataset.productIds.split(',');
      const options = quote.products.filter(p => ids.includes(String(p.id))).flatMap(p => p.options);
      if (!options.length) return;
      const title = card.querySelector('h3').textContent;
      const price = card.querySelector('.price');
      const controls = document.createElement('div');
      controls.className = 'shop-grade-controls';
      controls.setAttribute('role', 'group');
      controls.setAttribute('aria-label', `${title} 상품 선택`);
      controls.innerHTML = `<label for="gradeOption${index}">주문 단위</label><select id="gradeOption${index}">${options.map(o => `<option value="${esc(o.key)}">${o.unit === '개' ? '개수로 주문' : '무게로 주문'} · ${o.step}${esc(o.unit)}씩</option>`).join('')}</select><label for="gradeQuantity${index}">담을 수량</label><div class="shop-option-quantity"><button type="button" class="shop-secondary" data-less aria-label="${esc(title)} 수량 줄이기">−</button><input id="gradeQuantity${index}" type="number" inputmode="decimal"><span class="shop-grade-unit"></span><button type="button" class="shop-secondary" data-more aria-label="${esc(title)} 수량 늘리기">+</button></div><p class="shop-grade-amount"></p>${options.some(o => o.isBite) ? `<p class="shop-bite"><strong>한입오이, 담기 전에 확인해 주세요</strong><br>${biteNotice}</p>` : ''}<p class="shop-error" role="alert"></p><button type="button" class="shop-primary shop-wide" data-grade-add>장바구니 담기</button><div class="shop-added" hidden><p role="status"></p><button type="button" class="shop-secondary shop-wide" data-grade-cart>장바구니 보기</button></div>`;
      card.append(controls);
      const select = controls.querySelector('select');
      const quantity = controls.querySelector('input');
      const selected = () => options.find(o => o.key === select.value);
      const updateAmount = () => {
        const o = selected();
        controls.querySelector('.shop-grade-amount').textContent = `지금 담을 금액 ${money(Number(quantity.value) * o.price / (o.isQty ? o.step : 1))}`;
      };
      const reset = () => {
        const o = selected();
        quantity.min = o.step; quantity.step = o.step; quantity.value = o.step;
        quantity.setAttribute('aria-label', `${title} 담을 수량`);
        controls.querySelector('.shop-grade-unit').textContent = o.unit;
        price.innerHTML = `<strong>${money(o.isQty ? o.price : o.price * o.step)}</strong><span class="shop-sale-unit"> / ${o.step}${esc(o.unit)}<br>${o.step}${esc(o.unit)}씩 담을 수 있어요.</span>`;
        controls.querySelector('.shop-error').textContent = '';
        updateAmount();
      };
      select.onchange = reset; quantity.oninput = updateAmount;
      [['[data-less]', -1], ['[data-more]', 1]].forEach(([selector, direction]) => {
        controls.querySelector(selector).onclick = () => {
          quantity.value = Math.max(selected().step, Math.round((Number(quantity.value) + direction * selected().step) * 100) / 100);
          updateAmount();
        };
      });
      controls.querySelector('[data-grade-add]').onclick = () => {
        const o = selected(); const number = Number(quantity.value);
        const existing = quote.items.find(item => item.key === o.key)?.quantity || 0;
        if (!quantity.checkValidity() || !(number > 0) || !api.setQuantity(o.key, Math.round((existing + number) * 100) / 100)) {
          controls.querySelector('.shop-error').textContent = `수량은 ${o.step}${o.unit}씩 입력해 주세요. 일반 오이만 담으면 총 12kg, 한입오이는 6kg, 한입오이가 섞이면 총 9kg까지 담을 수 있어요.`;
          return;
        }
        controls.querySelector('.shop-error').textContent = '';
        controls.querySelector('.shop-added').hidden = false;
        controls.querySelector('[role="status"]').textContent = `장바구니에 담았습니다. ${o.name} ${number}${o.unit} 추가`;
      };
      controls.querySelector('[data-grade-cart]').onclick = openCart;
      reset();
    });
  }
  function totals() { return `<dl class="shop-totals"><div><dt>할인 전 상품금액</dt><dd>${money(quote.subtotal)}</dd></div><div class="shop-discount"><dt>수량 합산 할인 ${quote.discountRate}%<small>10원 미만 절사 포함</small></dt><dd>−${money(quote.discountAmount)}</dd></div><div><dt>배송비</dt><dd>${money(quote.shipping)}</dd></div><div class="shop-final-total"><dt>최종 결제금액</dt><dd>${money(quote.total)}</dd></div></dl>`; }
  function render() {
    renderProducts(); document.getElementById('shopCount').textContent = quote.items.length;
    document.getElementById('shopCartButton').textContent = `장바구니 보기 (${quote.items.length}종)`;
    document.querySelectorAll('[data-grade-cart]').forEach(button => button.textContent = `장바구니 보기 (${quote.items.length}종)`);
    if (!quote.items.length) document.querySelectorAll('.shop-added').forEach(message => message.hidden = true);
    headerButton.setAttribute('aria-label', `장바구니, 담긴 상품 ${quote.items.length}종`); $('#shopItemCount').textContent = quote.items.length;
    const lines = $('#shopLines');
    lines.innerHTML = quote.items.length ? quote.items.map((item, i) => `<article class="shop-line"><img src="${photo(item.images[0])}" alt="${esc(item.name)}"><div class="shop-line-info"><strong>${esc(item.name)}</strong><p>${esc(optionLabel(item))}</p><div class="shop-line-controls"><div class="shop-quantity"><button type="button" data-change="${i}" data-direction="-1" aria-label="${esc(item.name)} 수량 줄이기">−</button><input type="number" data-quantity="${i}" value="${item.quantity}" min="${item.step}" step="${item.step}" aria-label="${esc(item.name)} 장바구니 수량"><span>${esc(item.unit)}</span><button type="button" data-change="${i}" data-direction="1" aria-label="${esc(item.name)} 수량 늘리기">+</button></div><button type="button" class="shop-link shop-remove" data-remove="${i}" aria-label="${esc(item.name)} 삭제">삭제</button></div><strong class="shop-line-amount">${money(item.quantity * item.price / (item.isQty ? item.step : 1))}</strong>${item.isBite ? `<p class="shop-bite">${biteNotice}</p>` : ''}</div></article>`).join('') : '<div class="shop-empty"><strong>아직 장바구니가 비어 있어요</strong><p>마음에 드는 오이를 골라 담아주세요.</p></div>';
    function change(index, quantity) {
      const item = quote.items[index];
      if (!api.setQuantity(item.key, Math.round(quantity * 100) / 100)) { $('#shopError').textContent = `${item.step}${item.unit} 단위와 최대 주문 무게를 확인해 주세요. 일반 12kg / 한입 6kg / 혼합 9kg 제한입니다.`; render(); }
      else $('#shopError').textContent = '';
    }
    lines.querySelectorAll('[data-change]').forEach(b => b.onclick = () => { const i = Number(b.dataset.change); change(i, quote.items[i].quantity + Number(b.dataset.direction) * quote.items[i].step); });
    lines.querySelectorAll('[data-quantity]').forEach(input => input.onchange = () => change(Number(input.dataset.quantity), Number(input.value)));
    lines.querySelectorAll('[data-remove]').forEach(b => b.onclick = () => change(Number(b.dataset.remove), 0));
    $('#shopTotals').innerHTML = totals();
    $('#shopCheckoutSummary').innerHTML = `<h3>주문 상품 ${quote.items.length}종 · ${quote.orderType === 'delivery' ? '택배배송' : '직접픽업'}</h3><ul class="shop-review-items">${quote.items.map(item => `<li><span>${esc(item.name)} · ${item.quantity}${esc(item.unit)}</span><strong>${money(item.quantity * item.price / (item.isQty ? item.step : 1))}</strong></li>`).join('')}</ul>${totals()}`;
    let progress = `현재 ${Number((quote.totalUnits || 0).toFixed(2))}단위 · 무게 ${Number((quote.totalWeight || 0).toFixed(2))} / ${quote.maxLimit || 12}kg`;
    if (quote.discountRate >= 12) progress += ' · 최대 12% 할인 적용 중입니다.';
    else { const target = Math.max(2, Math.floor(quote.totalUnits || 0) + 1); const need = Number((target - (quote.totalUnits || 0)).toFixed(2)); progress += `\n${target}% 할인까지 ${need}단위가 더 필요합니다 (${need}kg 또는 ${Number((need * 10).toFixed(2))}개 상당). ${quote.canAddMore ? '판매 단위와 최대 주문 무게 안에서 추가할 수 있습니다.' : '현재 구성은 최대 주문 무게에 도달해 더 담을 수 없습니다.'}`; }
    $('#shopProgress').textContent = progress; $('#shopCheckout').disabled = !quote.items.length; finalNotice.hidden = !quote.hasBite;
    paymentNotice.textContent = quote.orderType === 'pickup' && quote.paymentMethod === 'onsite' ? '현장결제 주문입니다. 픽업 시 카드 및 고흥사랑상품권으로 결제할 수 있습니다.' : '계좌이체 주문입니다. 접수 후 안내된 계좌로 입금해 주세요. 실제 입금 확인 전에는 결제완료로 처리되지 않습니다.';
  }
  headerButton.onclick = openCart; document.getElementById('shopCartButton').onclick = openCart;
  document.getElementById('shopPolicyButton').onclick = openPolicy; $('#shopCartPolicy').onclick = openPolicy;
  $('#shopClose').onclick = closeDrawer; $('#shopContinue').onclick = closeDrawer; $('#shopBack').onclick = () => setStage('cart');
  $('#shopCheckout').onclick = () => { if (quote.items.length) { setStage('checkout'); document.getElementById('orderName').focus(); } };
  drawer.addEventListener('cancel', e => { e.preventDefault(); closeDrawer(); });
  drawer.addEventListener('click', e => { if (e.target === drawer && e.clientX < drawer.getBoundingClientRect().left) closeDrawer(); });
  const copyTemplate = async text => {
    const toast = document.getElementById('toast');
    try { await navigator.clipboard.writeText(text); toast.textContent = '주문양식이 복사되었습니다. 문자 또는 카카오톡에 붙여넣어 주세요.'; }
    catch { toast.textContent = '복사하지 못했습니다. 아래 주문양식을 직접 선택해 복사해 주세요.'; }
    toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 4000);
  };
  document.getElementById('shopCopyTemplate').onclick = () => copyTemplate(preview.textContent);
  document.addEventListener('minsook:cartchange', e => { quote = e.detail; render(); });
  document.addEventListener('minsook:submitting', e => { busy = e.detail; $('#shopClose').disabled = busy; $('#shopBack').disabled = busy; orderForm.querySelectorAll('input, select, button').forEach(el => el.disabled = busy); if (busy) formError.textContent = ''; });
  document.addEventListener('minsook:ordererror', () => { formError.textContent = '접수 완료를 확인하지 못했습니다. 중복 접수를 피하려면 창을 닫고 상단 주문조회에서 확인한 뒤 다시 시도해 주세요.'; });
  document.addEventListener('minsook:ordered', e => {
    const completedTemplate = e.detail.template.replace('※ 홈페이지의 [주문 접수하기] 버튼으로 접수해 주세요. 주문 접수는 결제완료가 아닙니다.', `※ 홈페이지 접수완료 (주문번호 #${e.detail.orderId}). 다시 접수하지 않으셔도 됩니다. 주문 접수는 결제완료가 아닙니다.`); setStage('success');
    const success = $('#shopSuccess');
    const account = e.detail.paymentAccount;
    const bankPanel = e.detail.paymentMethod === 'bank' && account ? `<section class="receipt-payment" aria-label="입금 안내"><h4>입금 안내</h4><dl><div><dt>은행</dt><dd>${esc(account.bankName)}</dd></div><div><dt>예금주</dt><dd>${esc(account.holder)}</dd></div><div class="receipt-amount"><dt>최종 입금금액</dt><dd>${money(e.detail.totalPrice)}</dd></div></dl><label for="receiptAccount">계좌번호</label><div class="receipt-account-row"><input id="receiptAccount" aria-label="입금 계좌번호" readonly value="${esc(account.accountNumber)}"><button type="button" class="shop-primary" id="receiptCopyAccount">계좌번호 복사</button></div><p id="receiptCopyStatus" role="status" aria-live="polite"></p><p class="shop-hint">할인과 배송비가 반영된 금액입니다. 입금 확인 후 주문이 처리됩니다.</p></section>` : '';
    success.innerHTML = `<div class="shop-success-mark">✓</div><h3>주문이 접수되었습니다</h3>${bankPanel}<p>주문번호 <strong>#${esc(e.detail.orderId)}</strong></p><p>${e.detail.paymentMethod === 'onsite' ? '픽업 시 현장에서 결제해 주세요. 카드 및 고흥사랑상품권 결제가 가능합니다.' : '안내된 계좌로 입금해 주세요. 입금 확인 후 주문이 처리됩니다.'}</p><p class="shop-hint">현재 상태는 ‘주문’이며 결제완료가 아닙니다. 주문내역은 상단 주문조회에서 확인할 수 있습니다.</p><button type="button" class="shop-primary shop-wide" id="shopSuccessClose">계속 쇼핑하기</button><button type="button" class="shop-secondary shop-wide" id="shopSuccessCopy">문자·카카오톡용 주문양식 복사</button><details class="shop-template"><summary>접수한 주문양식 보기</summary><pre>${esc(completedTemplate)}</pre></details>`;
    if (bankPanel) {
      const accountInput = success.querySelector('#receiptAccount');
      accountInput.onclick = () => accountInput.select();
      success.querySelector('#receiptCopyAccount').onclick = async () => {
        const feedback = success.querySelector('#receiptCopyStatus');
        try { await navigator.clipboard.writeText(account.accountNumber); feedback.textContent = '계좌번호가 복사되었습니다'; }
        catch { feedback.textContent = '복사하지 못했습니다. 계좌번호를 직접 선택한 뒤 복사해 주세요.'; accountInput.focus(); accountInput.select(); }
      };
    }
    success.querySelector('#shopSuccessClose').onclick = () => { api.startNewOrder(); closeDrawer(); }; success.querySelector('#shopSuccessCopy').onclick = () => copyTemplate(completedTemplate);
  });
  api.refresh();
});
