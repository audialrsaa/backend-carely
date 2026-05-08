import db from "../config/db.js";
import bcrypt from "bcryptjs";

// SUPERADMIN: Dashboard stats lengkap
export const getDashboardStats = async (req, res) => {
  const [[totalUsers]] = await db.query("SELECT COUNT(*) as total FROM users WHERE role = 'user'");
  const [[totalAdmins]] = await db.query("SELECT COUNT(*) as total FROM users WHERE role = 'admin'");
  const [[totalReports]] = await db.query("SELECT COUNT(*) as total FROM reports");
  const [[todayReports]] = await db.query(
    "SELECT COUNT(*) as total FROM reports WHERE DATE(created_at) = CURDATE()"
  );
  const [[emergencyReports]] = await db.query(
    "SELECT COUNT(*) as total FROM reports WHERE priority = 'emergency' AND status NOT IN ('selesai','rejected')"
  );

  const [statusSummary] = await db.query("SELECT * FROM report_status_summary");
  const [categorySummary] = await db.query("SELECT * FROM report_category_summary");
  const [prioritySummary] = await db.query("SELECT * FROM report_priority_summary");

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

// ADMIN: Dashboard stats terbatas
export const getAdminDashboard = async (req, res) => {
  const [[todayReports]] = await db.query(
    "SELECT COUNT(*) as total FROM reports WHERE DATE(created_at) = CURDATE()"
  );
  const [[totalReports]] = await db.query("SELECT COUNT(*) as total FROM reports");
  const [statusSummary] = await db.query("SELECT * FROM report_status_summary");
  const [categorySummary] = await db.query("SELECT * FROM report_category_summary");
  const [prioritySummary] = await db.query("SELECT * FROM report_priority_summary");

  res.json({
    total_reports: totalReports.total,
    today_reports: todayReports.total,
    status_summary: statusSummary,
    category_summary: categorySummary,
    priority_summary: prioritySummary,
  });
};

// SUPERADMIN: Lihat semua user
export const getAllUsers = async (req, res) => {
  const [rows] = await db.query(
    "SELECT id, full_name, email, phone, role, created_at FROM users WHERE role = 'user' ORDER BY created_at DESC"
  );
  res.json(rows);
};

// SUPERADMIN: Lihat semua admin
export const getAllAdmins = async (req, res) => {
  const [rows] = await db.query(
    "SELECT id, full_name, email, phone, role, created_at FROM users WHERE role = 'admin' ORDER BY created_at DESC"
  );
  res.json(rows);
};

// SUPERADMIN: Buat admin baru
export const createAdmin = async (req, res) => {
  const { full_name, email, password, phone } = req.body;

  const [existing] = await db.query("SELECT id FROM users WHERE email = ?", [email]);
  if (existing.length > 0) {
    return res.status(400).json({ message: "Email sudah digunakan" });
  }

  const hashed = await bcrypt.hash(password, 10);
  await db.query(
    "INSERT INTO users (full_name, email, password, phone, role) VALUES (?, ?, ?, ?, ?)",
    [full_name, email, hashed, phone || null, "admin"]
  );

  res.status(201).json({ message: "Admin berhasil dibuat" });
};

// SUPERADMIN: Edit admin
export const updateAdmin = async (req, res) => {
  const { id } = req.params;
  const { full_name, phone } = req.body;

  await db.query(
    "UPDATE users SET full_name = ?, phone = ? WHERE id = ? AND role = 'admin'",
    [full_name, phone, id]
  );

  res.json({ message: "Data admin berhasil diupdate" });
};

// SUPERADMIN: Hapus admin
export const deleteAdmin = async (req, res) => {
  const { id } = req.params;
  await db.query("DELETE FROM users WHERE id = ? AND role = 'admin'", [id]);
  res.json({ message: "Admin berhasil dihapus" });
};

// SUPERADMIN: Reset password admin
export const resetAdminPassword = async (req, res) => {
  const { id } = req.params;
  const { new_password } = req.body;

  const hashed = await bcrypt.hash(new_password, 10);
  await db.query("UPDATE users SET password = ? WHERE id = ? AND role = 'admin'", [hashed, id]);

  res.json({ message: "Password admin berhasil direset" });
};

// SUPERADMIN: Hapus user
export const deleteUser = async (req, res) => {
  const { id } = req.params;
  await db.query("DELETE FROM users WHERE id = ? AND role = 'user'", [id]);
  res.json({ message: "User berhasil dihapus" });
};

// SUPERADMIN: Audit log
export const getAuditLogs = async (req, res) => {
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
  res.json(rows);
};

// SUPERADMIN: Activity logs
export const getActivityLogs = async (req, res) => {
  const [rows] = await db.query(`
    SELECT a.*, u.full_name as admin_name
    FROM admin_activity_logs a
    LEFT JOIN users u ON a.admin_id = u.id
    ORDER BY a.created_at DESC
    LIMIT 100
  `);
  res.json(rows);
};