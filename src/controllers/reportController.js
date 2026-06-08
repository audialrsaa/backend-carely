import db from "../config/db.js"; 
import { supabase } from "../config/supabase.js";
import { createNotification } from "../utils/notification.js";

// user : buat laporan
export const createReport = async (req, res) => {
  const {
    title, 
    description, 
    incident_location,
    incident_date,
    latitude, 
    longitude, 
  } = req.body;

  const user_id = req.user.id; // ambil ID user dari token auth
  let bukti_foto = null; // default null, diisi kalau ada foto

  if (req.file) { // cek apakah ada file foto yang dikirim
    try {
      const fileExt = req.file.originalname.split(".").pop(); // ambil ekstensi file
      const fileName = `report-${user_id}-${Date.now()}.${fileExt}`; // buat nama file unik
      const fileBuffer = req.file.buffer; // ambil data binary file

      const { error: uploadError } = await supabase.storage
        .from("report-images") // target bucket di Supabase
        .upload(fileName, fileBuffer, {
          contentType: req.file.mimetype, // set tipe konten file
          upsert: false, // jangan timpa file yang sudah ada
        });

      if (uploadError) { // upload gagal
        return res.status(500).json({
          message: "Gagal upload foto ke Supabase",
          error: uploadError.message,
        });
      }

      const {
        data: { publicUrl }, // ambil URL publik hasil upload
      } = supabase.storage.from("report-images").getPublicUrl(fileName);

      bukti_foto = publicUrl; // simpan URL foto
    } catch (err) { // get error tak terduga saat upload
      return res.status(500).json({
        message: "Terjadi kesalahan saat upload foto",
        error: err.message,
      });
    }
  }

  // simpan laporan baru ke database
  const [result] = await db.query(
    `INSERT INTO reports
    (
      user_id,
      title,
      description,
      bukti_foto,
      incident_location,
      incident_date,
      latitude,
      longitude
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      user_id,
      title,
      description,
      bukti_foto,
      incident_location,
      incident_date,
      latitude,
      longitude,
    ]
  );

  // catat log status awal laporan sebagai 'pending'
  await db.query(
    `INSERT INTO report_status_logs 
     (report_id, old_status, new_status, changed_by, changer_role, notes)
     VALUES (?, NULL, 'pending', ?, 'user', 'Laporan dibuat oleh user')`,
    [result.insertId, user_id]
  );

  // ambil semua user dengan role superadmin
  const [superadmins] = await db.query(`
    SELECT id
    FROM users
    WHERE role = 'superadmin'
  `);

  // kirim notifikasi ke setiap superadmin
  for (const user of superadmins) {
    await createNotification(
      user.id,
      "Laporan Baru",
      `Laporan "${title}" menunggu penentuan prioritas`,
      result.insertId // id laporan yang baru dibuat
    );
  }

  // kirim respons sukses beserta ID laporan dan URL foto
  res.status(201).json({
    message: "Laporan berhasil dibuat",
    report_id: result.insertId,
    bukti_foto,
  });
};

// user : lihat laporan sendiri
export const getMyReports = async (req, res) => {

  // ambil semua laporan milik user beserta nama kategorinya
  const [rows] = await db.query(
    `SELECT r.*, c.category_name
     FROM reports r
     LEFT JOIN categories c ON r.category_id = c.id
     WHERE r.user_id = ?
     ORDER BY r.created_at DESC`, // urutkan dari yang terbaru
    [req.user.id]
  );

  // kirim daftar laporan
  res.json(rows);
};

// user : detail laporan dan timeline 
export const getMyReportDetail = async (req, res) => {
  const { id } = req.params; // ambil ID laporan dari URL

  // ambil detail laporan, pastikan milik user yang login
  const [report] = await db.query(
    `SELECT r.*, c.category_name 
     FROM reports r
     LEFT JOIN categories c ON r.category_id = c.id
     WHERE r.id = ? AND r.user_id = ?`, // double check ID laporan + ID user
    [id, req.user.id]
  );

  if (report.length === 0) { // laporan tidak ditemukan atau bukan milik user ini
    return res.status(404).json({ message: "Laporan tidak ditemukan" });
  }

  // ambil riwayat perubahan status laporan beserta nama pengubahnya
  const [logs] = await db.query(
    `SELECT l.*, u.full_name as changed_by_name
     FROM report_status_logs l
     LEFT JOIN users u ON l.changed_by = u.id
     WHERE l.report_id = ?
     ORDER BY l.created_at ASC`, // urutkan dari perubahan paling lama
    [id]
  );

  // kirim detail laporan beserta timeline perubahannya
  res.json({
    report: report[0],
    timeline: logs,
  });
};

// admin : all report
export const getAllReports = async (req, res) => {
  const { status, category_id, priority, date_from, date_to } = req.query; // ambil filter dari query string

  // query dasar ambil semua laporan beserta nama kategori dan pelapor
  let query = `
    SELECT r.*, c.category_name,
           u.full_name as reporter_name
    FROM reports r
    LEFT JOIN categories c ON r.category_id = c.id
    LEFT JOIN users u ON r.user_id = u.id
    WHERE 1=1
  `;

  const params = []; // array parameter untuk query dinamis

  if (status) { // filter berdasarkan status laporan
    query += " AND r.status = ?";
    params.push(status);
  }

  if (category_id) { // filter berdasarkan kategori
    query += " AND r.category_id = ?";
    params.push(category_id);
  }

  if (priority) { // filter berdasarkan prioritas
    query += " AND r.priority = ?";
    params.push(priority);
  }

  if (date_from) { // filter laporan dari tanggal tertentu
    query += " AND DATE(r.created_at) >= ?";
    params.push(date_from);
  }

  if (date_to) { // filter laporan sampai tanggal tertentu
    query += " AND DATE(r.created_at) <= ?";
    params.push(date_to);
  }

  query += " ORDER BY r.created_at DESC"; // urutkan dari yang terbaru

  const [rows] = await db.query(query, params); // jalankan query dengan semua filter
  res.json(rows); // kirim daftar laporan
};

// admin : detail laporan
export const getReportDetail = async (req, res) => {
  const { id } = req.params; // ambil ID laporan dari URL

  // ambil detail laporan beserta info pelapor
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

  if (report.length === 0) { // laporan tidak ditemukan
    return res.status(404).json({
      message: "Laporan tidak ditemukan",
    });
  }

  // admin tidak boleh buka laporan yang belum diprioritaskan superadmin
  if (
    req.user.role === "admin" &&
    !report[0].priority_set // cek apakah priority sudah di-set
  ) {
    return res.status(200).json({
      waiting_priority: true,
      message: "Laporan belum diprioritaskan oleh superadmin",
    });
  }

  // ambil riwayat perubahan status laporan
  const [logs] = await db.query(
    `SELECT l.*, u.full_name as changed_by_name
     FROM report_status_logs l
     LEFT JOIN users u ON l.changed_by = u.id
     WHERE l.report_id = ?
     ORDER BY l.created_at ASC`, // urutkan dari yang paling lama
    [id]
  );

  // kirim detail laporan beserta timeline
  res.json({
    report: report[0],
    timeline: logs,
  });
};

// ADMIN: Update status + CATEGORY TRACKING
export const updateReportStatus = async (req, res) => {
  const { id } = req.params; // ambil ID laporan dari URL

  const {
    new_status,       
    notes,           
    rejection_reason, 
    admin_notes,     
    category_id,   
  } = req.body;

  const changed_by = req.user.id;    
  const changer_role = req.user.role; 

  // ambil data laporan saat ini sebelum diubah
  const [current] = await db.query(
    `SELECT id, user_id, title, status, category_id
    FROM reports
    WHERE id = ?`,
    [id]
  );

  if (current.length === 0) { // laporan tidak ditemukan
    return res.status(404).json({
      message: "Laporan tidak ditemukan",
    });
  }

  const report = current[0];

  const old_status = report.status;      // status lama untuk dicatat di log
  const old_category = report.category_id; // kategori lama untuk perbandingan

  // mulai bangun query update secara dinamis
  let updateQuery = "UPDATE reports SET status = ?, updated_at = NOW()";
  const updateParams = [new_status];

  let categoryChangedText = ""; // teks tambahan jika kategori berubah

  if (category_id !== undefined) { // jika kategori ikut diubah
    updateQuery += ", category_id = ?";
    updateParams.push(category_id);

    if (category_id !== old_category) { // catat perubahan kategori jika berbeda
      categoryChangedText =
        ` | kategori berubah dari ${old_category} → ${category_id}`;
    }
  }

  if (rejection_reason !== undefined) { // simpan alasan penolakan jika ada
    updateQuery += ", rejection_reason = ?";
    updateParams.push(rejection_reason);
  }

  if (admin_notes !== undefined) { // simpan catatan admin jika ada
    updateQuery += ", admin_notes = ?";
    updateParams.push(admin_notes);
  }

  updateQuery += " WHERE id = ?";
  updateParams.push(id);

  await db.query(updateQuery, updateParams); // jalankan update laporan

  // gabungkan catatan dengan info perubahan kategori
  const finalNotes = (notes || "") + categoryChangedText || null;

  // catat log perubahan status ke database
  await db.query(
    `INSERT INTO report_status_logs
    (report_id, old_status, new_status, changed_by, changer_role, notes)
    VALUES (?, ?, ?, ?, ?, ?)`,
    [id, old_status, new_status, changed_by, changer_role, finalNotes]
  );

  // tentukan isi notifikasi berdasarkan status baru
  let notifTitle = "Update Laporan";
  let notifMessage = "";

  if (new_status === "rejected") { // notifikasi khusus jika laporan ditolak
    notifTitle = "Laporan Ditolak";
    notifMessage =
      rejection_reason ||
      `Laporan "${report.title}" ditolak oleh admin`;
  } else { // notifikasi umum untuk status lainnya
    notifMessage =
      `Laporan "${report.title}" sekarang berstatus ${new_status}`;
  }

  if (admin_notes?.trim()) { // tambahkan catatan admin ke notifikasi jika ada
    notifMessage += ` Catatan: "${admin_notes}"`;
  }

  // kirim notifikasi ke user pelapor
  await createNotification(report.user_id, notifTitle, notifMessage, id);

  res.json({ message: "Status laporan berhasil diperbarui" });
};

// SUPERADMIN: UPDATE PRIORITAS LAPORAN
export const setReportPriority = async (req, res) => {
  const { id } = req.params;     // ambil ID laporan dari URL
  const { priority } = req.body; // ambil prioritas yang dipilih

  const validPriorities = ["low", "medium", "high", "emergency"]; // daftar prioritas yang valid

  if (!validPriorities.includes(priority)) { // validasi nilai prioritas
    return res.status(400).json({
      message: "Prioritas tidak valid",
    });
  }

  // cek apakah laporan ada di database
  const [report] = await db.query(
    `SELECT id, user_id, priority
     FROM reports
     WHERE id = ?`,
    [id]
  );

  if (report.length === 0) { // laporan tidak ditemukan
    return res.status(404).json({
      message: "Laporan tidak ditemukan",
    });
  }

  const oldPriority = report[0].priority; // simpan prioritas lama

  // update prioritas dan tandai sudah di-set oleh superadmin
  await db.query(
    `UPDATE reports
    SET priority = ?,
        priority_set = TRUE,
        updated_at = NOW()
    WHERE id = ?`,
    [priority, id]
  );

  // kirim notifikasi ke user pelapor bahwa prioritas sudah diatur
  await createNotification(
    report[0].user_id,
    "Prioritas Laporan Diperbarui",
    `Prioritas laporan Anda diubah menjadi ${priority}`,
    id
  );

  // ambil semua admin untuk dinotifikasi
  const [admins] = await db.query(`
    SELECT id FROM users WHERE role = 'admin'
  `);

  // kirim notifikasi ke setiap admin bahwa laporan siap diproses
  for (const admin of admins) {
    await createNotification(
      admin.id,
      "Laporan Siap Diproses",
      `Laporan #${id} telah diprioritaskan menjadi ${priority}`,
      id
    );
  }

  // kirim respons sukses beserta info perubahan prioritas
  res.json({
    message: "Prioritas laporan berhasil diperbarui",
    old_priority: oldPriority,
    new_priority: priority,
  });
};

// CATEGORY
export const getCategories = async (req, res) => {

  // ambil semua kategori dari database
  const [rows] = await db.query("SELECT * FROM categories");
  res.json(rows); // kirim daftar kategori
};

// DELETE report (by admin)
export const deleteReport = async (req, res) => {
  const { id } = req.params; // ambil ID laporan dari URL

  await db.query("DELETE FROM report_status_logs WHERE report_id = ?", [id]); // hapus log status dulu (foreign key)
  await db.query("DELETE FROM reports WHERE id = ?", [id]); // baru hapus laporan utamanya

  res.json({ message: "Laporan berhasil dihapus" });
};

// USER: Edit laporan 
export const updateMyReport = async (req, res) => {
  const { id } = req.params; // ambil ID laporan dari URL
  const {
    title,
    description,
    incident_location,
    incident_date,
    latitude,
    longitude,
    remove_foto // flag untuk menghapus foto yang ada
  } = req.body;

  // pastikan laporan ada dan milik user yang login
  const [report] = await db.query(
    `SELECT * FROM reports WHERE id = ? AND user_id = ?`,
    [id, req.user.id]
  );

  if (report.length === 0) { // laporan tidak ditemukan
    return res.status(404).json({ message: "Laporan tidak ditemukan" });
  }

  if (report[0].status !== "pending") { // hanya laporan pending yang bisa diedit
    return res.status(403).json({ message: "Laporan yang sudah diproses tidak dapat diedit" });
  }

  let bukti_foto = report[0].bukti_foto; // default pakai foto lama

  if (remove_foto === "true") { // jika user minta hapus foto
    bukti_foto = null;
  }

  if (req.file) { // jika ada foto baru yang diupload
    try {
      const fileExt = req.file.originalname.split(".").pop(); // ambil ekstensi file
      const fileName = `report-${req.user.id}-${Date.now()}.${fileExt}`; // buat nama file unik

      const { error: uploadError } = await supabase.storage
        .from("report-images") // target bucket Supabase
        .upload(fileName, req.file.buffer, {
          contentType: req.file.mimetype, // set tipe konten file
          upsert: false, // jangan timpa file yang sudah ada
        });

      if (uploadError) { // upload gagal
        return res.status(500).json({ message: "Gagal upload foto", error: uploadError.message });
      }

      const { data: { publicUrl } } = supabase.storage
        .from("report-images")
        .getPublicUrl(fileName); // ambil URL publik foto baru

      bukti_foto = publicUrl; // ganti dengan URL foto baru
    } catch (err) { // tangkap error tak terduga
      return res.status(500).json({ message: "Kesalahan saat upload foto", error: err.message });
    }
  }

  // update semua field laporan ke database
  await db.query(
    `UPDATE reports
    SET title = ?,
        description = ?,
        incident_location = ?,
        incident_date = ?,
        latitude = ?,
        longitude = ?,
        bukti_foto = ?,
        updated_at = NOW()
    WHERE id = ?`,
    [title, description, incident_location, incident_date, latitude, longitude, bukti_foto, id]
  );

  res.json({ message: "Laporan berhasil diperbarui" });
};

// USER: Hapus laporan sendiri
export const deleteMyReport = async (req, res) => {
  const { id } = req.params; // ambil ID laporan dari URL

  // pastikan laporan ada dan milik user yang login
  const [report] = await db.query(
    `SELECT * FROM reports WHERE id = ? AND user_id = ?`,
    [id, req.user.id]
  );

  if (report.length === 0) { // laporan tidak ditemukan
    return res.status(404).json({
      message: "Laporan tidak ditemukan",
    });
  }

  if (report[0].status !== "pending") { // hanya laporan pending yang bisa dihapus
    return res.status(403).json({
      message: "Laporan yang sudah diproses tidak dapat dihapus",
    });
  }

  // hapus laporan dari database
  await db.query("DELETE FROM reports WHERE id = ?", [id]);

  res.json({ message: "Laporan berhasil dihapus" });
};