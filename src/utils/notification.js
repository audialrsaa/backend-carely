import db from "../config/db.js";

export const createNotification = async (
  userId,
  title,
  message,
  reportId = null
) => {
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