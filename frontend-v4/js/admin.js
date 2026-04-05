const API = '/api';
let adminToken = null;
let revenueChart = null;
let prodSearchTimeout = null;

// ==================== AUTH ====================
async function adminLogin(e) {
  e.preventDefault();
  const email = document.getElementById('aEmail').value;
  const password = document.getElementById('aPass').value;
  const errEl = document.getElementById('aError');

  try {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok || data.user?.role !== 'admin') {
      errEl.textContent = data.user?.role !== 'admin' ? 'Tài khoản không có quyền admin' : data.error;
      errEl.classList.add('visible'); return;
    }
    adminToken = data.token;
    localStorage.setItem('admin_token', adminToken);
    showDashboard();
  } catch { errEl.textContent = 'Lỗi kết nối'; errEl.classList.add('visible'); }
}

function adminLogout() {
  adminToken = null; localStorage.removeItem('admin_token');
  document.getElementById('adminDash').style.display = 'none';
  document.getElementById('adminLoginWrap').style.display = 'flex';
}

async function adminChangePassword(e) {
  e.preventDefault();
  const oldPassword = document.getElementById('acpOldPassword').value;
  const newPassword = document.getElementById('acpNewPassword').value;
  const confirmPassword = document.getElementById('acpConfirmPassword').value;
  const errEl = document.getElementById('acpError');
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
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ oldPassword, newPassword, confirmPassword })
    });
    const data = await res.json();
    if (!res.ok) {
      errEl.textContent = data.error || 'Lỗi đổi mật khẩu';
      errEl.classList.add('visible');
      return;
    }
    closeModal('adminChangePasswordModal');
    document.getElementById('adminChangePasswordForm').reset();
    toast('Đã đổi mật khẩu thành công! 🎉', 'success');
  } catch (err) {
    errEl.textContent = 'Lỗi kết nối';
    errEl.classList.add('visible');
  }
}

function authH() { return { Authorization: `Bearer ${adminToken}` }; }

function showDashboard() {
  document.getElementById('adminLoginWrap').style.display = 'none';
  document.getElementById('adminDash').style.display = 'flex';
  loadStats();
}

// ==================== NAVIGATION ====================
function showPage(name, el) {
  document.querySelectorAll('.admin-page').forEach(p => p.style.display = 'none');
  document.querySelectorAll('.snav-item').forEach(a => a.classList.remove('active'));
  document.getElementById(`page-${name}`).style.display = 'block';
  el.classList.add('active');

  if (name === 'stats') loadStats();
  if (name === 'products') loadAdminProducts();
  if (name === 'banners') loadAdminBanners();
  if (name === 'orders') loadAdminOrders();
  if (name === 'users') loadAdminUsers();
  if (name === 'settings') loadAdminSettings();
  return false;
}

// ==================== STATS ====================
async function loadStats() {
  const res = await fetch(`${API}/admin/stats`, { headers: authH() });
  const data = await res.json();

  document.getElementById('statCards').innerHTML = `
    <div class="stat-card"><div class="sc-label">Tổng doanh thu</div><div class="sc-value stat-gold">${fmt(data.totalRevenue)}</div><div class="sc-sub">Không tính đơn hủy</div></div>
    <div class="stat-card"><div class="sc-label">Tổng đơn hàng</div><div class="sc-value">${data.totalOrders}</div><div class="sc-sub">${data.pendingOrders} chờ xác nhận</div></div>
    <div class="stat-card"><div class="sc-label">Khách hàng</div><div class="sc-value stat-green">${data.totalUsers}</div><div class="sc-sub">Đã đăng ký</div></div>
    <div class="stat-card"><div class="sc-label">Sản phẩm active</div><div class="sc-value">${data.totalProducts}</div><div class="sc-sub">${data.lowStock} sắp hết hàng</div></div>
    <div class="stat-card"><div class="sc-label">Chờ xác nhận</div><div class="sc-value stat-red">${data.pendingOrders}</div><div class="sc-sub">Đơn hàng mới</div></div>
    <div class="stat-card"><div class="sc-label">Tồn kho thấp</div><div class="sc-value ${data.lowStock>0?'stat-red':''}">${data.lowStock}</div><div class="sc-sub">≤3 sản phẩm</div></div>`;

  // Revenue chart
  const ctx = document.getElementById('revenueChart').getContext('2d');
  if (revenueChart) revenueChart.destroy();
  revenueChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.revenueByDay.map(d => new Date(d.date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })),
      datasets: [{
        label: 'Doanh thu (₫)',
        data: data.revenueByDay.map(d => d.revenue),
        backgroundColor: 'rgba(201,168,76,0.35)',
        borderColor: '#c9a84c', borderWidth: 1, borderRadius: 4
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#888', font: { size: 11 } } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#888', font: { size: 11 }, callback: v => (v/1000000).toFixed(1)+'M' } }
      }
    }
  });

  // Recent orders
  const statusMap = { pending:'s-pending', confirmed:'s-confirmed', shipping:'s-shipping', delivered:'s-delivered', cancelled:'s-cancelled' };
  const statusLabel = { pending:'Chờ', confirmed:'Xác nhận', shipping:'Đang giao', delivered:'Đã giao', cancelled:'Hủy' };
  document.getElementById('recentOrdersList').innerHTML = data.recentOrders.map(o => `
    <div class="recent-order">
      <div><span style="color:var(--gray);font-size:0.75rem">#${o.id}</span> ${o.user_name}</div>
      <div style="display:flex;align-items:center;gap:10px">
        <span style="color:var(--gold);font-size:0.85rem">${fmt(o.total)}</span>
        <span class="status-pill ${statusMap[o.status]||''}">${statusLabel[o.status]||o.status}</span>
      </div>
    </div>`).join('') || '<p style="color:var(--gray);text-align:center;padding:20px">Chưa có đơn hàng</p>';
}

// ==================== PRODUCTS ====================
async function loadAdminProducts(q = '') {
  const params = new URLSearchParams({ limit: 50 });
  if (q) params.append('q', q);
  const res = await fetch(`${API}/admin/products?${params}`, { headers: authH() });
  const data = await res.json();

  const table = document.getElementById('productTable');
  table.innerHTML = `
    <thead><tr>
      <th>Ảnh</th><th>Tên sản phẩm</th><th>Giá bán</th><th>Tình trạng</th>
      <th>Tồn kho</th><th>Trạng thái</th><th>Thao tác</th>
    </tr></thead>
    <tbody>${data.products.map(p => `
      <tr>
        <td><div class="tbl-img">${p.images?.[0]?`<img src="${p.images[0]}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:4px" onerror="this.parentElement.innerHTML='📱'">`:'📱'}</div></td>
        <td><strong>${p.name}</strong></td>
        <td style="color:var(--gold)">${fmt(p.price)}</td>
        <td><span class="status-pill ${p.condition==='new'?'s-new':'s-used'}">${p.condition==='new'?'Mới':'Cũ'}</span></td>
        <td><span style="color:${p.stock<=3?'var(--danger)':p.stock<=10?'#f59e0b':'var(--success)'}">${p.stock}</span></td>
        <td><span class="status-pill ${p.is_active?'s-confirmed':'s-cancelled'}">${p.is_active?'Đang bán':'Ẩn'}</span></td>
        <td><div class="tbl-actions">
          <button class="tbl-btn" onclick="editProduct(${p.id})">✏️ Sửa</button>
          <button class="tbl-btn danger" onclick="toggleProduct(${p.id},${p.is_active})">${p.is_active?'Ẩn':'Hiện'}</button>
        </div></td>
      </tr>`).join('')}
    </tbody>`;
}

function searchAdminProducts() {
  clearTimeout(prodSearchTimeout);
  prodSearchTimeout = setTimeout(() => loadAdminProducts(document.getElementById('prodSearch').value), 300);
}

let editingProductData = null;
function openProductForm(product = null) {
  editingProductData = product;
  document.getElementById('pfTitle').textContent = product ? 'Sửa sản phẩm' : 'Thêm sản phẩm';
  document.getElementById('pf_id').value = product?.id || '';
  document.getElementById('pf_name').value = product?.name || '';
  document.getElementById('pf_price').value = product?.price || '';
  document.getElementById('pf_orig').value = product?.original_price || '';
  document.getElementById('pf_stock').value = product?.stock ?? 0;
  document.getElementById('pf_condition').value = product?.condition || 'new';
  document.getElementById('pf_cat').value = product?.category || 'iphone';
  document.getElementById('pf_desc').value = product?.description || '';
  document.getElementById('pf_colors').value = Array.isArray(product?.colors) ? product.colors.join(', ') : '';
  document.getElementById('pf_specs').value = product?.specs ? JSON.stringify(product.specs, null, 2) : '';
  document.getElementById('pf_images').value = '';

  // Show existing images
  const existImgs = document.getElementById('pf_existing_imgs');
  if (product?.images?.length) {
    existImgs.innerHTML = product.images.map(img =>
      `<div style="position:relative"><img src="${img}" style="width:60px;height:60px;object-fit:cover;border-radius:6px" onerror="this.src=''"><button onclick="removeExistImg(this,'${img}')" style="position:absolute;top:-4px;right:-4px;background:var(--danger);color:#fff;border:none;border-radius:50%;width:16px;height:16px;font-size:0.6rem;cursor:pointer">✕</button></div>`
    ).join('');
  } else { existImgs.innerHTML = ''; }

  document.getElementById('pfError').classList.remove('visible');
  openModal('productFormModal');
}

let removedImages = [];
function removeExistImg(btn, imgUrl) {
  removedImages.push(imgUrl);
  btn.parentElement.remove();
}

async function editProduct(id) {
  const res = await fetch(`${API}/admin/products?q=&limit=1000`, { headers: authH() });
  const data = await res.json();
  const p = data.products.find(x => x.id === id);
  if (p) { removedImages = []; openProductForm(p); }
}

async function submitProductForm(e) {
  e.preventDefault();
  const id = document.getElementById('pf_id').value;
  const fd = new FormData();
  fd.append('name', document.getElementById('pf_name').value);
  fd.append('price', document.getElementById('pf_price').value);
  fd.append('original_price', document.getElementById('pf_orig').value || document.getElementById('pf_price').value);
  fd.append('stock', document.getElementById('pf_stock').value);
  fd.append('condition', document.getElementById('pf_condition').value);
  fd.append('category', document.getElementById('pf_cat').value);
  fd.append('description', document.getElementById('pf_desc').value);

  const colorsRaw = document.getElementById('pf_colors').value;
  const colors = colorsRaw ? JSON.stringify(colorsRaw.split(',').map(c => c.trim()).filter(Boolean)) : '[]';
  fd.append('colors', colors);

  try {
    const specsRaw = document.getElementById('pf_specs').value;
    fd.append('specs', specsRaw ? JSON.stringify(JSON.parse(specsRaw)) : '{}');
  } catch { fd.append('specs', '{}'); }

  // Existing images (minus removed)
  if (id && editingProductData?.images) {
    const kept = editingProductData.images.filter(img => !removedImages.includes(img));
    fd.append('keep_images', JSON.stringify(kept));
  }

  const files = document.getElementById('pf_images').files;
  for (const f of files) fd.append('images', f);

  const url = id ? `${API}/admin/products/${id}` : `${API}/admin/products`;
  const method = id ? 'PUT' : 'POST';

  const res = await fetch(url, { method, headers: authH(), body: fd });
  const data = await res.json();
  if (!res.ok) {
    const errEl = document.getElementById('pfError');
    errEl.textContent = data.error; errEl.classList.add('visible'); return;
  }
  closeModal('productFormModal');
  loadAdminProducts();
  toast(id ? 'Cập nhật sản phẩm thành công' : 'Thêm sản phẩm thành công', 'success');
}

async function toggleProduct(id, isActive) {
  await fetch(`${API}/admin/products/${id}`, {
    method: 'PUT', headers: { ...authH(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_active: isActive ? 0 : 1 })
  });
  loadAdminProducts();
}

// ==================== BANNERS ====================
async function loadAdminBanners() {
  const res = await fetch(`${API}/admin/banners`, { headers: authH() });
  const banners = await res.json();
  document.getElementById('bannerList').innerHTML = banners.length ? banners.map(b => `
    <div class="banner-item">
      ${b.image ? `<img src="${b.image}" class="banner-thumb" alt="">` : '<div class="banner-thumb" style="display:flex;align-items:center;justify-content:center;font-size:1.5rem">🖼️</div>'}
      <div class="banner-item-info">
        <strong>${b.title || '(Không có tiêu đề)'}</strong>
        <span>${b.subtitle || ''}</span>
      </div>
      <div class="banner-item-actions">
        <span class="status-pill ${b.is_active?'s-confirmed':'s-cancelled'}" style="margin-right:6px">${b.is_active?'Hiển thị':'Ẩn'}</span>
        <button class="tbl-btn" onclick="editBanner(${b.id})">✏️ Sửa</button>
        <button class="tbl-btn danger" onclick="deleteBanner(${b.id})">🗑️ Xóa</button>
      </div>
    </div>`).join('') : '<p style="color:var(--gray);text-align:center;padding:40px">Chưa có banner. Thêm banner để hiển thị trên trang chủ.</p>';
}

let editingBannerId = null;
function openBannerForm(banner = null) {
  editingBannerId = banner?.id || null;
  document.getElementById('bfTitle').textContent = banner ? 'Sửa Banner' : 'Thêm Banner';
  document.getElementById('bf_id').value = banner?.id || '';
  document.getElementById('bf_title').value = banner?.title || '';
  document.getElementById('bf_subtitle').value = banner?.subtitle || '';
  document.getElementById('bf_link').value = banner?.link || '';
  document.getElementById('bf_order').value = banner?.order_num ?? 0;
  document.getElementById('bf_image').value = '';
  document.getElementById('bfError').classList.remove('visible');
  openModal('bannerFormModal');
}

async function editBanner(id) {
  const res = await fetch(`${API}/admin/banners`, { headers: authH() });
  const banners = await res.json();
  const b = banners.find(x => x.id === id);
  if (b) openBannerForm(b);
}

async function submitBannerForm(e) {
  e.preventDefault();
  const id = document.getElementById('bf_id').value;
  const fd = new FormData();
  fd.append('title', document.getElementById('bf_title').value);
  fd.append('subtitle', document.getElementById('bf_subtitle').value);
  fd.append('link', document.getElementById('bf_link').value);
  fd.append('order_num', document.getElementById('bf_order').value);
  const file = document.getElementById('bf_image').files[0];
  if (file) fd.append('image', file);

  const url = id ? `${API}/admin/banners/${id}` : `${API}/admin/banners`;
  const method = id ? 'PUT' : 'POST';
  const res = await fetch(url, { method, headers: authH(), body: fd });
  if (!res.ok) { const d = await res.json(); const err = document.getElementById('bfError'); err.textContent = d.error; err.classList.add('visible'); return; }
  closeModal('bannerFormModal');
  loadAdminBanners();
  toast('Lưu banner thành công', 'success');
}

async function deleteBanner(id) {
  if (!confirm('Xóa banner này?')) return;
  await fetch(`${API}/admin/banners/${id}`, { method: 'DELETE', headers: authH() });
  loadAdminBanners();
  toast('Đã xóa banner');
}

// ==================== ORDERS ====================
async function loadAdminOrders() {
  const status = document.getElementById('orderFilter').value;
  const params = new URLSearchParams({ limit: 100 });
  if (status) params.append('status', status);
  const res = await fetch(`${API}/admin/orders?${params}`, { headers: authH() });
  const data = await res.json();

  const statusMap = { pending:'s-pending Chờ xác nhận', confirmed:'s-confirmed Đã xác nhận', shipping:'s-shipping Đang giao', delivered:'s-delivered Đã giao', cancelled:'s-cancelled Đã hủy' };
  const pmMap = { cod:'COD', deposit:'Đặt cọc', qr:'QR' };

  document.getElementById('ordersTable').innerHTML = `
    <thead><tr><th>Đơn #</th><th>Khách hàng</th><th>Sản phẩm</th><th>Tổng tiền</th><th>Thanh toán</th><th>Trạng thái</th><th>Ngày đặt</th><th>Thao tác</th></tr></thead>
    <tbody>${data.orders.map(o => {
      const [sc, sl] = (statusMap[o.status] || 's-pending Chờ').split(' ');
      return `<tr>
        <td style="color:var(--gray)">#${o.id}</td>
        <td><div style="font-weight:500">${o.user_name}</div><div style="font-size:0.72rem;color:var(--gray)">${o.email}</div></td>
        <td style="font-size:0.78rem">${o.items.slice(0,2).map(i=>i.name).join('<br>')}</td>
        <td style="color:var(--gold);font-weight:500">${fmt(o.total)}</td>
        <td><span style="font-size:0.78rem">${pmMap[o.payment_method]||o.payment_method}</span></td>
        <td><span class="status-pill ${sc}">${sl}</span></td>
        <td style="font-size:0.78rem;color:var(--gray)">${new Date(o.created_at).toLocaleDateString('vi-VN')}</td>
        <td><select onchange="updateOrderStatus(${o.id},this.value)" style="background:var(--dark);border:1px solid var(--border2);color:var(--white);padding:5px 8px;border-radius:4px;font-size:0.72rem;cursor:pointer">
          <option value="">-- Cập nhật --</option>
          <option value="confirmed">Xác nhận</option>
          <option value="shipping">Đang giao</option>
          <option value="delivered">Đã giao</option>
          <option value="cancelled">Hủy đơn</option>
        </select></td>
      </tr>`;
    }).join('')}</tbody>`;
}

async function updateOrderStatus(id, status) {
  if (!status) return;
  await fetch(`${API}/admin/orders/${id}/status`, {
    method: 'PUT', headers: { ...authH(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  });
  loadAdminOrders();
  toast(`Cập nhật đơn #${id} → ${status}`, 'success');
}

// ==================== USERS ====================
async function loadAdminUsers() {
  const res = await fetch(`${API}/admin/users`, { headers: authH() });
  const users = await res.json();
  document.getElementById('usersTable').innerHTML = `
    <thead><tr><th>#</th><th>Họ tên</th><th>Email</th><th>Điện thoại</th><th>Vai trò</th><th>Ngày đăng ký</th></tr></thead>
    <tbody>${users.map(u => `<tr>
      <td style="color:var(--gray)">${u.id}</td>
      <td style="font-weight:500">${u.name}</td>
      <td style="color:var(--gray)">${u.email}</td>
      <td style="color:var(--gray)">${u.phone||'—'}</td>
      <td><span class="status-pill ${u.role==='admin'?'s-confirmed':'s-pending'}">${u.role}</span></td>
      <td style="font-size:0.78rem;color:var(--gray)">${new Date(u.created_at).toLocaleDateString('vi-VN')}</td>
    </tr>`).join('')}</tbody>`;
}

// ==================== SETTINGS ====================
async function loadAdminSettings() {
  const res = await fetch(`${API}/admin/settings`, { headers: authH() });
  const s = await res.json();
  document.getElementById('s_phone').value = s.store_phone || '';
  document.getElementById('s_zalo').value = s.store_zalo || '';
  document.getElementById('s_email').value = s.store_email || 'vuquangduydvtb@gmail.com';
  document.getElementById('s_dep_pct').value = s.deposit_percent || 30;
  document.getElementById('s_dep_days').value = s.deposit_days || 14;
  if (s.momo_qr) document.getElementById('prev_momo').innerHTML = `<img src="${s.momo_qr}" alt="Momo QR">`;
  if (s.zalopay_qr) document.getElementById('prev_zalopay').innerHTML = `<img src="${s.zalopay_qr}" alt="ZaloPay QR">`;

  // File preview
  ['s_momo', 's_zalopay'].forEach((id, i) => {
    document.getElementById(id).addEventListener('change', function() {
      const prev = document.getElementById(['prev_momo','prev_zalopay'][i]);
      if (this.files[0]) prev.innerHTML = `<img src="${URL.createObjectURL(this.files[0])}">`;
    });
  });
}

async function saveSettings(e) {
  e.preventDefault();
  const fd = new FormData();
  fd.append('store_phone', document.getElementById('s_phone').value);
  fd.append('store_zalo', document.getElementById('s_zalo').value);
  fd.append('store_email', document.getElementById('s_email').value);
  fd.append('deposit_percent', document.getElementById('s_dep_pct').value);
  fd.append('deposit_days', document.getElementById('s_dep_days').value);
  const momo = document.getElementById('s_momo').files[0];
  const zalopay = document.getElementById('s_zalopay').files[0];
  if (momo) fd.append('momo_qr_file', momo);
  if (zalopay) fd.append('zalopay_qr_file', zalopay);

  const res = await fetch(`${API}/admin/settings`, { method: 'PUT', headers: authH(), body: fd });
  if (res.ok) toast('Lưu cài đặt thành công!', 'success');
  else toast('Lỗi lưu cài đặt', 'error');
}

// ==================== UTILS ====================
function fmt(n) { return new Intl.NumberFormat('vi-VN').format(Math.round(n)) + '₫'; }
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = `toast show ${type}`;
  setTimeout(() => el.classList.remove('show'), 3000);
}
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }
function closeModalOnOverlay(e, id) { if (e.target === document.getElementById(id)) closeModal(id); }

// ==================== INIT ====================
window.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('admin_token');
  if (saved) {
    adminToken = saved;
    fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${adminToken}` } })
      .then(r => r.json()).then(user => {
        if (user.role === 'admin') showDashboard();
        else adminLogout();
      }).catch(() => adminLogout());
  }
});
