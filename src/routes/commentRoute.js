import express from "express";
import {
  getCommentsByReport,
  addComment,
} from "../controllers/commentController.js";

import { verifyToken, allowRoles } from "../middleware/auth.js";

const router = express.Router();

// User, Admin, Superadmin bisa lihat komentar
router.get(
  "/report/:id",
  verifyToken,
  allowRoles("user", "admin", "superadmin"),
  getCommentsByReport
);

// User + Admin bisa tambah komentar
router.post(
  "/report/:id",
  verifyToken,
  allowRoles("user", "admin"),
  addComment
);

export default router;