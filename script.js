document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener('click', (event) => {
    const target = document.querySelector(link.getAttribute('href'));
    if (target) {
      event.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

const galleryCarousel = document.querySelector('[data-gallery-carousel]');
if (galleryCarousel) {
  const galleryTrack = galleryCarousel.querySelector('#gallery-track');
  const gallerySlides = [...galleryCarousel.querySelectorAll('.gallery-slide')];
  const galleryDots = [...galleryCarousel.querySelectorAll('[data-gallery-dot]')];
  const galleryCounter = galleryCarousel.querySelector('[data-gallery-counter]');
  const galleryToggle = galleryCarousel.querySelector('[data-gallery-toggle]');
  const reduceGalleryMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let activeGallerySlide = 0;
  let galleryPaused = reduceGalleryMotion;
  let galleryHovered = false;
  let galleryFocused = false;
  let galleryTimer;

  const showGallerySlide = (index) => {
    activeGallerySlide = (index + gallerySlides.length) % gallerySlides.length;
    galleryTrack.style.transform = `translateX(-${activeGallerySlide * 100}%)`;
    gallerySlides.forEach((slide, slideIndex) => {
      slide.setAttribute('aria-hidden', String(slideIndex !== activeGallerySlide));
    });
    galleryDots.forEach((dot, dotIndex) => {
      if (dotIndex === activeGallerySlide) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
    if (galleryCounter) galleryCounter.textContent = `${String(activeGallerySlide + 1).padStart(2, '0')} / ${String(gallerySlides.length).padStart(2, '0')}`;
  };

  const syncGalleryTimer = () => {
    window.clearInterval(galleryTimer);
    if (!galleryPaused && !galleryHovered && !galleryFocused && !document.hidden) {
      galleryTimer = window.setInterval(() => showGallerySlide(activeGallerySlide + 1), 5000);
    }
    if (galleryToggle) {
      galleryToggle.textContent = galleryPaused ? 'تشغيل تلقائي' : 'إيقاف الحركة';
      galleryToggle.setAttribute('aria-label', galleryPaused ? 'تشغيل التبديل التلقائي' : 'إيقاف التبديل التلقائي');
      galleryToggle.setAttribute('aria-pressed', String(galleryPaused));
    }
  };

  galleryCarousel.querySelector('[data-gallery-prev]')?.addEventListener('click', () => { showGallerySlide(activeGallerySlide - 1); syncGalleryTimer(); });
  galleryCarousel.querySelector('[data-gallery-next]')?.addEventListener('click', () => { showGallerySlide(activeGallerySlide + 1); syncGalleryTimer(); });
  galleryDots.forEach((dot) => dot.addEventListener('click', () => { showGallerySlide(Number(dot.dataset.galleryDot)); syncGalleryTimer(); }));
  galleryToggle?.addEventListener('click', () => { galleryPaused = !galleryPaused; syncGalleryTimer(); });
  galleryCarousel.addEventListener('pointerenter', () => { galleryHovered = true; syncGalleryTimer(); });
  galleryCarousel.addEventListener('pointerleave', () => { galleryHovered = false; syncGalleryTimer(); });
  galleryCarousel.addEventListener('focusin', () => { galleryFocused = true; syncGalleryTimer(); });
  galleryCarousel.addEventListener('focusout', (event) => {
    if (!galleryCarousel.contains(event.relatedTarget)) { galleryFocused = false; syncGalleryTimer(); }
  });
  document.addEventListener('visibilitychange', syncGalleryTimer);
  showGallerySlide(0);
  syncGalleryTimer();
}

const quantitySelect = document.querySelector('#order-quantity');

const productModal = document.querySelector('#product-modal');
const productModalImage = document.querySelector('#product-modal-image');
const productModalCategory = document.querySelector('#product-modal-category');
const productModalTitle = document.querySelector('#product-modal-title');
const productModalDescription = document.querySelector('#product-modal-description');
const productModalClose = productModal?.querySelector('.product-modal-close');
let productModalTrigger = null;
let productModalPinned = false;
let productModalCloseTimer;

const closeProductModal = () => {
  window.clearTimeout(productModalCloseTimer);
  if (productModal?.open) productModal.close();
  productModalTrigger?.setAttribute('aria-expanded', 'false');
  productModalTrigger = null;
  productModalPinned = false;
};

const openProductModal = (imageButton, pin = false) => {
  if (!productModal || !imageButton) return;
  window.clearTimeout(productModalCloseTimer);
  const image = imageButton.querySelector('img');
  const card = imageButton.closest('.related-card');
  const title = card?.querySelector('.related-copy h3')?.textContent.trim() || '';
  const category = card?.querySelector('.related-category')?.textContent.trim() || '';
  const description = card?.querySelector('.related-copy>p:last-child')?.textContent.trim() || '';
  if (productModalTrigger && productModalTrigger !== imageButton) productModalTrigger.setAttribute('aria-expanded', 'false');
  productModalTrigger = imageButton;
  productModalPinned = productModalPinned || pin;
  productModalTrigger.setAttribute('aria-expanded', 'true');
  productModalImage.src = image?.currentSrc || image?.src || '';
  productModalImage.alt = image?.alt || title;
  productModalCategory.textContent = category;
  productModalTitle.textContent = title;
  productModalDescription.textContent = description;
  if (!productModal.open) productModal.showModal();
};

const scheduleProductModalClose = () => {
  window.clearTimeout(productModalCloseTimer);
  if (!productModalPinned) productModalCloseTimer = window.setTimeout(closeProductModal, 450);
};

document.querySelectorAll('.related-image').forEach((imageButton) => {
  imageButton.addEventListener('pointerenter', (event) => {
    if (event.pointerType === 'mouse' || event.pointerType === 'pen') openProductModal(imageButton);
  });
  imageButton.addEventListener('pointerleave', scheduleProductModalClose);
  imageButton.addEventListener('click', () => openProductModal(imageButton, true));
});

productModal?.querySelector('.product-modal-card')?.addEventListener('pointerenter', () => window.clearTimeout(productModalCloseTimer));
productModal?.querySelector('.product-modal-card')?.addEventListener('pointerleave', scheduleProductModalClose);
productModalClose?.addEventListener('click', closeProductModal);
productModal?.addEventListener('click', (event) => {
  if (event.target === productModal) closeProductModal();
});
productModal?.addEventListener('close', () => {
  productModalTrigger?.setAttribute('aria-expanded', 'false');
  productModalTrigger = null;
  productModalPinned = false;
});

const quantitySummary = document.querySelector('#quantity-summary');
const productsTotal = document.querySelector('#products-total');
const orderTotal = document.querySelector('#order-total');
const shippingTotal = document.querySelector('#shipping-total');
const deliveryMethod = document.querySelector('#delivery-method');
const stateSelect = document.querySelector('#order-state');
const algerianWilayas = [
  'أدرار','الشلف','الأغواط','أم البواقي','باتنة','بجاية','بسكرة','بشار','البليدة','البويرة',
  'تمنراست','تبسة','تلمسان','تيارت','تيزي وزو','الجزائر','الجلفة','جيجل','سطيف','سعيدة',
  'سكيكدة','سيدي بلعباس','عنابة','قالمة','قسنطينة','المدية','مستغانم','المسيلة','معسكر','ورقلة',
  'وهران','البيض','إليزي','برج بوعريريج','بومرداس','الطارف','تندوف','تيسمسيلت','الوادي','خنشلة',
  'سوق أهراس','تيبازة','ميلة','عين الدفلى','النعامة','عين تموشنت','غرداية','غليزان',
  'تيميمون','برج باجي مختار','أولاد جلال','بني عباس','عين صالح','عين قزام','تقرت','جانت','المغير','المنيعة',
  'آفلو','بريكة','قصر الشلالة','مسعد','عين وسارة','بوسعادة','الأبيض سيدي الشيخ','القنطرة','بئر العاتر','قصر البخاري','العريشة'
];

if (stateSelect) {
  const wilayaOptions = document.createDocumentFragment();
  algerianWilayas.forEach((wilaya) => {
    const option = document.createElement('option');
    option.value = wilaya;
    option.textContent = wilaya;
    wilayaOptions.append(option);
  });
  stateSelect.append(wilayaOptions);
}

const deliveryRates = { home: 700, office: 400 };
const formatDinar = (amount) => `${amount.toLocaleString('fr-DZ')} دج`;
const updateOrderSummary = () => {
  const quantity = Number(quantitySelect?.value || 0);
  const method = deliveryMethod?.value || '';
  const ready = quantity > 0 && Boolean(method);
  const priceRows = document.querySelectorAll('.price-row');
  const summaryPrompt = document.querySelector('#summary-prompt');
  priceRows.forEach((row) => { row.hidden = !ready; });
  if (summaryPrompt) summaryPrompt.hidden = ready;
  if (!ready) {
    if (quantitySummary) quantitySummary.textContent = quantity ? (labels[quantity] || `${quantity} عبوات`) : 'بانتظار اختيار الكمية';
    return;
  }
  const shipping = deliveryRates[method];
  const subtotal = quantity * 1200;
  if (quantitySummary) quantitySummary.textContent = labels[quantity] || `${quantity} عبوات`;
  if (productsTotal) productsTotal.textContent = formatDinar(subtotal);
  if (shippingTotal) shippingTotal.textContent = formatDinar(shipping);
  if (orderTotal) orderTotal.textContent = formatDinar(subtotal + shipping);
};

const labels = { 1: 'عبوة واحدة', 2: 'عبوتان', 3: '3 عبوات', 4: '4 عبوات', 5: '5 عبوات' };
quantitySelect?.addEventListener('change', updateOrderSummary);
deliveryMethod?.addEventListener('change', updateOrderSummary);
updateOrderSummary();

const orderForm = document.querySelector('#order-form');
const orderError = document.querySelector('#order-error');
const phoneInput = document.querySelector('#order-phone');
const phoneError = document.querySelector('#phone-error');
const orderApiBase = (window.CRAM_CORY_API_URL || '').replace(/\/+$/, '');

const normalizePhoneDigits = (value) => String(value || '')
  .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x660))
  .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x6f0));

const normalizeAlgerianPhone = (value) => {
  const raw = normalizePhoneDigits(value).trim();
  if (!raw || !/^[+0-9\s().-]+$/.test(raw)) return '';

  let compact = raw.replace(/[\s().-]/g, '');
  if (compact.startsWith('00213')) compact = `+213${compact.slice(5)}`;
  if (compact.startsWith('213')) compact = `+${compact}`;

  const localPattern = /^(?:0[567]\d{8}|0[234]\d{7}|09\d{8})$/;
  const internationalPattern = /^\+213(?:[567]\d{8}|[234]\d{7}|9\d{8})$/;
  if (localPattern.test(compact)) return `+213${compact.slice(1)}`;
  if (internationalPattern.test(compact)) return compact;
  return '';
};

const clearPhoneError = () => {
  if (!phoneInput || !phoneError) return;
  phoneInput.removeAttribute('aria-invalid');
  phoneError.textContent = '';
  phoneError.hidden = true;
};

const showPhoneError = () => {
  if (!phoneInput || !phoneError) return;
  phoneInput.setAttribute('aria-invalid', 'true');
  phoneError.textContent = 'رقم الهاتف غير صحيح. يرجى إعادة المحاولة أو إدخال المعلومات الصحيحة.';
  phoneError.hidden = false;
};

if (phoneInput) {
  phoneInput.addEventListener('input', () => {
    const normalized = normalizePhoneDigits(phoneInput.value);
    if (phoneInput.value !== normalized) phoneInput.value = normalized;
    if (normalizeAlgerianPhone(phoneInput.value)) clearPhoneError();
  });

  phoneInput.addEventListener('blur', () => {
    if (!phoneInput.value.trim()) return;
    if (!normalizeAlgerianPhone(phoneInput.value)) {
      phoneInput.value = '';
      showPhoneError();
      return;
    }
    clearPhoneError();
  });
}

if (orderForm) {
  orderForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const normalizedPhone = normalizeAlgerianPhone(phoneInput?.value);
    if (!normalizedPhone) {
      if (phoneInput?.value.trim()) phoneInput.value = '';
      showPhoneError();
      phoneInput?.focus();
      return;
    }
    clearPhoneError();
    if (!orderForm.reportValidity()) return;

    const submitButton = orderForm.querySelector('[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'جارٍ إرسال الطلب…';
    if (orderError) {
      orderError.hidden = true;
      orderError.textContent = '';
    }

    const formData = new FormData(orderForm);
    const payload = Object.fromEntries(formData.entries());
    payload.quantity = Number(payload.quantity);
    payload.phone = normalizedPhone;

    try {
      const response = await fetch(`${orderApiBase}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || 'تعذر إرسال الطلب الآن. حاولي مجددًا لاحقًا.');

      orderForm.className = 'order-success';
      orderForm.innerHTML = '<div class="success-mark" aria-hidden="true">✓</div><h3>تم استلام طلبك بنجاح</h3><p>شكرًا لثقتكِ بـ Cram Cory. سنتواصل معكِ لتأكيد تفاصيل الطلب والتوصيل.</p><span class="success-reference">CRAM CORY · ORDER RECEIVED</span>';
    } catch (error) {
      if (orderError) {
        orderError.textContent = error instanceof TypeError
          ? 'خدمة الطلبات غير متاحة في هذه المعاينة. افتحي رابط الموقع بعد تشغيل الخادم وإعداد واتساب.'
          : error.message || 'تعذر الاتصال بالخادم. تحققي من اتصالك وحاولي مجددًا.';
        orderError.hidden = false;
      }
      submitButton.disabled = false;
      submitButton.textContent = 'إرسال الطلب';
    }
  });
}

