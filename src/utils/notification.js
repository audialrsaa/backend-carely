import db from "../config/db.js";

// create notification
export const createNotification = async (
  userId,
  title,
  message,
  reportId = null
) => {

  // menyimpan data notifikasi ke tabel notifications
  await db.query(
    `
    INSERT INTO notifications
    (
      user_id,
      title,
      message,
      report_id
    )
    VALUES (?, ?, ?, ?)
    `,
    [
      userId,
      title,
      message,
      reportId,
    ]
  );
};