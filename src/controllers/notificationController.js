import db from "../config/db.js";

// get notif 
export const getNotifications = async (req, res) => {

  // ambil seluruh notifikasi user
  // dan urutin dari yang terbaru
  const [rows] = await db.query(
    `
    SELECT *
    FROM notifications
    WHERE user_id = ?
    ORDER BY created_at DESC
    `,
    [req.user.id]
  );

  // kirim daftar notifikasi ke frontend
  res.json(rows);
};

// mark as read
export const markAsRead = async (req, res) => {

  // ambil ID notifikasi dari parameter URL
  const { id } = req.params;

  // ubah status notifikasi menjadi sudah dibaca
  await db.query(
    `
    UPDATE notifications
    SET is_read = TRUE
    WHERE id = ?
    `,
    [id]
  );

  // kirim response berhasil
  res.json({
    message: "Notif dibaca",
  });
};

// mark all as read
export const markAllAsRead = async (req, res) => {

  // ubah seluruh notifikasi milik user
  // menjadi status sudah dibaca
  await db.query(
    `
    UPDATE notifications
    SET is_read = TRUE
    WHERE user_id = ?
    `,
    [req.user.id]
  );

  // kirim response berhasil
  res.json({
    message: "Semua notif dibaca",
  });
};

// get unread count
export const getUnreadCount = async (req, res) => {

  // hitung jumlah notifikasi yang masih unread
  const [rows] = await db.query(
    `
    SELECT COUNT(*) as total
    FROM notifications
    WHERE user_id = ?
    AND is_read = FALSE
    `,
    [req.user.id]
  );

  // kirim total notifikasi belum dibaca
  res.json({
    total: rows[0].total,
  });
};