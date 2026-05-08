import db from "../config/db.js";

// USER: Buat laporan baru
export const createReport = async (req, res) => {
  const { category_id, title, description, incident_location, incident_date } = req.body;
  const bukti_foto = req.file ? req.file.filename : null;
  const user_id = req.user.id;

  const [result] = await db.query(
    `INSERT INTO reports 
     (user_id, category_id, title, description, bukti_foto, incident_location, incident_date) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [user_id, category_id, title, description, bukti_foto, incident_location, incident_date]
  );

  // Log status awal — changed_by = user sendiri, changer_role = 'admin' karena ENUM DB hanya admin/superadmin
  // Kita set changed_by = user_id tapi notes menjelaskan ini dibuat oleh user
  await db.query(
 `INSERT INTO report_status_logs 
  (report_id, old_status, new_status, changed_by, changer_role, notes)
  VALUES (?, NULL, 'pending', ?, 'user', 'Laporan dibuat oleh user')`,
  [result.insertId, user_id]
  );

  // Notifikasi ke user
  await db.query(
    `INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)`,
    [user_id, "Laporan Diterima", `Laporan "${title}" berhasil dikirim dan sedang menunggu pemeriksaan.`]
  );

  res.status(201).json({ message: "Laporan berhasil dibuat", report_id: result.insertId });
};

// USER: Lihat laporan milik sendiri
export const getMyReports = async (req, res) => {
  const [rows] = await db.query(
    `SELECT r.*, c.category_name
     FROM reports r
     LEFT JOIN categories c ON r.category_id = c.id
     WHERE r.user_id = ?
     ORDER BY r.created_at DESC`,
    [req.user.id]
  );
  res.json(rows);
};

// USER: Detail laporan + timeline
export const getMyReportDetail = async (req, res) => {
  const { id } = req.params;

  const [report] = await db.query(
    `SELECT r.*, c.category_name FROM reports r
     LEFT JOIN categories c ON r.category_id = c.id
     WHERE r.id = ? AND r.user_id = ?`,
    [id, req.user.id]
  );

  if (report.length === 0) {
    return res.status(404).json({ message: "Laporan tidak ditemukan" });
  }

  const [logs] = await db.query(
    `SELECT l.*, u.full_name as changed_by_name
     FROM report_status_logs l
     LEFT JOIN users u ON l.changed_by = u.id
     WHERE l.report_id = ? ORDER BY l.created_at ASC`,
    [id]
  );

  res.json({ report: report[0], timeline: logs });
};

// ADMIN + SUPERADMIN: Lihat semua laporan
export const getAllReports = async (req, res) => {
  const { status, category_id, priority, date_from, date_to } = req.query;

  let query = `
    SELECT r.*, c.category_name,
           u.full_name as reporter_name
    FROM reports r
    LEFT JOIN categories c ON r.category_id = c.id
    LEFT JOIN users u ON r.user_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (status) { query += " AND r.status = ?"; params.push(status); }
  if (category_id) { query += " AND r.category_id = ?"; params.push(category_id); }
  if (priority) { query += " AND r.priority = ?"; params.push(priority); }
  if (date_from) { query += " AND DATE(r.created_at) >= ?"; params.push(date_from); }
  if (date_to) { query += " AND DATE(r.created_at) <= ?"; params.push(date_to); }

  query += " ORDER BY r.created_at DESC";

  const [rows] = await db.query(query, params);
  res.json(rows);
};

// ADMIN + SUPERADMIN: Detail laporan
export const getReportDetail = async (req, res) => {
  const { id } = req.params;

  const [report] = await db.query(
    `SELECT r.*, c.category_name,
            u.full_name as reporter_name, u.email as reporter_email, u.phone as reporter_phone
     FROM reports r
     LEFT JOIN categories c ON r.category_id = c.id
     LEFT JOIN users u ON r.user_id = u.id
     WHERE r.id = ?`,
    [id]
  );

  if (report.length === 0) {
    return res.status(404).json({ message: "Laporan tidak ditemukan" });
  }

  const [logs] = await db.query(
    `SELECT l.*, u.full_name as changed_by_name
     FROM report_status_logs l
     LEFT JOIN users u ON l.changed_by = u.id
     WHERE l.report_id = ? ORDER BY l.created_at ASC`,
    [id]
  );

  res.json({ report: report[0], timeline: logs });
};

// ADMIN + SUPERADMIN: Update status laporan
export const updateReportStatus = async (req, res) => {
  const { id } = req.params;
  const { new_status, notes, rejection_reason, admin_notes } = req.body;
  const changed_by = req.user.id;
  const changer_role = req.user.role;

  const [current] = await db.query("SELECT status, user_id, title FROM reports WHERE id = ?", [id]);
  if (current.length === 0) return res.status(404).json({ message: "Laporan tidak ditemukan" });

  const old_status = current[0].status;

  let updateQuery = "UPDATE reports SET status = ?, updated_at = NOW()";
  const updateParams = [new_status];

  if (rejection_reason !== undefined) { updateQuery += ", rejection_reason = ?"; updateParams.push(rejection_reason); }
  if (admin_notes !== undefined) { updateQuery += ", admin_notes = ?"; updateParams.push(admin_notes); }

  updateQuery += " WHERE id = ?";
  updateParams.push(id);

  await db.query(updateQuery, updateParams);

  // Log perubahan status
  await db.query(
    `INSERT INTO report_status_logs (report_id, old_status, new_status, changed_by, changer_role, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, old_status, new_status, changed_by, changer_role, notes || null]
  );

  // Notifikasi ke user
  await db.query(
    `INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)`,
    [
      current[0].user_id,
      "Status Laporan Diperbarui",
      `Status laporan "${current[0].title}" berubah dari ${old_status} menjadi ${new_status}.`,
    ]
  );

  res.json({ message: "Status laporan berhasil diperbarui" });
};

// SUPERADMIN: Set prioritas laporan
export const setReportPriority = async (req, res) => {
  const { id } = req.params;
  const { priority } = req.body;

  const validPriorities = ["low", "medium", "high", "emergency"];
  if (!validPriorities.includes(priority)) {
    return res.status(400).json({ message: "Prioritas tidak valid" });
  }

  await db.query("UPDATE reports SET priority = ? WHERE id = ?", [priority, id]);
  res.json({ message: "Prioritas berhasil diubah" });
};

// GET semua kategori
export const getCategories = async (req, res) => {
  const [rows] = await db.query("SELECT * FROM categories");
  res.json(rows);
};