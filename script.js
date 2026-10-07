document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener('click', (event) => {
    const target = document.querySelector(link.getAttribute('href'));
    if (target) {
      event.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

const quantitySelect = document.querySelector('#order-quantity');
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
if (orderForm) {
  orderForm.addEventListener('submit', async (event) => {
    event.preventDefault();
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

    try {
      const response = await fetch('/api/orders', {
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

