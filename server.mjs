import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));

async function loadLocalEnv() {
  const envPath = resolve(ROOT, '.env');
  if (!existsSync(envPath)) return;
  const contents = (await readFile(envPath, 'utf8')).replace(/^\uFEFF/, '');
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^(["'])(.*)\1$/, '$2');
  }
}

await loadLocalEnv();

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};

const rateLimit = new Map();
const PRODUCT_PRICE = 1200;
const DELIVERY_RATES = { home: 700, office: 400 };

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(JSON.stringify(body));
}

const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || 'https://ywsfsfyan269-wq.github.io')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);

function applyCors(request, response) {
  const origin = request.headers.origin;
  if (!origin || !allowedOrigins.has(origin)) return !origin;
  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Vary', 'Origin');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return true;
}

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength) : '';
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 12_000) throw Object.assign(new Error('حجم الطلب كبير جدًا.'), { statusCode: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('تعذر قراءة بيانات الطلب.'), { statusCode: 400 });
  }
}

function rateLimited(request) {
  const forwarded = request.headers['x-forwarded-for'];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0])?.trim() || request.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = rateLimit.get(ip);
  if (!entry || entry.until < now) {
    rateLimit.set(ip, { count: 1, until: now + 60_000 });
    return false;
  }
  entry.count += 1;
  return entry.count > 5;
}

async function sendOrderToWhatsApp(order) {
  const {
    WHATSAPP_ACCESS_TOKEN,
    WHATSAPP_PHONE_NUMBER_ID,
    WHATSAPP_RECIPIENT,
    WHATSAPP_API_VERSION,
    WHATSAPP_TEMPLATE_NAME,
    WHATSAPP_TEMPLATE_LANGUAGE = 'ar'
  } = process.env;

  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_RECIPIENT || !WHATSAPP_API_VERSION || !WHATSAPP_TEMPLATE_NAME) {
    throw Object.assign(new Error('لم يكتمل إعداد استقبال الطلبات بعد. يرجى المحاولة لاحقًا.'), { statusCode: 503 });
  }
  if (!/^v\d+\.\d+$/.test(WHATSAPP_API_VERSION)) {
    throw Object.assign(new Error('إعداد خدمة الرسائل غير مكتمل.'), { statusCode: 503 });
  }

  const deliveryFee = DELIVERY_RATES[order.deliveryMethod];
  const subtotal = order.quantity * PRODUCT_PRICE;
  const total = subtotal + deliveryFee;
  const params = [
    order.fullName,
    order.phone,
    order.state,
    order.deliveryAddress,
    order.deliveryMethod === 'home' ? 'إلى المنزل' : 'إلى المكتب',
    String(order.quantity),
    `${PRODUCT_PRICE.toLocaleString('fr-DZ')} دج`,
    `${subtotal.toLocaleString('fr-DZ')} دج`,
    `${deliveryFee.toLocaleString('fr-DZ')} دج`,
    `${total.toLocaleString('fr-DZ')} دج`
  ].map((text) => ({ type: 'text', text }));

  const apiUrl = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  let apiResponse;
  try {
    apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: WHATSAPP_RECIPIENT.replace(/\D/g, ''),
        type: 'template',
        template: {
          name: WHATSAPP_TEMPLATE_NAME,
          language: { code: WHATSAPP_TEMPLATE_LANGUAGE },
          components: [{ type: 'body', parameters: params }]
        }
      }),
      signal: AbortSignal.timeout(15_000)
    });
  } catch {
    throw Object.assign(new Error('تعذر الاتصال بخدمة إرسال الطلبات. حاولي مجددًا.'), { statusCode: 502 });
  }

  const result = await apiResponse.json().catch(() => ({}));
  if (!apiResponse.ok || !result.messages?.length) {
    console.error('WhatsApp API rejected an order notification (HTTP %s).', apiResponse.status);
    throw Object.assign(new Error('لم نتمكن من إرسال الطلب. تحققي من البيانات وحاولي مجددًا.'), { statusCode: 502 });
  }
}

async function handleOrder(request, response) {
  if (rateLimited(request)) return sendJson(response, 429, { message: 'وصلت طلبات كثيرة خلال وقت قصير. انتظري قليلًا ثم حاولي مجددًا.' });

  let input;
  try {
    input = await readJson(request);
  } catch (error) {
    return sendJson(response, error.statusCode || 400, { message: error.message });
  }

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return sendJson(response, 400, { message: 'بيانات الطلب غير صالحة.' });
  }

  const order = {
    fullName: cleanText(input.fullName, 100),
    phone: cleanText(input.phone, 32),
    state: cleanText(input.state, 80),
    deliveryAddress: cleanText(input.deliveryAddress, 240),
    deliveryMethod: input.deliveryMethod,
    quantity: Number(input.quantity)
  };

  if (order.fullName.length < 3 || !/^\+?[0-9][0-9\s().-]{6,24}$/.test(order.phone) || !order.state || order.deliveryAddress.length < 5 || !DELIVERY_RATES[order.deliveryMethod] || !Number.isInteger(order.quantity) || order.quantity < 1 || order.quantity > 5) {
    return sendJson(response, 400, { message: 'راجعي الاسم ورقم الهاتف والعنوان والولاية والكمية وطريقة التوصيل.' });
  }

  try {
    await sendOrderToWhatsApp(order);
    return sendJson(response, 200, { ok: true });
  } catch (error) {
    return sendJson(response, error.statusCode || 502, { message: error.message || 'تعذر إرسال الطلب.' });
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', 'http://localhost');
  if (url.pathname === '/health') return sendJson(response, 200, { ok: true });
  if (url.pathname === '/api/orders') {
    if (!applyCors(request, response)) return sendJson(response, 403, { message: 'مصدر الطلب غير مسموح.' });
    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      return response.end();
    }
    if (request.method === 'POST') return handleOrder(request, response);
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD, POST' });
    return response.end('Method Not Allowed');
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400);
    return response.end('Bad Request');
  }
  if (pathname === '/') pathname = '/index.html';
  const pathParts = pathname.split('/').filter(Boolean);
  const publicRootFiles = new Set(['/index.html', '/styles.css', '/script.js', '/api-config.js']);
  const isPublicAsset = pathParts[0] === 'assets' && pathParts.length >= 2;
  if (pathParts.some((part) => part === '..' || part.startsWith('.')) || (!publicRootFiles.has(pathname) && !isPublicAsset)) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return response.end('Not Found');
  }
  const filePath = resolve(ROOT, `.${pathname}`);
  if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${sep}`)) {
    response.writeHead(403);
    return response.end('Forbidden');
  }

  try {
    const fileInfo = await stat(filePath);
    if (!fileInfo.isFile()) throw new Error('Not a file');
    const content = await readFile(filePath);
    response.writeHead(200, {
      'Cache-Control': 'no-cache',
      'Content-Length': content.length,
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
      'Content-Type': contentTypes[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY'
    });
    return response.end(request.method === 'HEAD' ? undefined : content);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return response.end('Not Found');
  }
});

const port = Number(process.env.PORT || 4173);
server.listen(port, process.env.HOST || '0.0.0.0', () => {
  console.log(`Cram Cory landing page listening on port ${port}`);
});

