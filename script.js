// Minsook Farm Landing Page Interactivity

document.addEventListener('DOMContentLoaded', () => {
  // Global order final price state
  let currentFinalTotal = 0;

  // Order Type & Payment Method States
  let orderType = 'delivery'; // 'delivery' or 'pickup'
  let paymentMethod = 'bank'; // 'bank' or 'onsite'

  // Address Inputs Selection
  const orderName = document.getElementById('orderName');
  const orderPhone = document.getElementById('orderPhone');
  const orderPostcode = document.getElementById('orderPostcode');
  const orderAddress = document.getElementById('orderAddress');
  const orderAddressJibun = document.getElementById('orderAddressJibun');
  const orderAddressDetail = document.getElementById('orderAddressDetail');
  const orderMemo = document.getElementById('orderMemo');
  const btnSearchAddress = document.getElementById('btnSearchAddress');

  // Pick up & Delivery DOM Elements
  const btnTypeDelivery = document.getElementById('btnTypeDelivery');
  const btnTypePickup = document.getElementById('btnTypePickup');
  const deliverySection = document.getElementById('deliverySection');
  const pickupSection = document.getElementById('pickupSection');
  const pickupDate = document.getElementById('pickupDate');
  const pickupTime = document.getElementById('pickupTime');
  const btnPayBank = document.getElementById('btnPayBank');
  const btnPayOnsite = document.getElementById('btnPayOnsite');
  const bankAccountBox = document.querySelector('.bank-account-box');

  // --- Order Type & Payment Method Switchers ---
  if (btnTypeDelivery && btnTypePickup && deliverySection && pickupSection) {
    btnTypeDelivery.addEventListener('click', () => {
      orderType = 'delivery';
      btnTypeDelivery.classList.add('active');
      btnTypePickup.classList.remove('active');
      deliverySection.style.display = 'block';
      pickupSection.style.display = 'none';
      
      // Reset required properties
      if (orderPostcode) orderPostcode.required = true;
      if (orderAddress) orderAddress.required = true;
      if (orderAddressDetail) orderAddressDetail.required = true;
      if (pickupDate) pickupDate.required = false;
      if (pickupTime) pickupTime.required = false;

      // Always show bank copy box for delivery (delivery is bank only)
      if (bankAccountBox) bankAccountBox.style.display = 'flex';

      calculateOrder();
    });

    btnTypePickup.addEventListener('click', () => {
      orderType = 'pickup';
      btnTypePickup.classList.add('active');
      btnTypeDelivery.classList.remove('active');
      deliverySection.style.display = 'none';
      pickupSection.style.display = 'flex';

      // Reset required properties
      if (orderPostcode) orderPostcode.required = false;
      if (orderAddress) orderAddress.required = false;
      if (orderAddressDetail) orderAddressDetail.required = false;
      if (pickupDate) pickupDate.required = true;
      if (pickupTime) pickupTime.required = true;

      // Toggle bank account box based on pickup payment method
      if (bankAccountBox) {
        bankAccountBox.style.display = paymentMethod === 'bank' ? 'flex' : 'none';
      }

      calculateOrder();
    });
  }

  if (btnPayBank && btnPayOnsite) {
    btnPayBank.addEventListener('click', () => {
      paymentMethod = 'bank';
      btnPayBank.classList.add('active');
      btnPayOnsite.classList.remove('active');
      if (bankAccountBox) bankAccountBox.style.display = 'flex';
      calculateOrder();
    });

    btnPayOnsite.addEventListener('click', () => {
      paymentMethod = 'onsite';
      btnPayOnsite.classList.add('active');
      btnPayBank.classList.remove('active');
      if (bankAccountBox) bankAccountBox.style.display = 'none';
      calculateOrder();
    });
  }

  if (pickupDate) {
    pickupDate.addEventListener('input', () => {
      calculateOrder();
    });
  }
  if (pickupTime) {
    pickupTime.addEventListener('change', () => {
      calculateOrder();
    });
  }

  // --- Mobile Navigation ---
  const menuToggle = document.getElementById('menuToggle');
  const mainNav = document.getElementById('mainNav');

  if (menuToggle && mainNav) {
    menuToggle.addEventListener('click', () => {
      menuToggle.classList.toggle('open');
      mainNav.classList.toggle('open');
    });

    // Close menu when links are clicked
    mainNav.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        menuToggle.classList.remove('open');
        mainNav.classList.remove('open');
      });
    });
  }

  // --- Scroll Active Highlight & Header Class ---
  const header = document.querySelector('header');
  const sections = document.querySelectorAll('section, .hero');
  const navLinks = document.querySelectorAll('nav a');

  window.addEventListener('scroll', () => {
    // Header background fade
    if (window.scrollY > 50) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }

    // Active link highlight
    let current = '';
    sections.forEach(section => {
      const sectionTop = section.offsetTop;
      const sectionHeight = section.clientHeight;
      if (window.scrollY >= sectionTop - 120) {
        current = section.getAttribute('id') || '';
      }
    });

    navLinks.forEach(link => {
      link.classList.remove('active');
      if (link.getAttribute('href').slice(1) === current) {
        link.classList.add('active');
      }
    });
  });

  // --- Dropdown Cucumber Order Calculator ---

  // Price policies per grade
  const priceConfig = {
    special_kg: { name: '특품 오이 (무게)', desc: '1kg당 7,900원', price: 7900, isBite: false, isQty: false, unit: 'kg', step: 1, badgeClass: 'badge-special', badgeText: '최상급 선물용' },
    special_qty: { name: '특품 오이 (개수)', desc: '10개당 7,500원', price: 7500, isBite: false, isQty: true, unit: '개', step: 10, badgeClass: 'badge-special', badgeText: '최상급 선물용' },
    good_kg: { name: '상품 오이 (무게)', desc: '1kg당 5,900원', price: 5900, isBite: false, isQty: false, unit: 'kg', step: 1, badgeClass: 'badge-good', badgeText: '가정용 추천' },
    good_qty: { name: '상품 오이 (개수)', desc: '10개당 5,500원', price: 5500, isBite: false, isQty: true, unit: '개', step: 10, badgeClass: 'badge-good', badgeText: '가정용 추천' },
    value_kg: { name: '공품 오이 (못난이)', desc: '1kg당 3,900원', price: 3900, isBite: false, isQty: false, unit: 'kg', step: 1, badgeClass: 'badge-value', badgeText: '실속형 대용량' },
    bite_kg: { name: '한입 오이', desc: '500g 팩 2,900원', price: 5800, isBite: true, isQty: false, unit: 'kg', step: 0.5, badgeClass: 'badge-signature', badgeText: '농장 시그니처' }
  };

  // Current order state structure (basket)
  // format: { grade_key: quantity }
  // e.g., { special_kg: 2, bite_kg: 1.5, special_qty: 10 }
  const orderState = {};

  const productSelect = document.getElementById('productSelect');
  const btnAddProduct = document.getElementById('btnAddProduct');
  const selectedProductsList = document.getElementById('selectedProductsList');
  const weightBar = document.getElementById('weightBar');
  const limitWeightText = document.getElementById('limitWeightText');
  const limitAlert = document.getElementById('limitAlert');

  // Utility to format weight values nicely (.0 decimal is stripped)
  function formatWeight(w) {
    if (w % 1 === 0) {
      return w.toFixed(0);
    }
    return w.toFixed(1);
  }

  // Helper to extract weights (A = Hanib, B = Other) from state
  function getWeights(stateObj) {
    let A = stateObj['bite_kg'] || 0;
    let B = 0;
    for (const key in stateObj) {
      if (key === 'bite_kg') continue;
      const qty = stateObj[key] || 0;
      if (priceConfig[key].isQty) {
        B += qty * 0.18; // 1 cucumber = 180g = 0.18kg
      } else {
        B += qty;
      }
    }
    return { A, B };
  }

  // Validation function: Returns true if the state meets all requirements
  function isValidState(stateObj) {
    const { A, B } = getWeights(stateObj);
    
    // Both A (Hanib) and B (Other) present
    if (A > 0 && B > 0) {
      // Hanib itself is capped at 6kg due to volume limits
      if (A > 6.001) return false;
      // Combined total weight capped at 9kg
      return (A + B) <= 9.001;
    }
    
    // Only Hanib present
    if (A > 0 && B === 0) {
      return A <= 6.001;
    }
    
    // Only Other present
    if (A === 0 && B > 0) {
      return B <= 12.001;
    }
    
    return true;
  }

  // Returns capped quantity for a grade based on limits
  function getCappedQuantity(grade, desiredQty) {
    if (desiredQty <= 0) return 0;

    const stateCopy = { ...orderState };
    stateCopy[grade] = desiredQty;

    if (isValidState(stateCopy)) {
      return desiredQty;
    }

    // Loop backwards to find the maximum allowed value
    const config = priceConfig[grade];
    let tempQty = desiredQty;
    const step = config.step;

    while (tempQty > 0) {
      tempQty = Math.round((tempQty - step) * 100) / 100;
      if (tempQty <= 0) break;
      stateCopy[grade] = tempQty;
      if (isValidState(stateCopy)) {
        return tempQty;
      }
    }

    return 0;
  }

  // Calculate total weight of currently selected items in the actual state
  function getTotalWeight() {
    const { A, B } = getWeights(orderState);
    return A + B;
  }

  // Trigger alert UI animation when hitting limits
  function triggerLimitAlert() {
    if (limitAlert) {
      limitAlert.style.display = 'block';
      limitAlert.classList.remove('shake-active');
      void limitAlert.offsetWidth; // Force reflow
      limitAlert.classList.add('shake-active');
      setTimeout(() => {
        limitAlert.style.display = 'none';
      }, 4000);
    }
  }

  // Add product from dropdown to state
  if (btnAddProduct && productSelect) {
    btnAddProduct.addEventListener('click', () => {
      const selectedGrade = productSelect.value;
      if (!selectedGrade) {
        showToast('구매하실 오이 종류를 선택 후 추가하기를 눌러주세요!');
        return;
      }

      const config = priceConfig[selectedGrade];
      const defaultStep = config.step;

      const potentialVal = (orderState[selectedGrade] || 0) + defaultStep;
      const cappedVal = getCappedQuantity(selectedGrade, potentialVal);

      if (cappedVal <= (orderState[selectedGrade] || 0)) {
        showToast('⚠️ 최대 주문 무게/수량 제한 조건으로 인해 상품을 더 추가할 수 없습니다.');
        triggerLimitAlert();
        return;
      }

      orderState[selectedGrade] = cappedVal;
      showToast(`🥒 ${config.name} ${cappedVal}${config.unit}이 추가되었습니다.`);
      productSelect.selectedIndex = 0; // Reset select dropdown
      
      renderBasket();
      calculateOrder();
    });
  }

  // Render selected items list in the basket
  function renderBasket() {
    if (!selectedProductsList) return;

    const grades = Object.keys(orderState);
    if (grades.length === 0) {
      selectedProductsList.innerHTML = `<div class="empty-basket-msg">선택된 상품이 없습니다. 위에서 상품을 추가해주세요.</div>`;
      return;
    }

    selectedProductsList.innerHTML = '';
    
    grades.forEach((grade, idx) => {
      const qty = orderState[grade];
      const config = priceConfig[grade];

      const itemDiv = document.createElement('div');
      itemDiv.className = 'selected-product-item';
      itemDiv.dataset.grade = grade;
      
      itemDiv.innerHTML = `
        <div class="item-info">
          <div class="item-title-row">
            <span class="product-badge ${config.badgeClass}">${config.badgeText}</span>
            <h4>${idx + 1}. ${config.name}</h4>
          </div>
          <p class="item-price-desc">${config.desc}</p>
        </div>
        <div class="item-controls">
          <div class="qty-control-mini">
            <button type="button" class="qty-btn-mini minus-btn" data-grade="${grade}">-</button>
            <input type="number" class="qty-input-mini" value="${qty}" min="0" step="${config.step}" data-grade="${grade}">
            <span class="qty-unit-mini">${config.unit}</span>
            <button type="button" class="qty-btn-mini plus-btn" data-grade="${grade}">+</button>
          </div>
          <button type="button" class="btn-remove-item" data-grade="${grade}" title="삭제">&times;</button>
        </div>
      `;

      // Bind events to inside elements
      const minusBtn = itemDiv.querySelector('.minus-btn');
      const plusBtn = itemDiv.querySelector('.plus-btn');
      const inputField = itemDiv.querySelector('.qty-input-mini');
      const removeBtn = itemDiv.querySelector('.btn-remove-item');

      minusBtn.addEventListener('click', () => {
        const targetVal = Math.round((orderState[grade] - config.step) * 100) / 100;
        if (targetVal <= 0) {
          delete orderState[grade];
        } else {
          orderState[grade] = targetVal;
        }
        renderBasket();
        calculateOrder();
      });

      plusBtn.addEventListener('click', () => {
        const potentialVal = Math.round((orderState[grade] + config.step) * 100) / 100;
        const cappedVal = getCappedQuantity(grade, potentialVal);

        if (cappedVal < potentialVal) {
          showToast('⚠️ 최대 주문 무게/수량 제한에 도달했습니다.');
          triggerLimitAlert();
          return;
        }

        orderState[grade] = cappedVal;
        renderBasket();
        calculateOrder();
        triggerBounce(inputField);
      });

      inputField.addEventListener('change', (e) => {
        let val = parseFloat(e.target.value);
        if (isNaN(val) || val <= 0) {
          delete orderState[grade];
          renderBasket();
          calculateOrder();
          return;
        }

        // Apply rounding guidelines
        if (config.isQty) {
          val = Math.round(val / 10) * 10; // snap to 10 pieces
        } else if (config.isBite) {
          val = Math.round(val * 2) / 2; // snap to 0.5kg
        } else {
          val = Math.round(val); // snap to 1kg integer
        }

        const cappedVal = getCappedQuantity(grade, val);
        if (cappedVal < val) {
          if (cappedVal <= 0) {
            delete orderState[grade];
            showToast('⚠️ 무게/수량 제한 조건을 초과하여 품목을 담을 수 없습니다.');
          } else {
            orderState[grade] = cappedVal;
            showToast(`⚠️ 최대 무게/수량 제한 조건으로 인해 ${cappedVal}${config.unit}으로 자동 조절되었습니다.`);
          }
          triggerLimitAlert();
        } else {
          orderState[grade] = val;
        }

        renderBasket();
        calculateOrder();
      });

      removeBtn.addEventListener('click', () => {
        delete orderState[grade];
        renderBasket();
        calculateOrder();
      });

      selectedProductsList.appendChild(itemDiv);
    });
  }

  // Update UI calculations and progress bars
  function calculateOrder() {
    const { A, B } = getWeights(orderState);
    const totalWeight = A + B;
    let totalOriginalPrice = 0;
    const activeGradesList = [];

    for (const g in orderState) {
      const qty = orderState[g];
      if (qty > 0) {
        activeGradesList.push(g);
        if (priceConfig[g].isQty) {
          totalOriginalPrice += (qty / 10) * priceConfig[g].price;
        } else {
          totalOriginalPrice += qty * priceConfig[g].price;
        }
      }
    }

    // Update Weight Progress Bar (relative to maxLimit)
    let maxLimit = 12.0;
    if (A > 0 && B > 0) {
      maxLimit = 9.0;
    } else if (A > 0 && B === 0) {
      maxLimit = 6.0;
    }

    if (weightBar) {
      const weightPercentage = Math.min(100, (totalWeight / maxLimit) * 100);
      weightBar.style.width = weightPercentage + '%';
      setBarColor(weightBar, weightPercentage);
    }

    if (limitWeightText) {
      limitWeightText.textContent = `${formatWeight(totalWeight)} kg / ${formatWeight(maxLimit)} kg`;
    }

    // Cumulative discount rate: Math.floor(totalWeight)%, maximum 12%
    const discountRate = Math.min(12, Math.floor(totalWeight));
    const discountAmount = Math.round(totalOriginalPrice * (discountRate / 100));

    // Shipping fee is 4,000 KRW if delivery, 0 if pickup
    const shipping = (orderType === 'delivery' && totalOriginalPrice > 0) ? 4000 : 0;
    const finalTotal = totalOriginalPrice - discountAmount + shipping;
    currentFinalTotal = finalTotal; // save to DOMContentLoaded scope

    // Update summary panels
    const calcGradeSpan = document.getElementById('calcGrade');
    const calcQtySpan = document.getElementById('calcQty');
    const calcPriceSpan = document.getElementById('calcPrice');
    const calcDiscountSpan = document.getElementById('calcDiscount');
    const calcShippingSpan = document.getElementById('calcShipping');
    const calcTotalSpan = document.getElementById('calcTotal');

    if (calcGradeSpan) {
      if (activeGradesList.length === 0) {
        calcGradeSpan.innerHTML = '선택된 등급 없음';
      } else {
        calcGradeSpan.innerHTML = activeGradesList.map((g, idx) => `${idx + 1}. ${priceConfig[g].name}`).join('<br>');
      }
    }
    if (calcQtySpan) {
      calcQtySpan.textContent = `${formatWeight(totalWeight)} kg`;
    }
    if (calcPriceSpan) {
      calcPriceSpan.textContent = `${totalOriginalPrice.toLocaleString()}원`;
    }
    if (calcDiscountSpan) {
      calcDiscountSpan.textContent = `-${discountRate}% (-${discountAmount.toLocaleString()}원)`;
    }
    if (calcShippingSpan) {
      calcShippingSpan.textContent = `${shipping.toLocaleString()}원`;
    }
    if (calcTotalSpan) {
      calcTotalSpan.textContent = `${finalTotal.toLocaleString()}원`;
    }

    updateSMSPreview(totalOriginalPrice, discountRate, discountAmount, shipping, finalTotal);
  }

  function setBarColor(barElement, percentage) {
    if (percentage >= 90) {
      barElement.style.backgroundColor = '#ef4444'; // Red
    } else if (percentage >= 70) {
      barElement.style.backgroundColor = '#f97316'; // Orange
    } else {
      barElement.style.backgroundColor = 'var(--primary)'; // Green
    }
  }

  // --- KakaoTalk Template Preview Generator ---
  function updateSMSPreview(origPrice = 0, discRate = 0, discAmount = 0, shipFee = 0, finalTotal = 0) {
    const previewBox = document.getElementById('smsPreview');
    if (!previewBox) return;

    const name = (orderName && orderName.value) ? orderName.value.trim() : '홍길동';
    const phone = (orderPhone && orderPhone.value) ? orderPhone.value.trim() : '010-0000-0000';
    
    let itemsText = '';
    let itemIndex = 1;
    for (const g in orderState) {
      const qty = orderState[g];
      if (qty > 0) {
        const config = priceConfig[g];
        let itemPrice = 0;
        if (config.isQty) {
          itemPrice = (qty / 10) * config.price;
        } else {
          itemPrice = qty * config.price;
        }
        
        if (config.isQty) {
          itemsText += ` ${itemIndex}. ${config.name}: ${qty}${config.unit} (환산 무게: ${formatWeight(qty * 0.18)}kg, ${itemPrice.toLocaleString()}원)\n`;
        } else {
          itemsText += ` ${itemIndex}. ${config.name}: ${formatWeight(qty)}${config.unit} (${itemPrice.toLocaleString()}원)\n`;
        }
        itemIndex++;
      }
    }

    if (!itemsText) {
      itemsText = ' - 선택된 오이가 없습니다. 계산기에서 수량을 추가해 주세요.\n';
    }

    let template = '';

    if (orderType === 'delivery') {
      let address = '서울특별시 강남구 ...';
      const postcodeVal = (orderPostcode && orderPostcode.value) ? orderPostcode.value.trim() : '';
      const addressVal = (orderAddress && orderAddress.value) ? orderAddress.value.trim() : '';
      const detailVal = (orderAddressDetail && orderAddressDetail.value) ? orderAddressDetail.value.trim() : '';
      
      if (addressVal) {
        address = postcodeVal ? `[${postcodeVal}]` : '';
        address += `\n   - 도로명: ${addressVal}`;
        if (detailVal) address += ` ${detailVal}`;
      }
      
      const memo = (orderMemo && orderMemo.value) ? orderMemo.value.trim() : '선택 없음';

      template = `[민숙농장 오이 직거래 주문 신청]
■ 주문자명: ${name}
■ 연락처: ${phone}
■ 주문 상품 내역:
${itemsText}■ 배송지 주소: ${address}
■ 상품 금액 합계: ${origPrice.toLocaleString()}원
■ 추가 할인: -${discRate}% (-${discAmount.toLocaleString()}원)
■ 배송비: ${shipFee.toLocaleString()}원
■ 총 입금 예정 금액: ${finalTotal.toLocaleString()}원
■ 입금 계좌: 농협 312-0219-8388-41 최정민(민숙농장)
■ 배송 메모: ${memo}

※ [카카오톡으로 주문서 전송하기] 버튼을 누르시면 주문이 접수되며, 카카오톡 채널로 이동하여 입금 확인 즉시 배송이 시작됩니다.`;
    } else {
      const pickupDateVal = (pickupDate && pickupDate.value) ? pickupDate.value : '날짜 선택 안됨';
      const pickupTimeVal = (pickupTime && pickupTime.value) ? pickupTime.value : '시간 선택 안됨';
      const paymentText = paymentMethod === 'bank' ? '계좌이체 (농협 312-0219-8388-41 최정민/민숙농장)' : '현장결제 (카드 또는 현금)';

      template = `[민숙농장 오이 직거래 픽업 주문 신청]
■ 주문자명: ${name}
■ 연락처: ${phone}
■ 주문 상품 내역:
${itemsText}■ 픽업 일시: ${pickupDateVal} ${pickupTimeVal}
■ 상품 금액 합계: ${origPrice.toLocaleString()}원
■ 추가 할인: -${discRate}% (-${discAmount.toLocaleString()}원)
■ 배송비: 0원 (직접 픽업)
■ 총 결제 예정 금액: ${finalTotal.toLocaleString()}원
■ 결제 방식: ${paymentText}

※ [카카오톡으로 주문서 전송하기] 버튼을 누르시면 주문이 접수되며, 카카오톡 채널로 이동하여 픽업 일정 확인 및 조율을 진행합니다.`;
    }

    previewBox.textContent = template;
  }

  // Bounce animation utility
  function triggerBounce(el) {
    if (!el) return;
    el.classList.remove('bounce-active');
    void el.offsetWidth; // force layout
    el.classList.add('bounce-active');
    setTimeout(() => {
      el.classList.remove('bounce-active');
    }, 400);
  }

  // --- KakaoTalk ID and Bank Info Copy Listeners ---
  const btnCopyBank = document.getElementById('btnCopyBank');
  if (btnCopyBank) {
    btnCopyBank.addEventListener('click', () => {
      navigator.clipboard.writeText('농협 312-0219-8388-41 최정민(민숙농장)').then(() => {
        showToast('📋 농협 계좌번호가 복사되었습니다!');
      }).catch(err => {
        console.error('계좌 복사 실패:', err);
        showToast('계좌번호 복사에 실패했습니다.');
      });
    });
  }

  const btnCopyKakaoId = document.getElementById('btnCopyKakaoId');
  if (btnCopyKakaoId) {
    btnCopyKakaoId.addEventListener('click', () => {
      window.open('http://pf.kakao.com/_lWxfPX', '_blank');
    });
  }

  // --- Modal Dialog Elements ---
  const kakaoModal = document.getElementById('kakaoModal');
  const btnKakaoModalClose = document.getElementById('btnKakaoModalClose');
  const btnKakaoModalCloseLarge = document.getElementById('btnKakaoModalCloseLarge');
  const kakaoModalOverlay = document.getElementById('kakaoModalOverlay');
  const btnOpenKakaoTalk = document.getElementById('btnOpenKakaoTalk');

  function openKakaoModal() {
    if (kakaoModal) {
      kakaoModal.classList.remove('hidden');
      document.body.style.overflow = 'hidden'; // Lock body scroll
    }
  }

  function closeKakaoModal() {
    if (kakaoModal) {
      kakaoModal.classList.add('hidden');
      document.body.style.overflow = ''; // Restore body scroll
    }
  }

  if (btnKakaoModalClose) btnKakaoModalClose.addEventListener('click', closeKakaoModal);
  if (btnKakaoModalCloseLarge) btnKakaoModalCloseLarge.addEventListener('click', closeKakaoModal);
  if (kakaoModalOverlay) kakaoModalOverlay.addEventListener('click', closeKakaoModal);

  if (btnOpenKakaoTalk) {
    btnOpenKakaoTalk.addEventListener('click', () => {
      // Try launching KakaoTalk client (mobile deep link)
      window.location.href = 'kakaolink://';
      
      // Fallback fallback delay to search help or qr addition page
      setTimeout(() => {
        window.open('http://qr.kakao.com/talk/p/free592@naver.com', '_blank');
      }, 1200);
    });
  }

  // --- Daum Postcode Integration ---
  if (btnSearchAddress) {
    btnSearchAddress.addEventListener('click', () => {
      // Local static file:// protocol fallback to bypass browser security origin blocks
      if (window.location.protocol === 'file:') {
        openMockPostcodeModal();
        return;
      }

      new daum.Postcode({
        oncomplete: function(data) {
          try {
            if (orderPostcode) orderPostcode.value = data.zonecode || '';
            
            let roadAddr = data.roadAddress || '';
            let jibunAddr = data.jibunAddress || '';
            
            // Apply fallbacks for new or special addresses
            if (!jibunAddr && data.autoJibunAddress) {
              jibunAddr = data.autoJibunAddress;
            }
            if (!jibunAddr) {
              jibunAddr = data.address || '';
            }
            if (!roadAddr && data.autoRoadAddress) {
              roadAddr = data.autoRoadAddress;
            }
            if (!roadAddr) {
              roadAddr = data.address || '';
            }
            
            if (orderAddress) orderAddress.value = roadAddr;
            if (orderAddressJibun) orderAddressJibun.value = jibunAddr;
            
            if (orderAddressDetail) {
              orderAddressDetail.focus();
            }
            
            calculateOrder();
          } catch (e) {
            console.error('Error in oncomplete:', e);
          }
        }
      }).open();
    });
  }

  // --- Mock Postcode Modal Simulator for file:// ---
  function openMockPostcodeModal() {
    // Check if style tag is already injected
    if (!document.getElementById('mockPostcodeStyles')) {
      const style = document.createElement('style');
      style.id = 'mockPostcodeStyles';
      style.textContent = `
        .mock-postcode-modal {
          position: fixed;
          top: 0; left: 0; width: 100%; height: 100%;
          background: rgba(0, 0, 0, 0.6);
          display: flex; justify-content: center; align-items: center;
          z-index: 10000;
        }
        .mock-postcode-content {
          background: #ffffff; width: 90%; max-width: 460px;
          border-radius: 8px; overflow: hidden;
          box-shadow: 0 10px 25px rgba(0,0,0,0.3);
          font-family: -apple-system, BlinkMacSystemFont, "Malgun Gothic", sans-serif;
          animation: mockSlideUp 0.25s ease-out;
        }
        @keyframes mockSlideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .mock-postcode-header {
          background: var(--primary, #22c55e); color: #ffffff;
          padding: 16px; font-weight: bold;
          display: flex; justify-content: space-between; align-items: center;
        }
        .mock-postcode-close {
          background: none; border: none; color: #ffffff;
          font-size: 1.5rem; cursor: pointer; padding: 0 4px;
        }
        .mock-postcode-body {
          padding: 20px;
        }
        .mock-search-box {
          display: flex; gap: 8px; margin-bottom: 16px;
        }
        .mock-search-input {
          flex: 1; padding: 10px; border: 1px solid #d1d5db;
          border-radius: 4px; font-size: 0.9rem; outline: none;
        }
        .mock-search-input:focus {
          border-color: var(--primary, #22c55e);
        }
        .mock-search-btn {
          padding: 10px 16px; background: #374151; color: white;
          border: none; border-radius: 4px; cursor: pointer; font-size: 0.9rem;
        }
        .mock-results-list {
          max-height: 240px; overflow-y: auto;
          border: 1px solid #e5e7eb; border-radius: 4px;
        }
        .mock-result-item {
          padding: 12px; border-bottom: 1px solid #f3f4f6;
          cursor: pointer; transition: background 0.15s;
        }
        .mock-result-item:hover {
          background: #f3f4f6;
        }
        .mock-result-item strong {
          display: block; font-size: 0.92rem; color: #111827; margin-bottom: 4px;
        }
        .mock-result-item span {
          display: block; font-size: 0.82rem; color: #6b7280; line-height: 1.4;
        }
      `;
      document.head.appendChild(style);
    }

    const defaultSamples = [
      { postcode: '59642', road: '전라남도 고흥군 도양읍 우주항공로 10', jibun: '전라남도 고흥군 도양읍 봉암리 200-1' },
      { postcode: '06138', road: '서울특별시 강남구 테헤란로 1', jibun: '서울특별시 강남구 역삼동 825-24' },
      { postcode: '48301', road: '부산광역시 수영구 광안해변로 219', jibun: '부산광역시 수영구 광안동 193-1' },
      { postcode: '63535', road: '제주특별자치도 제주시 첨단로 242', jibun: '제주특별자치도 제주시 영평동 2181' }
    ];

    const modal = document.createElement('div');
    modal.className = 'mock-postcode-modal';
    modal.id = 'mockPostcodeModal';
    modal.innerHTML = `
      <div class="mock-postcode-content">
        <div class="mock-postcode-header">
          <span>🔍 주소 검색 시뮬레이터 (로컬 파일 모드)</span>
          <button type="button" class="mock-postcode-close" id="mockPostcodeClose">&times;</button>
        </div>
        <div class="mock-postcode-body">
          <p style="font-size: 0.82rem; color: #6b7280; margin-bottom: 12px; line-height: 1.4;">
            ※ 로컬 HTML 파일 실행 시 발생하는 브라우저 보안 제약(Origin Null)을 우회하기 위한 주소 시뮬레이터입니다. 아래 주소를 클릭하시거나 검색어를 직접 입력 후 검색해 주세요.
          </p>
          <div class="mock-search-box">
            <input type="text" class="mock-search-input" id="mockSearchInput" placeholder="도로명 또는 지명 검색 (예: 테헤란로, 고흥)">
            <button type="button" class="mock-search-btn" id="mockSearchBtn">검색</button>
          </div>
          <div class="mock-results-list" id="mockResultsList"></div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    const resultsList = document.getElementById('mockResultsList');
    const searchInput = document.getElementById('mockSearchInput');
    const searchBtn = document.getElementById('mockSearchBtn');
    const closeBtn = document.getElementById('mockPostcodeClose');

    // Function to render items
    function renderItems(items) {
      resultsList.innerHTML = '';
      items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'mock-result-item';
        div.innerHTML = `
          <strong>[${item.postcode}]</strong>
          <span>도로명: ${item.road}</span>
          <span>지번: ${item.jibun}</span>
        `;
        div.addEventListener('click', () => {
          // Fill values in main page
          if (orderPostcode) orderPostcode.value = item.postcode;
          if (orderAddress) orderAddress.value = item.road;
          if (orderAddressJibun) orderAddressJibun.value = item.jibun;
          
          closeModal();
          if (orderAddressDetail) {
            orderAddressDetail.focus();
          }
          calculateOrder();
          showToast('📌 선택한 주소가 주소창에 성공적으로 입력되었습니다!');
        });
        resultsList.appendChild(div);
      });
    }

    function doSearch() {
      const q = searchInput.value.trim();
      if (!q) {
        renderItems(defaultSamples);
        return;
      }
      
      // Dynamic simulated address generation
      const dynamicResults = [
        { postcode: '12345', road: `${q} 오이로 100`, jibun: `${q} 아삭동 50` },
        { postcode: '54321', road: `${q} 농장길 25`, jibun: `${q} 푸른리 99` }
      ];
      renderItems(dynamicResults);
    }

    // Bind event listeners
    searchBtn.addEventListener('click', doSearch);
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doSearch();
    });

    function closeModal() {
      modal.remove();
      document.body.style.overflow = '';
    }

    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    // Initial render
    renderItems(defaultSamples);
  }

  // --- KakaoTalk Action / Copy Button click ---
  const btnSendSms = document.getElementById('btnSendSms');
  if (btnSendSms) {
    btnSendSms.addEventListener('click', () => {
      // 1. Simple Form Validation
      const nameVal = orderName.value.trim();
      const phoneVal = orderPhone.value.trim();

      if (!nameVal || !phoneVal) {
        showToast('주문자명과 연락처를 입력해주세요!');
        return;
      }

      let combinedAddress = '';
      let memoVal = '';

      if (orderType === 'delivery') {
        const addressVal = orderAddress.value.trim();
        const detailVal = orderAddressDetail.value.trim();
        if (!addressVal || !detailVal) {
          showToast('배송지 주소(상세주소 포함)를 모두 입력해주세요!');
          return;
        }

        const addressJibunVal = orderAddressJibun ? orderAddressJibun.value.trim() : '';
        const postcodeVal = orderPostcode ? orderPostcode.value.trim() : '';
        combinedAddress = postcodeVal ? `[${postcodeVal}] 도로명: ${addressVal} ${detailVal} / 지번: ${addressJibunVal} ${detailVal}` : `도로명: ${addressVal} ${detailVal} / 지번: ${addressJibunVal} ${detailVal}`;
        memoVal = orderMemo ? orderMemo.value.trim() : '';
        if (!memoVal) memoVal = '선택 없음';
      } else {
        const pickupDateVal = pickupDate.value;
        const pickupTimeVal = pickupTime.value;
        if (!pickupDateVal || !pickupTimeVal) {
          showToast('픽업 날짜와 시간을 모두 선택해주세요!');
          return;
        }
        combinedAddress = `[직접 픽업] 날짜: ${pickupDateVal} / 시간: ${pickupTimeVal}`;
        memoVal = `픽업 주문 (결제방식: ${paymentMethod === 'bank' ? '계좌이체' : '현장결제'})`;
      }

      // Check if any items are actually selected
      let totalQty = 0;
      const orderedItems = [];
      for (const g in orderState) {
        const qty = orderState[g];
        totalQty += qty;
        if (qty > 0) {
          orderedItems.push({
            grade: g,
            name: priceConfig[g].name,
            quantity: qty,
            unit: priceConfig[g].unit
          });
        }
      }
      if (totalQty === 0) {
        showToast('주문할 오이 수량을 최소 1개 이상 설정해 주세요!');
        return;
      }

      // Clipboard Copy logic
      const previewBox = document.getElementById('smsPreview');
      const templateText = previewBox ? previewBox.textContent : '';

      navigator.clipboard.writeText(templateText).then(() => {
        showToast('📋 주문서가 클립보드에 자동 복사되었습니다!');
        
        const submitOrderData = () => {
          if (window.location.protocol === 'file:') {
            const localOrders = JSON.parse(localStorage.getItem('minsook_orders') || '[]');
            const newOrder = {
              id: localOrders.length + 1,
              name: nameVal,
              phone: phoneVal,
              address: combinedAddress,
              memo: memoVal,
              items: orderedItems,
              total_price: currentFinalTotal,
              status: '주문',
              created_at: new Date().toISOString()
            };
            localOrders.push(newOrder);
            localStorage.setItem('minsook_orders', JSON.stringify(localOrders));
            
            setTimeout(openKakaoModal, 500);
            return;
          }

          fetch('/api/orders', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: nameVal,
              phone: phoneVal,
              address: combinedAddress,
              memo: memoVal,
              items: orderedItems,
              totalPrice: currentFinalTotal
            })
          }).then(res => {
            if (!res.ok) console.error('서버 주문 저장 실패');
          }).catch(err => {
            console.error('주문 데이터 전송 오류:', err);
          }).finally(() => {
            setTimeout(openKakaoModal, 500);
          });
        };

        submitOrderData();
      }).catch(err => {
        console.error('클립보드 복사 실패:', err);
        showToast('클립보드 복사에 실패했습니다. 주문서를 직접 복사해 주세요.');
        setTimeout(openKakaoModal, 500);
      });
    });
  }

  // --- Initial Setup and Bind SMS Sync ---
  const smsInputs = [orderName, orderPhone, orderAddressDetail, orderMemo, orderAddressJibun];
  smsInputs.forEach(input => {
    if (input) {
      input.addEventListener('input', () => {
        calculateOrder();
      });
    }
  });

  // Fetch prices from DB and update configuration & page display
  async function fetchPricesAndInit() {
    if (window.location.protocol === 'file:') {
      const localPrices = JSON.parse(localStorage.getItem('minsook_prices') || '{}');
      applyPrices(localPrices);
      calculateOrder();
      return;
    }

    try {
      const res = await fetch('/api/prices');
      if (res.ok) {
        const data = await res.json();
        applyPrices(data.prices || {});
      } else {
        const localPrices = JSON.parse(localStorage.getItem('minsook_prices') || '{}');
        applyPrices(localPrices);
      }
    } catch (err) {
      console.error('Failed to fetch dynamic prices:', err);
      const localPrices = JSON.parse(localStorage.getItem('minsook_prices') || '{}');
      applyPrices(localPrices);
    } finally {
      // Always perform initial calculations
      calculateOrder();
    }
  }

  function applyPrices(prices) {
    if (prices.price_special_kg) {
      priceConfig.special_kg.price = prices.price_special_kg;
      priceConfig.special_kg.desc = `1kg당 ${prices.price_special_kg.toLocaleString()}원`;
      const el = document.getElementById('display-price-special-kg');
      if (el) el.textContent = prices.price_special_kg.toLocaleString();
    }
    if (prices.price_special_qty) {
      priceConfig.special_qty.price = prices.price_special_qty;
      priceConfig.special_qty.desc = `10개당 ${prices.price_special_qty.toLocaleString()}원`;
    }
    if (prices.price_good_kg) {
      priceConfig.good_kg.price = prices.price_good_kg;
      priceConfig.good_kg.desc = `1kg당 ${prices.price_good_kg.toLocaleString()}원`;
      const el = document.getElementById('display-price-good-kg');
      if (el) el.textContent = prices.price_good_kg.toLocaleString();
    }
    if (prices.price_good_qty) {
      priceConfig.good_qty.price = prices.price_good_qty;
      priceConfig.good_qty.desc = `10개당 ${prices.price_good_qty.toLocaleString()}원`;
    }
    if (prices.price_value_kg) {
      priceConfig.value_kg.price = prices.price_value_kg;
      priceConfig.value_kg.desc = `1kg당 ${prices.price_value_kg.toLocaleString()}원`;
      const el = document.getElementById('display-price-value-kg');
      if (el) el.textContent = prices.price_value_kg.toLocaleString();
    }
    if (prices.price_bite_kg) {
      priceConfig.bite_kg.price = prices.price_bite_kg * 2;
      priceConfig.bite_kg.desc = `500g 팩 ${prices.price_bite_kg.toLocaleString()}원`;
      
      const elPack = document.getElementById('display-price-bite-pack');
      if (elPack) elPack.textContent = prices.price_bite_kg.toLocaleString();
      
      const elKg = document.getElementById('display-price-bite-kg');
      if (elKg) elKg.textContent = (prices.price_bite_kg * 2).toLocaleString();
    }
    updateSelectOptions();
  }

  function updateSelectOptions() {
    const select = document.getElementById('productSelect');
    if (!select) return;

    const options = select.options;
    if (options[1]) options[1].textContent = `특품 오이 (무게 단위 - 1kg당 ${priceConfig.special_kg.price.toLocaleString()}원)`;
    if (options[2]) options[2].textContent = `특품 오이 (개수 단위 - 10개당 ${priceConfig.special_qty.price.toLocaleString()}원)`;
    if (options[3]) options[3].textContent = `상품 오이 (무게 단위 - 1kg당 ${priceConfig.good_kg.price.toLocaleString()}원)`;
    if (options[4]) options[4].textContent = `상품 오이 (개수 단위 - 10개당 ${priceConfig.good_qty.price.toLocaleString()}원)`;
    if (options[5]) options[5].textContent = `공품 오이 (못난이) (무게 단위 - 1kg당 ${priceConfig.value_kg.price.toLocaleString()}원)`;
    
    const packPrice = priceConfig.bite_kg.price / 2;
    if (options[6]) options[6].textContent = `한입 오이 (무게 단위 - 500g 팩 ${packPrice.toLocaleString()}원)`;
  }

  // Init dynamic prices and calculations
  fetchPricesAndInit();

  // --- Toast Message Helper ---

  function showToast(message) {
    const toast = document.getElementById('toast');
    if (toast) {
      toast.textContent = message;
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.remove('show');
      }, 3500);
    }
  }

  // --- Testimonial Slider ---
  const track = document.getElementById('testimonialTrack');
  const slides = document.querySelectorAll('.testimonial-slide');
  const prevBtn = document.getElementById('prevSlide');
  const nextBtn = document.getElementById('nextSlide');
  
  if (track && slides.length > 0) {
    let index = 0;

    function updateSlider() {
      track.style.transform = `translateX(-${index * 100}%)`;
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        index = (index + 1) % slides.length;
        updateSlider();
      });
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        index = (index - 1 + slides.length) % slides.length;
        updateSlider();
      });
    }

    // Auto slide every 6 seconds
    setInterval(() => {
      index = (index + 1) % slides.length;
      updateSlider();
    }, 6000);
  }

  // --- FAQ Accordion ---
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach(item => {
    const question = item.querySelector('.faq-question');
    if (question) {
      question.addEventListener('click', () => {
        const isActive = item.classList.contains('active');
        
        // Close all items
        faqItems.forEach(i => i.classList.remove('active'));
        
        // Toggle current item
        if (!isActive) {
          item.classList.add('active');
        }
      });
    }
  });

  // Initialize SMS preview content
  updateSMSPreview();

  // Initialize Product Image Sliders
  initSliders();

  function initSliders() {
    const sliders = document.querySelectorAll('.product-card-img-slider');
    sliders.forEach(slider => {
      if (slider.dataset.sliderInitialized) return;
      slider.dataset.sliderInitialized = 'true';

      const slides = slider.querySelectorAll('.product-slide');
      const dots = slider.querySelectorAll('.dot');
      if (slides.length <= 1) return;

      let currentIndex = 0;
      setInterval(() => {
        slides[currentIndex].classList.remove('active');
        if (dots[currentIndex]) dots[currentIndex].classList.remove('active');
        
        currentIndex = (currentIndex + 1) % slides.length;
        
        slides[currentIndex].classList.add('active');
        if (dots[currentIndex]) dots[currentIndex].classList.add('active');
      }, 2000);
    });
  }

});

