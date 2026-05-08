import db from "../config/db.js";

export const getMyNotifications = async (req, res) => {
  const [rows] = await db.query(
    "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC",
    [req.user.id]
  );
  res.json(rows);
};

export const markAsRead = async (req, res) => {
  const { id } = req.params;
  await db.query(
    "UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?",
    [id, req.user.id]
  );
  res.json({ message: "Notifikasi ditandai sudah dibaca" });
};

export const markAllAsRead = async (req, res) => {
  await db.query(
    "UPDATE notifications SET is_read = TRUE WHERE user_id = ?",
    [req.user.id]
  );
  res.json({ message: "Semua notifikasi ditandai sudah dibaca" });
};