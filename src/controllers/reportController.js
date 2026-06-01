import db from "../config/db.js";
import { supabase } from "../config/supabase.js";
import { createNotification } from "../utils/notification.js";

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

  // cari semua admin & superadmin
  const [superadmins] = await db.query(`
    SELECT id
    FROM users
    WHERE role = 'superadmin'
  `);

  for (const user of superadmins) {
    await createNotification(
      user.id,
      "Laporan Baru",
      `Laporan "${title}" menunggu penentuan prioritas`,
      result.insertId
    );
  }

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
    return res.status(404).json({
      message: "Laporan tidak ditemukan",
    });
  }

  // 🔥 Admin tidak boleh buka laporan sebelum superadmin set priority
  if (
    req.user.role === "admin" &&
    !report[0].priority_set
  ) {
    return res.status(200).json({
      waiting_priority: true,
      message: "Laporan belum diprioritaskan oleh superadmin",
    });
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

  // ambil data laporan lama
  const [current] = await db.query(
    `SELECT
      id,
      user_id,
      title,
      status,
      category_id
    FROM reports
    WHERE id = ?`,
    [id]
  );

  if (current.length === 0) {
    return res.status(404).json({
      message: "Laporan tidak ditemukan",
    });
  }

  const report = current[0];

  const old_status = report.status;
  const old_category = report.category_id;

  // update laporan
  let updateQuery =
    "UPDATE reports SET status = ?, updated_at = NOW()";

  const updateParams = [new_status];

  let categoryChangedText = "";

  if (category_id !== undefined) {
    updateQuery += ", category_id = ?";
    updateParams.push(category_id);

    if (category_id !== old_category) {
      categoryChangedText =
        ` | kategori berubah dari ${old_category} → ${category_id}`;
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

  // simpan log perubahan
  const finalNotes =
    (notes || "") + categoryChangedText || null;

  await db.query(
    `INSERT INTO report_status_logs
    (
      report_id,
      old_status,
      new_status,
      changed_by,
      changer_role,
      notes
    )
    VALUES (?, ?, ?, ?, ?, ?)`,
    [
      id,
      old_status,
      new_status,
      changed_by,
      changer_role,
      finalNotes,
    ]
  );

  // ==========================
  // NOTIFIKASI KE PELAPOR
  // ==========================

  let notifTitle = "Update Laporan";
  let notifMessage = "";

  if (new_status === "rejected") {
    notifTitle = "Laporan Ditolak";

    notifMessage =
      rejection_reason ||
      `Laporan "${report.title}" ditolak oleh admin`;
  } else {
    notifMessage =
      `Laporan "${report.title}" sekarang berstatus ${new_status}`;
  }

  // tampilkan isi catatan admin di notif
  if (admin_notes?.trim()) {
    notifMessage += ` Catatan: "${admin_notes}"`;
  }

  await createNotification(
    report.user_id,
    notifTitle,
    notifMessage,
    id
  );

  res.json({
    message: "Status laporan berhasil diperbarui",
  });
};

// ============================================================
// SUPERADMIN: UPDATE PRIORITAS LAPORAN
// ============================================================
export const setReportPriority = async (req, res) => {
  const { id } = req.params;
  const { priority } = req.body;

  const validPriorities = [
    "low",
    "medium",
    "high",
    "emergency",
  ];

  if (!validPriorities.includes(priority)) {
    return res.status(400).json({
      message: "Prioritas tidak valid",
    });
  }

  // cek laporan
  const [report] = await db.query(
    `SELECT id, user_id, priority
     FROM reports
     WHERE id = ?`,
    [id]
  );

  if (report.length === 0) {
    return res.status(404).json({
      message: "Laporan tidak ditemukan",
    });
  }

  const oldPriority = report[0].priority;

  // update priority
  await db.query(
    `UPDATE reports
    SET priority = ?,
        priority_set = TRUE,
        updated_at = NOW()
    WHERE id = ?`,
    [priority, id]
  );

  // log aktivitas admin
  // await db.query(
  //   `INSERT INTO admin_activity_logs
  //    (
  //      admin_id,
  //      activity_type,
  //      description,
  //      target_report_id
  //    )
  //    VALUES (?, ?, ?, ?)`,
  //   [
  //     req.user.id,
  //     "UPDATE_PRIORITY",
  //     `Prioritas laporan diubah dari ${oldPriority} menjadi ${priority}`,
  //     id,
  //   ]
  // );

  // notifikasi ke user pelapor
  await createNotification(
    report[0].user_id,
    "Prioritas Laporan Diperbarui",
    `Prioritas laporan Anda diubah menjadi ${priority}`,
    id
  );

  const [admins] = await db.query(`
    SELECT id
    FROM users
    WHERE role = 'admin'
  `);

  for (const admin of admins) {
    await createNotification(
      admin.id,
      "Laporan Siap Diproses",
      `Laporan #${id} telah diprioritaskan menjadi ${priority}`,
      id
);
  }

  res.json({
    message: "Prioritas laporan berhasil diperbarui",
    old_priority: oldPriority,
    new_priority: priority,
  });
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

// USER EDIT LAPORAN
// USER EDIT LAPORAN (dengan support ganti/hapus foto)
export const updateMyReport = async (req, res) => {
  const { id } = req.params;
  const { title, description, incident_location, incident_date, remove_foto } = req.body;

  const [report] = await db.query(
    `SELECT * FROM reports WHERE id = ? AND user_id = ?`,
    [id, req.user.id]
  );

  if (report.length === 0) {
    return res.status(404).json({ message: "Laporan tidak ditemukan" });
  }

  if (report[0].status !== "pending") {
    return res.status(403).json({ message: "Laporan yang sudah diproses tidak dapat diedit" });
  }

  let bukti_foto = report[0].bukti_foto; // default: foto lama

  // Hapus foto
  if (remove_foto === "true") {
    bukti_foto = null;
  }

  // Upload foto baru
  if (req.file) {
    try {
      const fileExt = req.file.originalname.split(".").pop();
      const fileName = `report-${req.user.id}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("report-images")
        .upload(fileName, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false,
        });

      if (uploadError) {
        return res.status(500).json({ message: "Gagal upload foto", error: uploadError.message });
      }

      const { data: { publicUrl } } = supabase.storage
        .from("report-images")
        .getPublicUrl(fileName);

      bukti_foto = publicUrl;
    } catch (err) {
      return res.status(500).json({ message: "Kesalahan saat upload foto", error: err.message });
    }
  }

  await db.query(
    `UPDATE reports
     SET title = ?, description = ?, incident_location = ?,
         incident_date = ?, bukti_foto = ?, updated_at = NOW()
     WHERE id = ?`,
    [title, description, incident_location, incident_date, bukti_foto, id]
  );

  res.json({ message: "Laporan berhasil diperbarui" });
};

// USER HAPUS LAPORAN
export const deleteMyReport = async (req, res) => {
  const { id } = req.params;

  const [report] = await db.query(
    `SELECT * FROM reports
     WHERE id = ? AND user_id = ?`,
    [id, req.user.id]
  );

  if (report.length === 0) {
    return res.status(404).json({
      message: "Laporan tidak ditemukan",
    });
  }

  if (report[0].status !== "pending") {
    return res.status(403).json({
      message: "Laporan yang sudah diproses tidak dapat dihapus",
    });
  }

  await db.query(
    "DELETE FROM reports WHERE id = ?",
    [id]
  );

  res.json({
    message: "Laporan berhasil dihapus",
  });
};