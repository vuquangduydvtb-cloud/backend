const bcrypt = require('bcryptjs');
const db = require('./db/init');

// ⚠️ THAY ĐỔI MẬT KHẨU MỚI Ở ĐÂY
const newPassword = 'Boduyvidai@1102'; // Đổi thành mật khẩu bạn muốn
const adminEmail = 'Vuquangduydvtb@gmail.com';

try {
  // Hash mật khẩu mới
  const hashedPassword = bcrypt.hashSync(newPassword, 10);
  
  // Cập nhật vào database
  const result = db.prepare('UPDATE users SET password = ? WHERE email = ?').run(hashedPassword, adminEmail);
  
  if (result.changes > 0) {
    console.log(`✅ Cập nhật mật khẩu admin thành công!`);
    console.log(`📧 Email: ${adminEmail}`);
    console.log(`🔐 Mật khẩu mới: ${newPassword}`);
  } else {
    console.log(`❌ Không tìm thấy admin với email: ${adminEmail}`);
  }
} catch (err) {
  console.error(`❌ Lỗi:`, err.message);
  process.exit(1);
}

process.exit(0);
