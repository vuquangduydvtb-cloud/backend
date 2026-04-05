const db = require('./db/init');

const newEmail = 'Vuquangduydvtb@gmail.com';
const oldEmail = 'Boduyvidai@1102';

try {
  const result = db.prepare('UPDATE users SET email = ? WHERE email = ?').run(newEmail, oldEmail);
  
  if (result.changes > 0) {
    console.log(`✅ Cập nhật thành công! Email admin đã đổi từ "${oldEmail}" → "${newEmail}"`);
    console.log(`📊 Số dòng được cập nhật: ${result.changes}`);
  } else {
    console.log(`❌ Không tìm thấy email "${oldEmail}" trong database`);
  }
} catch (err) {
  console.error(`❌ Lỗi:`, err.message);
  process.exit(1);
}

process.exit(0);
