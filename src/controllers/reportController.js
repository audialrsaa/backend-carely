import db from "../config/db.js";
import { supabase } from "../config/supabase.js";

// ============================================================
// USER: Buat laporan baru + upload foto ke Supabase
// ============================================================
export const createReport = async (req, res) => {
  const { title, description, incident_location, incident_date } = req.body;

  const user_id = req.user.id;
  let bukti_foto = null;

  if (req.file) {
    try {
      const fileExt = req.file.originalname.split(".").pop();
      const fileName = `report-${user_id}-${Date.now()}.${fileExt}`;
      const fileBuffer = req.file.buffer;

      const { error: uploadError } = await supabase.storage
        .from("report-images")
        .upload(fileName, fileBuffer, {
          contentType: req.file.mimetype,
          upsert: false,
        });

      if (uploadError) {
        return res.status(500).json({
          message: "Gagal upload foto ke Supabase",
          error: uploadError.message,
        });
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("report-images").getPublicUrl(fileName);

      bukti_foto = publicUrl;
    } catch (err) {
      return res.status(500).json({
        message: "Terjadi kesalahan saat upload foto",
        error: err.message,
      });
    }
  }

  const [result] = await db.query(
    `INSERT INTO reports 
     (user_id, title, description, bukti_foto, incident_location, incident_date) 
     VALUES (?, ?, ?, ?, ?, ?)`,
    [user_id, title, description, bukti_foto, incident_location, incident_date]
  );

  await db.query(
    `INSERT INTO report_status_logs 
     (report_id, old_status, new_status, changed_by, changer_role, notes)
     VALUES (?, NULL, 'pending', ?, 'user', 'Laporan dibuat oleh user')`,
    [result.insertId, user_id]
  );

  res.status(201).json({
    message: "Laporan berhasil dibuat",
    report_id: result.insertId,
    bukti_foto,
  });
};

// ============================================================
// USER: Lihat laporan sendiri
// ============================================================
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

// ============================================================
// USER: Detail laporan + timeline
// ============================================================
export const getMyReportDetail = async (req, res) => {
  const { id } = req.params;

  const [report] = await db.query(
    `SELECT r.*, c.category_name 
     FROM reports r
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
     WHERE l.report_id = ?
     ORDER BY l.created_at ASC`,
    [id]
  );

  res.json({
    report: report[0],
    timeline: logs,
  });
};

// ============================================================
// ADMIN: All reports
// ============================================================
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

  if (status) {
    query += " AND r.status = ?";
    params.push(status);
  }

  if (category_id) {
    query += " AND r.category_id = ?";
    params.push(category_id);
  }

  if (priority) {
    query += " AND r.priority = ?";
    params.push(priority);
  }

  if (date_from) {
    query += " AND DATE(r.created_at) >= ?";
    params.push(date_from);
  }

  if (date_to) {
    query += " AND DATE(r.created_at) <= ?";
    params.push(date_to);
  }

  query += " ORDER BY r.created_at DESC";

  const [rows] = await db.query(query, params);
  res.json(rows);
};

// ============================================================
// ADMIN: Detail report
// ============================================================
export const getReportDetail = async (req, res) => {
  const { id } = req.params;

  const [report] = await db.query(
    `SELECT r.*, c.category_name,
            u.full_name as reporter_name,
            u.email as reporter_email,
            u.phone as reporter_phone
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
     WHERE l.report_id = ?
     ORDER BY l.created_at ASC`,
    [id]
  );

  res.json({
    report: report[0],
    timeline: logs,
  });
};

// ============================================================
// ADMIN: Update status + CATEGORY TRACKING (FIX HERE)
// ============================================================
export const updateReportStatus = async (req, res) => {
  const { id } = req.params;

  const {
    new_status,
    notes,
    rejection_reason,
    admin_notes,
    category_id,
  } = req.body;

  const changed_by = req.user.id;
  const changer_role = req.user.role;

  // 🔥 ambil data lama
  const [current] = await db.query(
    "SELECT status, category_id FROM reports WHERE id = ?",
    [id]
  );

  if (current.length === 0) {
    return res.status(404).json({ message: "Laporan tidak ditemukan" });
  }

  const old_status = current[0].status;
  const old_category = current[0].category_id;

  // update query
  let updateQuery =
    "UPDATE reports SET status = ?, updated_at = NOW()";

  const updateParams = [new_status];

  let categoryChangedText = "";

  if (category_id !== undefined) {
    updateQuery += ", category_id = ?";
    updateParams.push(category_id);

    if (category_id !== old_category) {
      categoryChangedText = ` | kategori berubah dari ${old_category} → ${category_id}`;
    }
  }

  if (rejection_reason !== undefined) {
    updateQuery += ", rejection_reason = ?";
    updateParams.push(rejection_reason);
  }

  if (admin_notes !== undefined) {
    updateQuery += ", admin_notes = ?";
    updateParams.push(admin_notes);
  }

  updateQuery += " WHERE id = ?";
  updateParams.push(id);

  await db.query(updateQuery, updateParams);

  // 🔥 LOG STATUS + CATEGORY
  const finalNotes =
    (notes || "") + categoryChangedText || null;

  await db.query(
    `INSERT INTO report_status_logs
     (report_id, old_status, new_status, changed_by, changer_role, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, old_status, new_status, changed_by, changer_role, finalNotes]
  );

  res.json({
    message: "Status laporan berhasil diperbarui",
  });
};

// ============================================================
// PRIORITY
// ============================================================
export const setReportPriority = async (req, res) => {
  const { id } = req.params;
  const { priority } = req.body;

  const valid = ["low", "medium", "high", "emergency"];

  if (!valid.includes(priority)) {
    return res.status(400).json({ message: "Prioritas tidak valid" });
  }

  await db.query("UPDATE reports SET priority = ? WHERE id = ?", [
    priority,
    id,
  ]);

  res.json({ message: "Prioritas berhasil diubah" });
};

// ============================================================
// CATEGORY
// ============================================================
export const getCategories = async (req, res) => {
  const [rows] = await db.query("SELECT * FROM categories");
  res.json(rows);
};

// ============================================================
// DELETE
// ============================================================
export const deleteReport = async (req, res) => {
  const { id } = req.params;

  await db.query("DELETE FROM report_status_logs WHERE report_id = ?", [id]);
  await db.query("DELETE FROM reports WHERE id = ?", [id]);

  res.json({ message: "Laporan berhasil dihapus" });
};