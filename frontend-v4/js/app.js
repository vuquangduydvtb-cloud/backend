const API = '/api';
let currentUser = null;
let cartData = { items: [], total: 0, count: 0 };
let products = [];
let currentOffset = 0;
const PAGE_SIZE = 12;
let searchTimeout = null;
let storeSettings = {};
let dropdownTimer = null;
let currentCondition = 'all';
let currentCategory = 'all';

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
    if (currentUser.role === 'admin') showAdminButtons();
  } catch { renderNavGuest(); }
}

function showAdminButtons() {
  document.getElementById('adminBannerBtn').style.display = 'block';
  document.getElementById('adminAddProductBtn').style.display = 'block';
}

function renderNavGuest() {
  document.getElementById('navUser').innerHTML = `
    <button class="nav-icon-btn" onclick="openModal('loginModal')">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      <span class="nav-icon-label">Đăng nhập</span>
    </button>`;
}

function renderNavUser() {
  const isAdmin = currentUser.role === 'admin';
  document.getElementById('navUser').innerHTML = `
    <div class="nav-user-wrap" id="userWrap">
      <button class="user-menu-btn" id="userMenuBtn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        <span class="nav-icon-label">${isAdmin ? '👑 ' : ''}${currentUser.name.split(' ').pop()}</span>
      </button>
      <div class="user-dropdown" id="userDropdown">
        ${isAdmin ? `<a href="/admin" target="_blank">🔧 Trang Admin</a>` : ''}
        <a href="#" onclick="showOrders();return false">📦 Đơn hàng của tôi</a>
        <button onclick="openModal('changePasswordModal')">🔐 Đổi mật khẩu</button>
        <button onclick="doLogout()">🚪 Đăng xuất</button>
      </div>
    </div>`;

  const wrap = document.getElementById('userWrap');
  wrap.addEventListener('mouseenter', () => {
    clearTimeout(dropdownTimer);
    document.getElementById('userDropdown')?.classList.add('open');
  });
  wrap.addEventListener('mouseleave', () => {
    dropdownTimer = setTimeout(() => {
      document.getElementById('userDropdown')?.classList.remove('open');
    }, 200);
  });
}

// Login view switch (không dùng tab, dùng view thay thế)
function switchLoginView(view) {
  document.getElementById('loginView').style.display = view === 'login' ? 'block' : 'none';
  document.getElementById('registerView').style.display = view === 'register' ? 'block' : 'none';
  document.getElementById('loginError').classList.remove('visible');
  document.getElementById('regError')?.classList.remove('visible');
}

// Legacy switchTab support
function switchTab(tab) { switchLoginView(tab); }

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
    setToken(data.token); currentUser = data.user;
    renderNavUser(); closeModal('loginModal');
    loadCart(); loadRecommendations();
    if (data.user.role === 'admin') showAdminButtons();
    toast(`Chào mừng ${data.user.name}! 👋`, 'success');
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
    setToken(data.token); currentUser = data.user;
    renderNavUser(); closeModal('loginModal');
    loadCart(); loadRecommendations();
    toast('Tạo tài khoản thành công! 🎉', 'success');
  } catch { errEl.textContent = 'Lỗi kết nối'; errEl.classList.add('visible'); }
}

function doLogout() {
  clearToken(); currentUser = null; cartData = { items: [], total: 0, count: 0 };
  renderNavGuest(); updateCartBadge(0);
  document.getElementById('recommendSection').style.display = 'none';
  document.getElementById('adminBannerBtn').style.display = 'none';
  document.getElementById('adminAddProductBtn').style.display = 'none';
  toast('Đã đăng xuất');
}

async function doChangePassword(e) {
  e.preventDefault();
  const oldPassword = document.getElementById('cpOldPassword').value;
  const newPassword = document.getElementById('cpNewPassword').value;
  const confirmPassword = document.getElementById('cpConfirmPassword').value;
  const errEl = document.getElementById('cpError');
  errEl.classList.remove('visible');

  if (newPassword !== confirmPassword) {
    errEl.textContent = 'Mật khẩu mới không khớp';
    errEl.classList.add('visible');
    return;
  }

  try {
    const res = await fetch(`${API}/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`
      },
      body: JSON.stringify({ oldPassword, newPassword, confirmPassword })
    });
    const data = await res.json();
    if (!res.ok) {
      errEl.textContent = data.error || 'Lỗi đổi mật khẩu';
      errEl.classList.add('visible');
      return;
    }
    closeModal('changePasswordModal');
    document.getElementById('changePasswordForm').reset();
    toast('Đã đổi mật khẩu thành công! 🎉', 'success');
  } catch (err) {
    errEl.textContent = 'Lỗi kết nối';
    errEl.classList.add('visible');
  }
}

// ===== CATEGORY DROPDOWN =====
function toggleCategoryDropdown() {
  const dropdown = document.getElementById('categoryDropdown');
  dropdown.classList.toggle('open');
}

function filterByCategory(category) {
  currentCategory = category;
  loadProducts(true);
  document.getElementById('categoryDropdown').classList.remove('open');
}

function filterByiPhoneModel(model) {
  const modelMap = {
    'iphone17': 'iPhone 17',
    'iphone16': 'iPhone 16',
    'iphone15': 'iPhone 15',
    'iphone14': 'iPhone 14',
    'iphone13': 'iPhone 13',
    'iphone12': 'iPhone 12'
  };
  const searchQuery = modelMap[model] || model;
  document.getElementById('searchInput').value = searchQuery;
  currentOffset = 0;
  products = [];
  loadProducts(true);
  document.getElementById('categoryDropdown').classList.remove('open');
  document.getElementById('searchInput').focus();
}

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.category-dropdown-wrapper') && !e.target.closest('.category-dropdown-btn')) {
    document.getElementById('categoryDropdown')?.classList.remove('open');
  }
});

// ==================== PRODUCTS ====================
function setCondition(condition, el) {
  currentCondition = condition;
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  loadProducts(true);
}

async function loadProducts(reset = false) {
  if (reset) { currentOffset = 0; products = []; }
  const q = document.getElementById('searchInput').value;
  const sort = document.getElementById('sortSelect').value;
  const params = new URLSearchParams({ limit: PAGE_SIZE, offset: currentOffset, sort });
  if (q) params.append('q', q);
  if (currentCondition !== 'all') params.append('condition', currentCondition);
  if (currentCategory !== 'all') params.append('category', currentCategory);
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
  } catch {}
}

function renderProducts(reset) {
  const grid = document.getElementById('productGrid');
  if (reset) grid.innerHTML = '';
  if (products.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:60px;color:var(--gray)">Không tìm thấy sản phẩm nào 🔍</div>';
    return;
  }
  const isAdmin = currentUser?.role === 'admin';
  products.forEach(p => {
    const img = p.images?.[0]
      ? `<img src="${p.images[0]}" alt="${p.name}" onerror="this.parentElement.innerHTML='<div class=phone-placeholder>📱</div>'">`
      : '<div class="phone-placeholder">📱</div>';
    const badge = p.condition === 'used' ? 'badge-used">Hàng cũ'
      : p.stock < 5 ? 'badge-hot">Sắp hết' : 'badge-new">Mới';
    const colors = (p.colors || []).slice(0, 5).map((c, i) =>
      `<div class="color-dot ${i===0?'active':''}" style="background:${colorToHex(c)}" title="${c}" onclick="selectColor(event,${p.id})"></div>`
    ).join('');
    const discount = p.original_price > p.price
      ? `<div class="product-price-old">${fmt(p.original_price)}</div>` : '';
    const adminOverlay = isAdmin
      ? `<div class="card-admin-overlay"><button class="card-admin-edit-btn" onclick="event.stopPropagation();openAdminProductInfo(${p.id})">✏️ Sửa</button></div>`
      : '';
    const card = document.createElement('div');
    card.className = 'product-card'; card.setAttribute('data-id', p.id);
    card.innerHTML = `
      ${adminOverlay}
      <span class="product-badge ${badge}</span>
      <div class="product-img-area" onclick="openProductDetail(${p.id})">${img}</div>
      <div class="product-name" onclick="openProductDetail(${p.id})">${p.name}</div>
      <div class="product-sub">${p.description || ''}</div>
      <div class="product-price">${fmt(p.price)}</div>
      ${discount}
      <div class="product-colors">${colors}</div>
      <button class="add-cart-btn" onclick="addToCart(${p.id})" ${p.stock===0?'disabled':''}>
        ${p.stock > 0 ? 'Thêm vào giỏ hàng' : 'Hết hàng'}
      </button>`;
    grid.appendChild(card);
  });
}

function loadMore() { loadProducts(false); }
function doSearch() { loadProducts(true); }
function filterBy(condition) {
  currentCondition = condition;
  document.querySelectorAll('.filter-chip').forEach((c, i) =>
    c.classList.toggle('active', (condition === 'all' && i === 0) || (condition === 'new' && i === 1) || (condition === 'used' && i === 2))
  );
  loadProducts(true);
  document.getElementById('products').scrollIntoView({ behavior: 'smooth' });
}

// Live search
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('searchInput');
  const sugg = document.getElementById('searchSuggestions');
  if (!input) return;
  input.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const q = input.value.trim();
    if (q.length < 2) { sugg.classList.remove('visible'); return; }
    searchTimeout = setTimeout(async () => {
      try {
        const res = await fetch(`${API}/products?q=${encodeURIComponent(q)}&limit=5`);
        const data = await res.json();
        sugg.innerHTML = data.products.map(p =>
          `<div class="suggestion-item" onclick="openProductDetail(${p.id});sugg.classList.remove('visible')">
            <span style="font-size:1.2rem">📱</span>
            <div>
              <div style="font-size:0.85rem;font-weight:500">${p.name}</div>
              <div style="font-size:0.75rem;color:var(--gold)">${fmt(p.price)}</div>
            </div>
          </div>`
        ).join('') || '<div class="suggestion-item" style="color:var(--gray)">Không có kết quả</div>';
        sugg.classList.add('visible');
      } catch {}
    }, 280);
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.nav-search-wrap')) sugg.classList.remove('visible');
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { doSearch(); sugg.classList.remove('visible'); }
  });
});

// ==================== PRODUCT DETAIL ====================
async function openProductDetail(id) {
  const token = getToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${API}/products/${id}`, { headers });
  const p = await res.json();
  const isAdmin = currentUser?.role === 'admin';
  const imgs = p.images?.length > 0 ? p.images : [];
  const mainImg = imgs[0] ? `<img src="${imgs[0]}" alt="${p.name}">` : '<div style="font-size:5rem">📱</div>';
  const thumbs = imgs.map(img =>
    `<div class="pd-thumb" onclick="switchMainImg('${img}')"><img src="${img}" style="width:100%;height:100%;object-fit:cover"></div>`
  ).join('') || '<div class="pd-thumb">📱</div>';
  const colorChips = (p.colors || []).map((c, i) =>
    `<div class="pd-color-chip ${i===0?'active':''}" onclick="selectPdColor(this)">${c}</div>`
  ).join('');
  const specs = Object.entries(p.specs || {}).map(([k, v]) =>
    `<div class="pd-spec-row"><span>${k}</span><span>${v}</span></div>`
  ).join('');
  const stockText = p.stock === 0
    ? '<span class="stock-dot stock-out"></span>Hết hàng'
    : p.stock <= 3 ? `<span class="stock-dot stock-low"></span>Sắp hết (còn ${p.stock})`
    : `<span class="stock-dot stock-in"></span>Còn hàng (${p.stock} máy)`;
  const adminBtn = isAdmin
    ? `<button class="pd-admin-edit" onclick="openAdminProductInfo(${p.id})">✏️ Chỉnh sửa thông tin</button>` : '';

  document.getElementById('productModalContent').innerHTML = `
    <div class="pd-grid">
      <div class="pd-images">
        <div class="pd-main-img" id="pdMainImg">${mainImg}</div>
        <div class="pd-thumbs">${thumbs}</div>
      </div>
      <div class="pd-info">
        ${adminBtn}
        <div class="stock-badge">${stockText}</div>
        <h2 class="pd-title">${p.name}</h2>
        <span class="product-badge ${p.condition==='new'?'badge-new':'badge-used'} pd-condition">${p.condition==='new'?'Hàng mới':'Hàng cũ'}</span>
        <div class="pd-price">${fmt(p.price)}</div>
        ${p.original_price > p.price ? `<div class="pd-orig">${fmt(p.original_price)}</div>` : ''}
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
  document.getElementById('pdMainImg').innerHTML = `<img src="${src}" style="max-height:260px;object-fit:contain">`;
}
function selectPdColor(el) {
  document.querySelectorAll('.pd-color-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
}
function addToCartFromDetail(id) {
  const color = document.querySelector('.pd-color-chip.active')?.textContent || '';
  addToCart(id, color);
}
function closeProductModal(e) {
  if (e.target === document.getElementById('productModal'))
    document.getElementById('productModal').classList.remove('active');
}

// ==================== ADMIN EDIT ====================
async function openAdminProductInfo(id) {
  const res = await fetch(`${API}/products/${id}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  const p = await res.json();
  document.getElementById('ai_product_id').value = p.id;
  document.getElementById('ai_name').value = p.name || '';
  document.getElementById('ai_price').value = p.price || '';
  document.getElementById('ai_stock').value = p.stock || 0;
  document.getElementById('ai_desc').value = p.description || '';
  document.getElementById('ai_specs').value = p.specs ? JSON.stringify(p.specs, null, 2) : '';
  document.getElementById('ai_images').value = '';
  document.getElementById('ai_current_imgs').innerHTML = (p.images || []).map(img =>
    `<img src="${img}" style="width:60px;height:60px;object-fit:cover;border-radius:8px;border:1px solid var(--border2)" onerror="this.style.display='none'">`
  ).join('');
  document.getElementById('aiError').classList.remove('visible');
  closeModal('productModal');
  openModal('adminInfoModal');
}

async function submitAdminProductInfo(e) {
  e.preventDefault();
  const id = document.getElementById('ai_product_id').value;
  const fd = new FormData();
  fd.append('name', document.getElementById('ai_name').value);
  fd.append('price', document.getElementById('ai_price').value);
  fd.append('stock', document.getElementById('ai_stock').value);
  fd.append('description', document.getElementById('ai_desc').value);
  try { fd.append('specs', JSON.stringify(JSON.parse(document.getElementById('ai_specs').value || '{}'))); }
  catch { fd.append('specs', '{}'); }
  for (const f of document.getElementById('ai_images').files) fd.append('images', f);
  const res = await fetch(`${API}/admin/products/${id}`, {
    method: 'PUT', headers: { Authorization: `Bearer ${getToken()}` }, body: fd
  });
  if (res.ok) { closeModal('adminInfoModal'); loadProducts(true); toast('Cập nhật thành công! ✅', 'success'); }
  else { const d = await res.json(); const el = document.getElementById('aiError'); el.textContent = d.error; el.classList.add('visible'); }
}

function openAdminBannerForm() { openModal('adminBannerModal'); }

async function submitAdminBanner(e) {
  e.preventDefault();
  const fd = new FormData();
  fd.append('title', document.getElementById('ab_title').value);
  fd.append('subtitle', document.getElementById('ab_subtitle').value);
  fd.append('link', document.getElementById('ab_link').value);
  fd.append('order_num', 0);
  const file = document.getElementById('ab_image').files[0];
  if (file) fd.append('image', file);
  const res = await fetch(`${API}/admin/banners`, {
    method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: fd
  });
  if (res.ok) { closeModal('adminBannerModal'); loadBanners(); toast('Thêm banner thành công! ✅', 'success'); }
  else { const d = await res.json(); const el = document.getElementById('abError'); el.textContent = d.error; el.classList.add('visible'); }
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
  el.textContent = n; el.style.display = n > 0 ? 'flex' : 'none';
}

function renderCartItems() {
  const body = document.getElementById('cartBody');
  const footer = document.getElementById('cartFooter');
  if (!cartData.items?.length) { body.innerHTML = '<p class="empty-msg">Giỏ hàng trống 🛒</p>'; footer.style.display = 'none'; return; }
  body.innerHTML = cartData.items.map(item => {
    const imgHtml = item.images?.[0] ? `<img src="${item.images[0]}" alt="" onerror="this.parentElement.innerHTML='📱'">` : '📱';
    return `<div class="cart-item">
      <div class="cart-item-img">${imgHtml}</div>
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
      <button class="cart-item-del" onclick="removeCartItem(${item.id})">✕</button>
    </div>`;
  }).join('');
  document.getElementById('cartTotal').textContent = fmt(cartData.total);
  footer.style.display = 'block';
}

async function addToCart(productId, color = '') {
  if (!getToken()) { openModal('loginModal'); toast('Vui lòng đăng nhập để mua hàng', 'error'); return; }
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
  await fetch(`${API}/cart/${itemId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` }, body: JSON.stringify({ quantity: qty }) });
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

function selectColor(e, productId) {
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
  openCheckoutModal([{ product_id: p.id, name: p.name, price: p.price, quantity: 1, color }], p.price);
}

let checkoutItems = [], checkoutTotal = 0, selectedPayment = 'cod';

async function openCheckoutModal(items, total) {
  checkoutItems = items; checkoutTotal = total;
  try {
    const res = await fetch(`${API}/admin/settings`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (res.ok) storeSettings = await res.json();
  } catch {}
  document.getElementById('checkoutTitle').textContent = 'Đặt hàng';
  document.getElementById('checkoutContent').innerHTML = renderCheckoutForm();
  openModal('checkoutModal');
  selectedPayment = 'cod'; renderPaymentDetail();
}

function renderCheckoutForm() {
  const user = currentUser;
  return `
    <div class="checkout-summary">
      ${checkoutItems.map(i=>`<div class="checkout-item"><span>${i.name} × ${i.quantity}</span><span>${fmt(i.price*i.quantity)}</span></div>`).join('')}
      <div class="checkout-item"><span>Tổng cộng</span><span>${fmt(checkoutTotal)}</span></div>
    </div>
    <h4 style="margin-bottom:14px;font-size:0.73rem;color:var(--gray);letter-spacing:2px;text-transform:uppercase">Thanh toán</h4>
    <div class="payment-methods">
      <div class="pm-option selected" onclick="selectPayment('cod',this)"><div class="pm-icon">🚚</div><div class="pm-name">COD</div><div class="pm-sub">Thanh toán khi nhận</div></div>
      <div class="pm-option" onclick="selectPayment('deposit',this)"><div class="pm-icon">🔒</div><div class="pm-name">Đặt cọc</div><div class="pm-sub">Giữ máy 2 tuần</div></div>
      <div class="pm-option" onclick="selectPayment('qr',this)"><div class="pm-icon">📱</div><div class="pm-name">QR</div><div class="pm-sub">Momo / ZaloPay</div></div>
    </div>
    <div id="paymentDetail"></div>
    <h4 style="margin:20px 0 14px;font-size:0.73rem;color:var(--gray);letter-spacing:2px;text-transform:uppercase">Thông tin giao hàng</h4>
    <div class="form-row">
      <div class="form-group"><label>Họ tên</label><input type="text" id="ck_name" value="${user?.name||''}" required></div>
      <div class="form-group"><label>Điện thoại</label><input type="tel" id="ck_phone" value="${user?.phone||''}"></div>
    </div>
    <div class="form-group"><label>Địa chỉ giao hàng</label><input type="text" id="ck_addr" value="${user?.address||''}" placeholder="Số nhà, đường, phường, quận, tỉnh/TP" required></div>
    <div class="form-group"><label>Ghi chú</label><textarea id="ck_note" placeholder="Yêu cầu đặc biệt..."></textarea></div>
    <div id="checkoutError" class="form-error"></div>
    <button class="btn-primary w100 mt16" onclick="placeOrder()">Xác nhận đặt hàng</button>`;
}

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
    el.innerHTML = `<div class="deposit-info">💡 Đặt cọc <strong>${fmt(checkoutTotal * pct / 100)}</strong> (${pct}%). Giữ máy tối đa <strong>${days} ngày</strong>.</div>`;
  } else if (selectedPayment === 'qr') {
    const hasMomo = storeSettings.momo_qr, hasZalo = storeSettings.zalopay_qr;
    el.innerHTML = `<div class="qr-section">
      <div class="qr-tabs">
        ${hasMomo ? `<button class="qr-tab active" onclick="showQr('momo',this)">Momo</button>` : ''}
        ${hasZalo ? `<button class="qr-tab ${!hasMomo?'active':''}" onclick="showQr('zalopay',this)">ZaloPay</button>` : ''}
      </div>
      <div id="qrImgWrap">${hasMomo ? `<img src="${hasMomo}" alt="Momo QR">` : '<p style="color:var(--gray)">Admin chưa cấu hình QR</p>'}</div>
      <p style="font-size:0.78rem;color:var(--gold);margin-top:10px">Nội dung CK: iStore_${Date.now()}</p>
    </div>`;
  } else { el.innerHTML = ''; }
}

function showQr(type, btn) {
  document.querySelectorAll('.qr-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  const src = type === 'momo' ? storeSettings.momo_qr : storeSettings.zalopay_qr;
  document.getElementById('qrImgWrap').innerHTML = src ? `<img src="${src}">` : '<p style="color:var(--gray)">Chưa cấu hình</p>';
}

async function placeOrder() {
  const name = document.getElementById('ck_name')?.value.trim();
  const phone = document.getElementById('ck_phone')?.value.trim();
  const addr = document.getElementById('ck_addr')?.value.trim();
  const note = document.getElementById('ck_note')?.value.trim();
  const errEl = document.getElementById('checkoutError');
  if (!name || !addr) { errEl.textContent = 'Vui lòng điền đầy đủ thông tin'; errEl.classList.add('visible'); return; }
  errEl.classList.remove('visible');
  try {
    const res = await fetch(`${API}/orders`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ payment_method: selectedPayment, shipping_name: name, shipping_phone: phone, shipping_address: addr, note, items: checkoutItems })
    });
    const order = await res.json();
    if (!res.ok) { errEl.textContent = order.error; errEl.classList.add('visible'); return; }
    await loadCart();
    let extra = '';
    if (selectedPayment === 'deposit' && order.deposit_note) extra = `<div class="deposit-info" style="margin-top:16px">${order.deposit_note}</div>`;
    document.getElementById('checkoutContent').innerHTML = `
      <div class="order-success">
        <div class="success-icon">✅</div>
        <h3>Đặt hàng thành công!</h3>
        <p style="color:var(--gray);margin-bottom:6px">Mã đơn: <strong style="color:var(--gold)">#${order.id}</strong></p>
        <p style="color:var(--gray);font-size:0.85rem;margin-bottom:16px">Chúng tôi sẽ liên hệ xác nhận trong 30 phút.</p>
        ${extra}
        <button class="btn-outline mt16" onclick="closeModal('checkoutModal')">Tiếp tục mua sắm</button>
      </div>`;
    toast('Đặt hàng thành công! 🎉', 'success');
  } catch { errEl.textContent = 'Lỗi kết nối'; errEl.classList.add('visible'); }
}

// ==================== RECOMMENDATIONS ====================
async function loadRecommendations() {
  if (!getToken()) return;
  try {
    const res = await fetch(`${API}/products/recommend/personal`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!res.ok) return;
    const recs = await res.json();
    if (!recs.length) return;
    const section = document.getElementById('recommendSection');
    const grid = document.getElementById('recommendGrid');
    section.style.display = 'block'; grid.innerHTML = '';
    recs.forEach(p => {
      const img = p.images?.[0] ? `<img src="${p.images[0]}" onerror="this.parentElement.innerHTML='<div class=phone-placeholder>📱</div>'">` : '<div class="phone-placeholder">📱</div>';
      const card = document.createElement('div');
      card.className = 'product-card'; card.setAttribute('data-id', p.id);
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
  if (!getToken()) { openModal('loginModal'); return; }
  const res = await fetch(`${API}/orders/my`, { headers: { Authorization: `Bearer ${getToken()}` } });
  const orders = await res.json();
  const sMap = { pending:'Chờ xác nhận', confirmed:'Đã xác nhận', shipping:'Đang giao', delivered:'Đã giao', cancelled:'Đã hủy' };
  const sColor = { pending:'#f59e0b', confirmed:'var(--gold)', shipping:'#60a5fa', delivered:'var(--success)', cancelled:'var(--danger)' };
  document.getElementById('checkoutTitle').textContent = 'Đơn hàng của tôi';
  document.getElementById('checkoutContent').innerHTML = !orders.length
    ? '<p style="text-align:center;color:var(--gray);padding:40px 0">Bạn chưa có đơn hàng nào</p>'
    : orders.map(o => `
      <div style="border:1.5px solid var(--border2);border-radius:14px;padding:16px;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="font-size:0.8rem;color:var(--gray)">Đơn #${o.id} · ${new Date(o.created_at).toLocaleDateString('vi-VN')}</span>
          <span style="font-size:0.75rem;color:${sColor[o.status]};font-weight:600">${sMap[o.status]||o.status}</span>
        </div>
        ${o.items.map(i=>`<div style="font-size:0.83rem;padding:4px 0;border-bottom:1px solid var(--border2)">${i.name} × ${i.quantity}</div>`).join('')}
        <div style="display:flex;justify-content:space-between;margin-top:10px">
          <span style="font-size:0.82rem;color:var(--gray)">Tổng:</span>
          <strong style="color:var(--gold)">${fmt(o.total)}</strong>
        </div>
      </div>`).join('');
  openModal('checkoutModal');
}

// ==================== BANNERS ====================
async function loadBanners() {
  try {
    const res = await fetch(`${API}/banners`);
    const banners = await res.json();
    if (!banners.length) return;
    const slider = document.getElementById('bannerSlider');
    slider.innerHTML = banners.map((b, i) => `
      <div style="display:${i===0?'flex':'none'};min-height:60vh;position:relative;align-items:center;overflow:hidden">
        ${b.image ? `<img src="${b.image}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0.45">` : ''}
        <div style="position:relative;z-index:2;padding:80px;max-width:640px">
          ${b.title ? `<h1 class="banner-title">${b.title}</h1>` : ''}
          ${b.subtitle ? `<p class="banner-sub">${b.subtitle}</p>` : ''}
          ${b.link ? `<a href="${b.link}" class="btn-primary" style="margin-top:20px">Xem ngay</a>` : ''}
        </div>
      </div>`).join('');
    if (banners.length > 1) {
      let cur = 0;
      setInterval(() => {
        slider.children[cur].style.display = 'none';
        cur = (cur+1) % banners.length;
        slider.children[cur].style.display = 'flex';
      }, 5000);
    }
  } catch {}
}

// ==================== UTILS ====================
function fmt(n) { return new Intl.NumberFormat('vi-VN').format(Math.round(n)) + '₫'; }
function colorToHex(name) {
  const map = {'đen':'#1a1a1a','trắng':'#e8e8e8','vàng':'#c9a84c','đỏ':'#c0392b','xanh dương':'#2980b9','xanh lá':'#27ae60','hồng':'#e91e8c','tím':'#8e44ad','cam':'#e67e22','bạc':'#bdc3c7','titan':'#8d7b6b','titan sa mạc':'#9d8b7b','titan đen':'#2c2c2c','titan trắng':'#d0d0d0','titan tự nhiên':'#a09070'};
  const lower = name.toLowerCase();
  for (const [k,v] of Object.entries(map)) if (lower.includes(k)) return v;
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

// ==================== STORE SETTINGS ====================
async function loadStoreSettings() {
  try {
    const res = await fetch(`${API}/admin/settings`);
    if (res.ok) {
      const settings = await res.json();
      storeSettings = settings;
      if (settings.store_email) {
        const emailLink = document.getElementById('footerEmail');
        if (emailLink) {
          emailLink.href = `mailto:${settings.store_email}`;
          emailLink.textContent = settings.store_email;
        }
      }
    }
  } catch {}
}

// ==================== INIT ====================
window.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  loadStoreSettings();
  loadBanners();
  loadProducts(true);
});
