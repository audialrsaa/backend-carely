import db from "../config/db.js";
import bcrypt from "bcryptjs";

//SUPERADMIN
export const getDashboardStats = async (req, res) => {

  // hitung jumlah seluruh user
  const [[totalUsers]] = await db.query(
    "SELECT COUNT(*) as total FROM users WHERE role = 'user'"
  );

  // hitung jumlah seluruh admin
  const [[totalAdmins]] = await db.query(
    "SELECT COUNT(*) as total FROM users WHERE role = 'admin'"
  );

  // hitung jumlah seluruh laporan
  const [[totalReports]] = await db.query(
    "SELECT COUNT(*) as total FROM reports"
  );

  // hitung jumlah laporan yang dibuat hari ini
  const [[todayReports]] = await db.query(
    "SELECT COUNT(*) as total FROM reports WHERE DATE(created_at) = CURDATE()"
  );

  // hitung jumlah laporan prioritas darurat yang belum selesai
  const [[emergencyReports]] = await db.query(
    "SELECT COUNT(*) as total FROM reports WHERE priority = 'emergency' AND status NOT IN ('selesai','rejected')"
  );

  // ambil ringkasan laporan berdasarkan status
  const [statusSummary] = await db.query(
    "SELECT * FROM report_status_summary"
  );

  // ambil ringkasan laporan berdasarkan kategori
  const [categorySummary] = await db.query(
    "SELECT * FROM report_category_summary"
  );

  // ambil ringkasan laporan berdasarkan prioritas
  const [prioritySummary] = await db.query(
    "SELECT * FROM report_priority_summary"
  );

  // kirim seluruh data statistik ke frontend
  res.json({
    total_users: totalUsers.total,
    total_admins: totalAdmins.total,
    total_reports: totalReports.total,
    today_reports: todayReports.total,
    emergency_reports: emergencyReports.total,
    status_summary: statusSummary,
    category_summary: categorySummary,
    priority_summary: prioritySummary,
  });
};

//ADMIN
export const getAdminDashboard = async (req, res) => {

  // hitung jumlah laporan hari ini
  const [[todayReports]] = await db.query(
    "SELECT COUNT(*) as total FROM reports WHERE DATE(created_at) = CURDATE()"
  );

  // hitun jumlah seluruh laporan
  const [[totalReports]] = await db.query(
    "SELECT COUNT(*) as total FROM reports"
  );

  // ambil ringkasan status laporan
  const [statusSummary] = await db.query(
    "SELECT * FROM report_status_summary"
  );

  // ambil ringkasan kategori laporan
  const [categorySummary] = await db.query(
    "SELECT * FROM report_category_summary"
  );

  // ambil ringkasan prioritas laporan
  const [prioritySummary] = await db.query(
    "SELECT * FROM report_priority_summary"
  );

  // kirim data dashboard admin
  res.json({
    total_reports: totalReports.total,
    today_reports: todayReports.total,
    status_summary: statusSummary,
    category_summary: categorySummary,
    priority_summary: prioritySummary,
  });
};

// superadmin : tampilin all user
export const getAllUsers = async (req, res) => {

  // ambil data user dan mengurutkan dari terbaru
  const [rows] = await db.query(
    "SELECT id, full_name, email, phone, role, created_at FROM users WHERE role = 'user' ORDER BY created_at DESC"
  );

  // kirim data user ke frontend
  res.json(rows);
};

// superadmin: tampil all admin
export const getAllAdmins = async (req, res) => {

  // ambi data admin dan mengurutkan dari terbaru
  const [rows] = await db.query(
    "SELECT id, full_name, email, phone, role, created_at FROM users WHERE role = 'admin' ORDER BY created_at DESC"
  );

  // ngirim data admin ke frontend
  res.json(rows);
};

// superadmin : create admin
export const createAdmin = async (req, res) => {
  try {

    // ambil data dari request body
    const { full_name, email, password, phone } = req.body;

    // validasi field wajib
    if (
      !full_name?.trim() || //trims hapus spasi di awal string dan akhir " "
      !email?.trim() ||
      !password?.trim()
    ) {
      return res.status(400).json({
        message: "Semua field wajib diisi",
      });
    }

    // cek email sudah digunakan
    const [existing] = await db.query(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );

    // kalau email sudah ada maka batalkan proses
    if (existing.length > 0) {
      return res.status(400).json({
        message: "Email sudah digunakan",
      });
    }

    // enkrip hash password sebelum disimpan
    const hashed = await bcrypt.hash(password, 10);

    // simpan admin baru ke database
    await db.query(
      `INSERT INTO users
      (full_name, email, password, phone, role)
      VALUES (?, ?, ?, ?, ?)`,
      [
        full_name,
        email,
        hashed,
        phone || null,
        "admin",
      ]
    );

    // kirim pesan sukses
    res.status(201).json({
      message: "Admin berhasil dibuat",
    });

  } catch (err) {

    // tampilin error di console
    console.error(err);

    // kirim response server error
    res.status(500).json({
      message: "Server error",
    });
  }
};

// superadmin : hapus admin
export const deleteAdmin = async (req, res) => {

  // ambil ID admin
  const { id } = req.params;

  // jjapus admin dari database
  await db.query(
    "DELETE FROM users WHERE id = ? AND role = 'admin'",
    [id]
  );

  // kirim pesan sukses
  res.json({
    message: "Admin berhasil dihapus",
  });
};


// superadmin : hapus user
export const deleteUser = async (req, res) => {

  // ambil ID user
  const { id } = req.params;

  // haous user dari database
  await db.query(
    "DELETE FROM users WHERE id = ? AND role = 'user'",
    [id]
  );

  // kirim pesan sukses
  res.json({
    message: "User berhasil dihapus",
  });
};

// superadmin : log act
export const getAuditLogs = async (req, res) => {

  // ambil riwayat perubahan status laporan
  // beserta informasi laporan dan pengguna yang melakukan perubahan
  const [rows] = await db.query(`
    SELECT l.*,
           r.title as report_title,
           u.full_name as changed_by_name,
           u.role as changer_role
    FROM report_status_logs l
    LEFT JOIN reports r ON l.report_id = r.id
    LEFT JOIN users u ON l.changed_by = u.id
    ORDER BY l.created_at DESC
    LIMIT 100
  `);

  // kirim data audit log ke frontend
  res.json(rows);
};