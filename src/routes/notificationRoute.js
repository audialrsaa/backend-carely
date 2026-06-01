import express from "express";
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
} from "../controllers/notificationController.js";

import { verifyToken } from "../middleware/auth.js";

const router = express.Router();

// ambil semua notif user login
router.get(
  "/",
  verifyToken,
  getNotifications
);

// jumlah notif belum dibaca
router.get(
  "/unread-count",
  verifyToken,
  getUnreadCount
);

// tandai semua notif dibaca
router.put(
  "/mark-all-read",
  verifyToken,
  markAllAsRead
);

// tandai 1 notif dibaca
router.put(
  "/:id/read",
  verifyToken,
  markAsRead
);

export default router;