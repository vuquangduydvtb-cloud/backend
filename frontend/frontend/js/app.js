const API = '/api';
let currentUser = null;
let cartData = { items: [], total: 0, count: 0 };
let products = [];
let currentOffset = 0;
const PAGE_SIZE = 12;
let searchTimeout = null;
let selectedColor = {};

// ==================== AUTH ====================
function getToken() { return localStorage.getItem('istore_token'); }
function setToken(t) { localStorage.setItem('istore_token', t); }
function clearToken() { localStorage.removeItem('istore_token'); }

async function checkAuth() {
  const token = getToken();
  if (!token) return renderNavGuest();
  try {
    const res = await fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { clearToken(); return renderNavGuest(); }
    currentUser = await res.json();
    renderNavUser();
    loadCart();
    loadRecommendations();
  } catch { renderNavGuest(); }
}

function renderNavGuest() {
  document.getElementById('navUser').innerHTML = `<button class="btn-login" onclick="openModal('loginModal')">Đăng nhập</button>`;
}

function renderNavUser() {
  document.getElementById('navUser').innerHTML = `
    <div class="user-menu-btn">
      <span>👤 ${currentUser.name.split(' ').pop()}</span>
      <div class="user-dropdown">
        <a href="#" onclick="showOrders()">📦 Đơn hàng của tôi</a>
        ${currentUser.role === 'admin' ? '<a href="/admin" target="_blank">🔧 Trang Admin</a>' : ''}
        <button onclick="doLogout()">🚪 Đăng xuất</button>
      </div>
    </div>`;
}

async function doLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  errEl.classList.remove('visible');

  try {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error; errEl.classList.add('visible'); return; }
    setToken(data.token);
    currentUser = data.user;
    renderNavUser();
    closeModal('loginModal');
    loadCart(); loadRecommendations();
    toast('Đăng nhập thành công! 👋', 'success');
    if (data.user.role === 'admin') {
      toast('Chào Admin! Truy cập trang quản trị tại /admin', 'success');
    }
  } catch { errEl.textContent = 'Lỗi kết nối'; errEl.classList.add('visible'); }
}

async function doRegister(e) {
  e.preventDefault();
  const name = document.getElementById('regName').value;
  const email = document.getElementById('regEmail').value;
  const phone = document.getElementById('regPhone').value;
  const password = document.getElementById('regPassword').value;
  const errEl = document.getElementById('regError');
  errEl.classList.remove('visible');

  try {
    const res = await fetch(`${API}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phone, password })
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error; errEl.classList.add('visible'); return; }
    setToken(data.token);
    currentUser = data.user;
    renderNavUser();
    closeModal('loginModal');
    loadCart(); loadRecommendations();
    toast('Tạo tài khoản thành công! 🎉', 'success');
  } catch { errEl.textContent = 'Lỗi kết nối'; errEl.classList.add('visible'); }
}

function doLogout() {
  clearToken(); currentUser = null; cartData = { items: [], total: 0, count: 0 };
  renderNavGuest();
  updateCartBadge(0);
  document.getElementById('recommendSection').style.display = 'none';
  toast('Đã đăng xuất');
}

function switchTab(tab) {
  document.getElementById('loginForm').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('registerForm').style.display = tab === 'register' ? 'block' : 'none';
  document.querySelectorAll('.auth-tab').forEach((t, i) => t.classList.toggle('active', (i === 0) === (tab === 'login')));
}

// ==================== PRODUCTS ====================
async function loadProducts(reset = false) {
  if (reset) { currentOffset = 0; products = []; }
  const q = document.getElementById('searchInput').value;
  const condition = document.getElementById('filterCondition').value;
  const priceRange = document.getElementById('filterPrice').value;
  const sort = document.getElementById('sortSelect').value;

  let min_price = '', max_price = '';
  if (priceRange) { [min_price, max_price] = priceRange.split('-'); }

  const params = new URLSearchParams({ limit: PAGE_SIZE, offset: currentOffset, sort });
  if (q) params.append('q', q);
  if (condition !== 'all') params.append('condition', condition);
  if (min_price) params.append('min_price', min_price);
  if (max_price) params.append('max_price', max_price);

  const token = getToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  try {
    const res = await fetch(`${API}/products?${params}`, { headers });
    const data = await res.json();
    products = reset ? data.products : [...products, ...data.products];
    renderProducts(reset);
    document.getElementById('loadMoreBtn').style.display =
      products.length < data.total ? 'inline-block' : 'none';
    currentOffset += PAGE_SIZE;
  } catch { console.error('Load products failed'); }
}

function renderProducts(reset) {
  const grid = document.getElementById('productGrid');
  if (reset) grid.innerHTML = '';
  if (products.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:60px;color:var(--gray)">Không tìm thấy sản phẩm nào</div>';
    return;
  }
  products.forEach(p => {
    const img = p.images?.[0] ? `<img src="${p.images[0]}" alt="${p.name}" onerror="this.parentElement.innerHTML='<div class=phone-placeholder>📱</div>'">` : '<div class="phone-placeholder">📱</div>';
    const badge = p.condition === 'used' ? 'badge-used" >Hàng cũ' :
      (p.stock < 5 ? 'badge-hot" >Sắp hết' : 'badge-new" >Mới');
    const colors = (p.colors || []).slice(0, 4).map((c, i) =>
      `<div class="color-dot ${i===0?'active':''}" style="background:${colorToHex(c)}" title="${c}" onclick="selectColor(event,${p.id},'${c}')"></div>`
    ).join('');
    const discount = p.original_price > p.price ? `<div class="product-price-old">${fmt(p.original_price)}</div>` : '';

    const card = document.createElement('div');
    card.className = 'product-card';
    card.setAttribute('data-id', p.id);
    card.innerHTML = `
      <span class="product-badge ${badge}</span>
      <div class="product-img-area" onclick="openProductDetail(${p.id})">${img}</div>
      <div class="product-name" onclick="openProductDetail(${p.id})">${p.name}</div>
      <div class="product-sub">${p.description || ''}</div>
      <div class="product-price">${fmt(p.price)}</div>
      ${discount}
      <div class="product-colors">${colors}</div>
      <button class="add-cart-btn" onclick="addToCart(${p.id})">
        ${p.stock > 0 ? 'Thêm vào giỏ hàng' : 'Hết hàng'}
      </button>`;
    if (p.stock === 0) card.querySelector('.add-cart-btn').disabled = true;
    grid.appendChild(card);
  });
}

function loadMore() { loadProducts(false); }

function doSearch() { loadProducts(true); }

function filterBy(condition) {
  document.getElementById('filterCondition').value = condition;
  loadProducts(true);
  document.getElementById('products').scrollIntoView({ behavior: 'smooth' });
}

// Live search suggestions
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('searchInput');
  const sugg = document.getElementById('searchSuggestions');
  input.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const q = input.value.trim();
    if (q.length < 2) { sugg.classList.remove('visible'); return; }
    searchTimeout = setTimeout(async () => {
      const res = await fetch(`${API}/products?q=${encodeURIComponent(q)}&limit=5`);
      const data = await res.json();
      sugg.innerHTML = data.products.map(p =>
        `<div class="suggestion-item" onclick="openProductDetail(${p.id});sugg.classList.remove('visible')">
          <span style="font-size:1.2rem">📱</span>
          <div><div style="font-size:0.85rem;font-weight:500">${p.name}</div><div style="font-size:0.75rem;color:var(--gold)">${fmt(p.price)}</div></div>
        </div>`
      ).join('') || '<div class="suggestion-item" style="color:var(--gray)">Không tìm thấy kết quả</div>';
      sugg.classList.add('visible');
    }, 280);
  });
  document.addEventListener('click', e => { if (!e.target.closest('.search-box')) sugg.classList.remove('visible'); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { doSearch(); sugg.classList.remove('visible'); } });
});

// ==================== PRODUCT DETAIL ====================
async function openProductDetail(id) {
  const token = getToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${API}/products/${id}`, { headers });
  const p = await res.json();

  const imgs = p.images?.length > 0 ? p.images : [];
  const mainImg = imgs[0] ? `<img src="${imgs[0]}" alt="${p.name}" onerror="this.src=''">` : '<div style="font-size:5rem">📱</div>';
  const thumbs = imgs.map((img, i) =>
    `<div class="pd-thumb" onclick="switchMainImg('${img}')"><img src="${img}" onerror="this.parentElement.innerHTML='📱'"></div>`
  ).join('') || '<div class="pd-thumb">📱</div>';

  const colorChips = (p.colors || []).map((c, i) =>
    `<div class="pd-color-chip ${i===0?'active':''}" onclick="selectPdColor(this,'${c}')">${c}</div>`
  ).join('');

  const specs = Object.entries(p.specs || {}).map(([k, v]) =>
    `<div class="pd-spec-row"><span>${k}</span><span>${v}</span></div>`
  ).join('');

  const stockText = p.stock === 0 ? '<span class="stock-dot stock-out"></span>Hết hàng' :
    p.stock <= 3 ? `<span class="stock-dot stock-low"></span>Sắp hết (còn ${p.stock})` :
    `<span class="stock-dot stock-in"></span>Còn hàng (${p.stock} máy)`;

  const discount = p.original_price > p.price ? `<div class="pd-orig">${fmt(p.original_price)}</div>` : '';

  document.getElementById('productModalContent').innerHTML = `
    <div class="pd-grid">
      <div class="pd-images">
        <div class="pd-main-img" id="pdMainImg">${mainImg}</div>
        <div class="pd-thumbs">${thumbs}</div>
      </div>
      <div class="pd-info">
        <div class="stock-badge">${stockText}</div>
        <h2 class="pd-title">${p.name}</h2>
        <span class="product-badge ${p.condition==='new'?'badge-new':'badge-used'} pd-condition">${p.condition==='new'?'Hàng mới':'Hàng cũ'}</span>
        <div class="pd-price">${fmt(p.price)}</div>
        ${discount}
        <p class="pd-desc">${p.description || ''}</p>
        ${colorChips ? `<div class="pd-color-label">Màu sắc</div><div class="pd-colors">${colorChips}</div>` : ''}
        ${specs ? `<div class="pd-specs">${specs}</div>` : ''}
        <div class="pd-btns">
          <button class="btn-primary" onclick="addToCartFromDetail(${p.id})" ${p.stock===0?'disabled':''}>🛒 Thêm giỏ hàng</button>
          <button class="btn-outline" onclick="goCheckoutDirect(${p.id})">⚡ Mua ngay</button>
        </div>
      </div>
    </div>`;

  document.getElementById('productModal').classList.add('active');
}

function switchMainImg(src) {
  const el = document.getElementById('pdMainImg');
  el.innerHTML = `<img src="${src}" alt="">`;
}

function selectPdColor(el, color) {
  document.querySelectorAll('.pd-color-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
}

function addToCartFromDetail(id) {
  const activeColor = document.querySelector('.pd-color-chip.active')?.textContent || '';
  addToCart(id, activeColor);
}

function closeProductModal(e) {
  if (e.target === document.getElementById('productModal')) document.getElementById('productModal').classList.remove('active');
}

// ==================== CART ====================
async function loadCart() {
  if (!getToken()) return;
  try {
    const res = await fetch(`${API}/cart`, { headers: { Authorization: `Bearer ${getToken()}` } });
    cartData = await res.json();
    updateCartBadge(cartData.count);
    renderCartItems();
  } catch {}
}

function updateCartBadge(n) {
  const el = document.getElementById('cartCount');
  el.textContent = n;
  el.style.display = n > 0 ? 'flex' : 'none';
}

function renderCartItems() {
  const body = document.getElementById('cartBody');
  const footer = document.getElementById('cartFooter');
  if (!cartData.items || cartData.items.length === 0) {
    body.innerHTML = '<p class="empty-msg">Giỏ hàng trống 🛒</p>';
    footer.style.display = 'none'; return;
  }
  body.innerHTML = cartData.items.map(item => {
    const img = item.images?.[0] ? `<img src="${item.images[0]}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:6px" onerror="this.parentElement.innerHTML='📱'">` : '📱';
    return `<div class="cart-item">
      <div class="cart-item-img">${img}</div>
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        ${item.color ? `<div class="cart-item-color">${item.color}</div>` : ''}
        <div class="cart-item-price">${fmt(item.price * item.quantity)}</div>
        <div class="cart-qty">
          <button class="qty-btn" onclick="updateQty(${item.id},${item.quantity-1})">−</button>
          <span class="qty-num">${item.quantity}</span>
          <button class="qty-btn" onclick="updateQty(${item.id},${item.quantity+1})">+</button>
        </div>
      </div>
      <button class="cart-item-del" onclick="removeCartItem(${item.id})" title="Xóa">✕</button>
    </div>`;
  }).join('');
  document.getElementById('cartTotal').textContent = fmt(cartData.total);
  footer.style.display = 'block';
}

async function addToCart(productId, color = '') {
  if (!getToken()) { openModal('loginModal'); toast('Vui lòng đăng nhập để thêm giỏ hàng', 'error'); return; }
  const card = document.querySelector(`[data-id="${productId}"]`);
  const activeColor = color || card?.querySelector('.color-dot.active')?.title || '';
  try {
    const res = await fetch(`${API}/cart`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ product_id: productId, quantity: 1, color: activeColor })
    });
    if (res.ok) { await loadCart(); toast('✓ Đã thêm vào giỏ hàng', 'success'); }
    else { const d = await res.json(); toast(d.error, 'error'); }
  } catch { toast('Lỗi kết nối', 'error'); }
}

async function updateQty(itemId, qty) {
  await fetch(`${API}/cart/${itemId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify({ quantity: qty })
  });
  await loadCart();
}

async function removeCartItem(itemId) {
  await fetch(`${API}/cart/${itemId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${getToken()}` } });
  await loadCart();
}

function toggleCart() {
  document.getElementById('cartDrawer').classList.toggle('active');
  document.getElementById('cartOverlay').classList.toggle('active');
}

function selectColor(e, productId, colorName) {
  e.stopPropagation();
  const card = document.querySelector(`[data-id="${productId}"]`);
  card?.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
  e.target.classList.add('active');
}

// ==================== CHECKOUT ====================
function goCheckout() {
  if (!getToken()) { openModal('loginModal'); return; }
  if (!cartData.items?.length) { toast('Giỏ hàng trống', 'error'); return; }
  toggleCart();
  openCheckoutModal(cartData.items, cartData.total);
}

async function goCheckoutDirect(productId) {
  if (!getToken()) { openModal('loginModal'); document.getElementById('productModal').classList.remove('active'); return; }
  document.getElementById('productModal').classList.remove('active');
  const res = await fetch(`${API}/products/${productId}`);
  const p = await res.json();
  const color = document.querySelector('.pd-color-chip.active')?.textContent || '';
  const items = [{ product_id: p.id, name: p.name, price: p.price, quantity: 1, color }];
  openCheckoutModal(items, p.price);
}

let checkoutItems = [], checkoutTotal = 0, selectedPayment = 'cod';
let storeSettings = {};

async function openCheckoutModal(items, total) {
  checkoutItems = items; checkoutTotal = total;

  // Load settings cho QR
  try {
    const res = await fetch(`${API}/admin/settings`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (res.ok) storeSettings = await res.json();
  } catch {}

  document.getElementById('checkoutContent').innerHTML = renderCheckoutForm();
  openModal('checkoutModal');
  setupPaymentSelect();
}

function renderCheckoutForm() {
  const user = currentUser;
  const itemsHtml = checkoutItems.map(i => `<div class="checkout-item"><span>${i.name} × ${i.quantity}</span><span>${fmt(i.price * i.quantity)}</span></div>`).join('');
  return `
    <div class="checkout-summary">
      ${itemsHtml}
      <div class="checkout-item"><span>Tổng cộng</span><span>${fmt(checkoutTotal)}</span></div>
    </div>
    <h4 style="margin-bottom:16px;font-size:0.85rem;color:var(--gray);letter-spacing:2px;text-transform:uppercase">Phương thức thanh toán</h4>
    <div class="payment-methods">
      <div class="pm-option selected" data-pm="cod" onclick="selectPayment('cod',this)">
        <div class="pm-icon">🚚</div>
        <div class="pm-name">COD</div>
        <div class="pm-sub">Thanh toán khi nhận</div>
      </div>
      <div class="pm-option" data-pm="deposit" onclick="selectPayment('deposit',this)">
        <div class="pm-icon">🔒</div>
        <div class="pm-name">Đặt cọc</div>
        <div class="pm-sub">Giữ máy 2 tuần</div>
      </div>
      <div class="pm-option" data-pm="qr" onclick="selectPayment('qr',this)">
        <div class="pm-icon">📱</div>
        <div class="pm-name">Chuyển khoản</div>
        <div class="pm-sub">QR Momo/ZaloPay</div>
      </div>
    </div>
    <div id="paymentDetail"></div>
    <h4 style="margin-bottom:16px;margin-top:24px;font-size:0.85rem;color:var(--gray);letter-spacing:2px;text-transform:uppercase">Thông tin giao hàng</h4>
    <div class="form-row">
      <div class="form-group"><label>Họ tên</label><input type="text" id="ck_name" value="${user?.name||''}" placeholder="Nguyễn Văn A" required></div>
      <div class="form-group"><label>Điện thoại</label><input type="tel" id="ck_phone" value="${user?.phone||''}" placeholder="0909..."></div>
    </div>
    <div class="form-group"><label>Địa chỉ giao hàng</label><input type="text" id="ck_addr" value="${user?.address||''}" placeholder="Số nhà, đường, phường, quận, tỉnh/TP"></div>
    <div class="form-group"><label>Ghi chú</label><textarea id="ck_note" placeholder="Ghi chú đặc biệt..."></textarea></div>
    <div id="checkoutError" class="form-error"></div>
    <button class="btn-primary w100 mt16" onclick="placeOrder()">Xác nhận đặt hàng</button>`;
}

function setupPaymentSelect() { selectedPayment = 'cod'; renderPaymentDetail(); }

function selectPayment(pm, el) {
  selectedPayment = pm;
  document.querySelectorAll('.pm-option').forEach(e => e.classList.remove('selected'));
  el.classList.add('selected');
  renderPaymentDetail();
}

function renderPaymentDetail() {
  const el = document.getElementById('paymentDetail');
  if (!el) return;
  if (selectedPayment === 'deposit') {
    const pct = storeSettings.deposit_percent || 30;
    const days = storeSettings.deposit_days || 14;
    const depositAmt = checkoutTotal * pct / 100;
    el.innerHTML = `<div class="deposit-info">
      💡 Bạn sẽ đặt cọc <strong>${fmt(depositAmt)}</strong> (${pct}% giá trị máy).<br>
      Máy được giữ tối đa <strong>${days} ngày</strong>.<br>
      Thanh toán phần còn lại khi nhận hàng.
    </div>`;
  } else if (selectedPayment === 'qr') {
    const hasMomo = storeSettings.momo_qr;
    const hasZalo = storeSettings.zalopay_qr;
    el.innerHTML = `<div class="qr-section">
      <div class="qr-tabs">
        ${hasMomo ? `<button class="qr-tab active" onclick="showQr('momo',this)">Momo</button>` : ''}
        ${hasZalo ? `<button class="qr-tab ${!hasMomo?'active':''}" onclick="showQr('zalopay',this)">ZaloPay</button>` : ''}
      </div>
      <div id="qrImgWrap">
        ${hasMomo ? `<img src="${hasMomo}" alt="Momo QR" id="qrImg">` : '<p style="color:var(--gray);font-size:0.85rem">Admin chưa cấu hình QR thanh toán</p>'}
      </div>
      <p style="font-size:0.78rem;color:var(--gold);margin-top:10px">Nội dung chuyển khoản: iStore_${Date.now()}</p>
    </div>`;
  } else {
    el.innerHTML = '';
  }
}

function showQr(type, btn) {
  document.querySelectorAll('.qr-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  const src = type === 'momo' ? storeSettings.momo_qr : storeSettings.zalopay_qr;
  document.getElementById('qrImgWrap').innerHTML = src ? `<img src="${src}" alt="${type} QR" id="qrImg">` : '<p style="color:var(--gray)">Chưa cấu hình</p>';
}

async function placeOrder() {
  const name = document.getElementById('ck_name').value.trim();
  const phone = document.getElementById('ck_phone').value.trim();
  const addr = document.getElementById('ck_addr').value.trim();
  const note = document.getElementById('ck_note').value.trim();
  const errEl = document.getElementById('checkoutError');

  if (!name || !phone || !addr) {
    errEl.textContent = 'Vui lòng điền đầy đủ thông tin giao hàng';
    errEl.classList.add('visible'); return;
  }

  errEl.classList.remove('visible');

  try {
    const res = await fetch(`${API}/orders`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({
        payment_method: selectedPayment, shipping_name: name,
        shipping_phone: phone, shipping_address: addr, note,
        items: checkoutItems
      })
    });
    const order = await res.json();
    if (!res.ok) { errEl.textContent = order.error; errEl.classList.add('visible'); return; }

    await loadCart();
    let extra = '';
    if (selectedPayment === 'deposit' && order.deposit_note) extra = `<div class="deposit-info" style="margin-top:16px">${order.deposit_note}</div>`;
    if (selectedPayment === 'qr' && order.payment_note) extra = `<div class="deposit-info" style="margin-top:16px">${order.payment_note}</div>`;

    document.getElementById('checkoutContent').innerHTML = `
      <div class="order-success">
        <div class="success-icon">✅</div>
        <h3>Đặt hàng thành công!</h3>
        <p style="color:var(--gray);margin-bottom:6px">Mã đơn hàng: <strong style="color:var(--gold)">#${order.id}</strong></p>
        <p style="color:var(--gray);font-size:0.85rem;margin-bottom:16px">Chúng tôi sẽ liên hệ xác nhận trong 30 phút.</p>
        ${extra}
        <button class="btn-outline mt16" onclick="closeModal('checkoutModal')">Tiếp tục mua sắm</button>
      </div>`;
    toast('Đặt hàng thành công! 🎉', 'success');
  } catch { errEl.textContent = 'Lỗi kết nối, vui lòng thử lại'; errEl.classList.add('visible'); }
}

// ==================== RECOMMENDATIONS ====================
async function loadRecommendations() {
  if (!getToken()) return;
  try {
    const res = await fetch(`${API}/products/recommend/personal`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!res.ok) return;
    const recs = await res.json();
    if (recs.length === 0) return;

    const section = document.getElementById('recommendSection');
    const grid = document.getElementById('recommendGrid');
    section.style.display = 'block';
    grid.innerHTML = '';

    recs.forEach(p => {
      const img = p.images?.[0] ? `<img src="${p.images[0]}" alt="${p.name}" onerror="this.parentElement.innerHTML='<div class=phone-placeholder>📱</div>'">` : '<div class="phone-placeholder">📱</div>';
      const card = document.createElement('div');
      card.className = 'product-card';
      card.setAttribute('data-id', p.id);
      card.innerHTML = `
        <span class="product-badge ${p.condition==='new'?'badge-new':'badge-used'}">${p.condition==='new'?'Mới':'Cũ'}</span>
        <div class="product-img-area" onclick="openProductDetail(${p.id})">${img}</div>
        <div class="product-name" onclick="openProductDetail(${p.id})">${p.name}</div>
        <div class="product-sub">${p.description||''}</div>
        <div class="product-price">${fmt(p.price)}</div>
        ${p.original_price>p.price?`<div class="product-price-old">${fmt(p.original_price)}</div>`:''}
        <button class="add-cart-btn" onclick="addToCart(${p.id})">Thêm vào giỏ hàng</button>`;
      grid.appendChild(card);
    });
  } catch {}
}

// ==================== ORDERS ====================
async function showOrders() {
  const res = await fetch(`${API}/orders/my`, { headers: { Authorization: `Bearer ${getToken()}` } });
  const orders = await res.json();

  const statusMap = { pending:'Chờ xác nhận', confirmed:'Đã xác nhận', shipping:'Đang giao', delivered:'Đã giao', cancelled:'Đã hủy' };
  const pmMap = { cod:'Thanh toán khi nhận', deposit:'Đặt cọc', qr:'Chuyển khoản QR' };
  const statusColors = { pending:'#f59e0b', confirmed:'var(--gold)', shipping:'#3b82f6', delivered:'var(--success)', cancelled:'var(--danger)' };

  document.getElementById('checkoutContent').innerHTML = orders.length === 0 ?
    '<p style="text-align:center;color:var(--gray);padding:40px">Bạn chưa có đơn hàng nào</p>' :
    orders.map(o => `
      <div style="border:1px solid var(--border2);border-radius:8px;padding:16px;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <span style="font-size:0.82rem;color:var(--gray)">Đơn #${o.id} · ${new Date(o.created_at).toLocaleDateString('vi-VN')}</span>
          <span style="font-size:0.75rem;color:${statusColors[o.status]};font-weight:500">${statusMap[o.status]||o.status}</span>
        </div>
        <div style="font-size:0.82rem;color:var(--gray);margin-bottom:8px">${pmMap[o.payment_method]||o.payment_method}</div>
        ${o.items.map(i=>`<div style="font-size:0.85rem;padding:4px 0;border-bottom:1px solid var(--border2)">${i.name} × ${i.quantity}</div>`).join('')}
        <div style="display:flex;justify-content:space-between;margin-top:10px">
          <span style="font-size:0.82rem;color:var(--gray)">Tổng:</span>
          <strong style="color:var(--gold)">${fmt(o.total)}</strong>
        </div>
      </div>`).join('');

  openModal('checkoutModal');
  document.querySelector('#checkoutModal .modal-title').textContent = 'Đơn hàng của tôi';
}

// ==================== BANNERS ====================
async function loadBanners() {
  try {
    const res = await fetch(`${API}/banners`);
    const banners = await res.json();
    if (!banners.length) return;
    const slider = document.getElementById('bannerSlider');
    slider.innerHTML = banners.map((b, i) => `
      <div class="banner-image-slide" style="display:${i===0?'flex':'none'}">
        ${b.image ? `<img src="${b.image}" alt="${b.title}">` : ''}
        <div class="banner-image-content">
          ${b.title ? `<h1 class="banner-title">${b.title}</h1>` : ''}
          ${b.subtitle ? `<p class="banner-sub">${b.subtitle}</p>` : ''}
          ${b.link ? `<a href="${b.link}" class="btn-primary">Xem ngay</a>` : ''}
        </div>
      </div>`).join('');

    // Auto-slide nếu nhiều banner
    if (banners.length > 1) {
      let cur = 0;
      setInterval(() => {
        slider.children[cur].style.display = 'none';
        cur = (cur + 1) % banners.length;
        slider.children[cur].style.display = 'flex';
      }, 5000);
    }
  } catch {}
}

// ==================== UTILS ====================
function fmt(n) { return new Intl.NumberFormat('vi-VN').format(Math.round(n)) + '₫'; }

function colorToHex(name) {
  const map = { 'đen':'#1a1a1a', 'trắng':'#e8e8e8', 'vàng':'#c9a84c', 'đỏ':'#c0392b', 'xanh dương':'#2980b9', 'xanh lá':'#27ae60', 'hồng':'#e91e8c', 'tím':'#8e44ad', 'cam':'#e67e22', 'bạc':'#bdc3c7', 'titan':'#8d7b6b', 'titan sa mạc':'#8d7b6b', 'titan đen':'#2c2c2c', 'titan trắng':'#d0d0d0', 'titan tự nhiên':'#a09070', 'titan nâu':'#7a6040' };
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(map)) { if (lower.includes(k)) return v; }
  return '#888';
}

function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = `toast show ${type}`;
  setTimeout(() => el.classList.remove('show'), 3000);
}

function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }
function closeModalOnOverlay(e, id) { if (e.target === document.getElementById(id)) closeModal(id); }

// ==================== INIT ====================
window.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  loadBanners();
  loadProducts(true);
});
