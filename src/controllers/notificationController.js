import db from "../config/db.js";

export const getNotifications = async (req, res) => {
  const [rows] = await db.query(
    `
    SELECT *
    FROM notifications
    WHERE user_id = ?
    ORDER BY created_at DESC
    `,
    [req.user.id]
  );

  res.json(rows);
};

export const markAsRead = async (req, res) => {
  const { id } = req.params;

  await db.query(
    `
    UPDATE notifications
    SET is_read = TRUE
    WHERE id = ?
    `,
    [id]
  );

  res.json({
    message: "Notif dibaca",
  });
};

export const markAllAsRead = async (req, res) => {
  await db.query(
    `
    UPDATE notifications
    SET is_read = TRUE
    WHERE user_id = ?
    `,
    [req.user.id]
  );

  res.json({
    message: "Semua notif dibaca",
  });
};

export const getUnreadCount = async (req, res) => {
  const [rows] = await db.query(
    `
    SELECT COUNT(*) as total
    FROM notifications
    WHERE user_id = ?
    AND is_read = FALSE
    `,
    [req.user.id]
  );

  res.json({
    total: rows[0].total,
  });
};