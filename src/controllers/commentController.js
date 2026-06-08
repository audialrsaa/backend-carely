import db from "../config/db.js";
import { createNotification } from "../utils/notification.js";

// get comment by report-id
export const getCommentsByReport = async (req, res) => {
  try {
    // ambil ID laporan dari parameter URL
    const { id } = req.params;

    // ambil data user yang sedang login
    const user = req.user;

    // cek apakah laporan yang diminta ada
    const [[report]] = await db.query(
      `
      SELECT
        r.id,
        r.user_id,
        r.status,
        r.title
      FROM reports r
      WHERE r.id = ?
      `,
      [id]
    );

    // kalau laporan tidak ditemukan
    if (!report) {
      return res.status(404).json({
        message: "Laporan tidak ditemukan"
      });
    }

    // user biasa hanya boleh melihat komentar
    // pada laporan miliknya sendiri
    if (user.role === "user" && report.user_id !== user.id) {
      return res.status(403).json({
        message: "Akses ditolak"
      });
    }

    // ambil seluruh komentar pada laporan
    // beserta data pembuat komentar
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

    // kirim daftar komentar ke frontend
    res.json(comments);

  } catch (error) {

    // tampilin error ke console
    console.error("Get Comments Error:", error);

    // kirim response server error
    res.status(500).json({
      message: "Server error"
    });
  }
};

// tambah comment
export const addComment = async (req, res) => {
  try {

    // ambil ID laporan
    const { id } = req.params;

    // ambil isi komentar dari request body
    const { comment } = req.body;

    // ambil data user yang sedang login
    const user = req.user;

    // pastiin komentar tidak kosong
    if (!comment || !comment.trim()) {
      return res.status(400).json({
        message: "Komentar wajib diisi"
      });
    }

    // superadmin cuma boleh melihat komentar
    // dan ga boleh menambahkan komentar
    if (user.role === "superadmin") {
      return res.status(403).json({
        message: "Superadmin hanya dapat melihat komentar",
      });
    }

    // cek apakah laporan ada
    const [[report]] = await db.query(
      `
      SELECT
        id,
        user_id,
        status,
        title
      FROM reports
      WHERE id = ?
      `,
      [id]
    );

    // kalau laporan tidak ditemukan
    if (!report) {
      return res.status(404).json({
        message: "Laporan tidak ditemukan",
      });
    }

    // user biasa hanya boleh memberi komentar
    // pada laporan miliknya sendiri
    if (user.role === "user") {

      if (report.user_id !== user.id) {
        return res.status(403).json({
          message: "Akses ditolak"
        });
      }

      // user tidak dapat berkomentar jika
      // laporan sudah selesai atau ditolak
      if (["selesai", "rejected"].includes(report.status)) {
        return res.status(403).json({
          message: "Komentar ditutup untuk laporan ini",
        });
      }
    }

    // simpan komentar ke database
    await db.query(
      `
      INSERT INTO report_comments
      (
        report_id,
        user_id,
        comment
      )
      VALUES (?, ?, ?)
      `,
      [id, user.id, comment]
    );

    // notif setelah komentar ditambah

    // kalau komentar dibuat oleh admin
    // kirim notifikasi ke pelapor
    if (user.role === "admin") {

      await createNotification(
        report.user_id,
        "Komentar Baru",
        `Admin menambahkan komentar pada laporan "${report.title}"`,
        id
      );
    }

    // kalau komentar dibuat oleh pelapor/user
    // kirim notifikasi ke seluruh admin
    if (user.role === "user") {

      const [admins] = await db.query(`
        SELECT id
        FROM users
        WHERE role = 'admin'
      `);

      for (const admin of admins) {

        await createNotification(
          admin.id,
          "Balasan Pelapor",
          `Pelapor menambahkan komentar pada laporan "${report.title}"`,
          id
        );
      }
    }

    // kirim response berhasil
    res.status(201).json({
      message: "Komentar berhasil ditambahkan",
    });

  } catch (error) {

    // tampilin error ke console
    console.error("Add Comment Error:", error);

    // kirim response server error
    res.status(500).json({
      message: "Server error"
    });
  }
};