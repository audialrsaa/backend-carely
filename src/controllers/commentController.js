import db from "../config/db.js";

// ======================================================
// GET COMMENTS BY REPORT ID
// User: hanya laporan sendiri
// Admin/Superadmin: bebas lihat
// ======================================================
export const getCommentsByReport = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    // Cek report ada
    const [[report]] = await db.query(
      "SELECT id, user_id, status FROM reports WHERE id = ?",
      [id]
    );

    if (!report) {
      return res.status(404).json({ message: "Laporan tidak ditemukan" });
    }

    // User hanya boleh lihat laporan miliknya
    if (user.role === "user" && report.user_id !== user.id) {
      return res.status(403).json({ message: "Akses ditolak" });
    }

    const [comments] = await db.query(
      `SELECT 
          rc.id,
          rc.comment,
          rc.created_at,
          rc.updated_at,
          u.id as user_id,
          u.full_name,
          u.role
       FROM report_comments rc
       JOIN users u ON rc.user_id = u.id
       WHERE rc.report_id = ?
       ORDER BY rc.created_at ASC`,
      [id]
    );

    res.json(comments);
  } catch (error) {
    console.error("Get Comments Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ======================================================
// ADD COMMENT
// User: hanya laporan sendiri + laporan belum selesai/rejected
// Admin: bebas
// Superadmin: tidak boleh
// ======================================================
export const addComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { comment } = req.body;
    const user = req.user;

    if (!comment || !comment.trim()) {
      return res.status(400).json({ message: "Komentar wajib diisi" });
    }

    // Superadmin tidak boleh komentar
    if (user.role === "superadmin") {
      return res.status(403).json({
        message: "Superadmin hanya dapat melihat komentar",
      });
    }

    // Cek laporan
    const [[report]] = await db.query(
      "SELECT id, user_id, status FROM reports WHERE id = ?",
      [id]
    );

    if (!report) {
      return res.status(404).json({ message: "Laporan tidak ditemukan" });
    }

    // User hanya boleh komentar di laporan miliknya
    if (user.role === "user") {
      if (report.user_id !== user.id) {
        return res.status(403).json({ message: "Akses ditolak" });
      }

      // User tidak bisa komentar jika laporan selesai / rejected
      if (["selesai", "rejected"].includes(report.status)) {
        return res.status(403).json({
          message: "Komentar ditutup untuk laporan ini",
        });
      }
    }

    await db.query(
      `INSERT INTO report_comments 
       (report_id, user_id, comment)
       VALUES (?, ?, ?)`,
      [id, user.id, comment]
    );

    res.status(201).json({
      message: "Komentar berhasil ditambahkan",
    });
  } catch (error) {
    console.error("Add Comment Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};