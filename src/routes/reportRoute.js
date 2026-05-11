// src/routes/reportRoute.js
// FULL BAGIAN MULTER — GANTI YANG LAMA DENGAN INI

import express from "express";
import multer from "multer";
import {
  createReport,
  getMyReports,
  getMyReportDetail,
  getAllReports,
  getReportDetail,
  updateReportStatus,
  setReportPriority,
  getCategories,
} from "../controllers/reportController.js";
import { verifyToken, allowRoles } from "../middleware/auth.js";

const router = express.Router();

// =========================
// MULTER MEMORY STORAGE
// =========================
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // max 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/jpg", "image/webp"];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Format file harus JPG, PNG, JPEG, atau WEBP"), false);
    }
  },
});

// =========================
// PUBLIC
// =========================
router.get("/categories", getCategories);

// =========================
// USER ROUTES
// =========================
router.post(
  "/",
  verifyToken,
  allowRoles("user"),
  upload.single("bukti_foto"),
  createReport
);

router.get("/my", verifyToken, allowRoles("user"), getMyReports);

router.get("/my/:id", verifyToken, allowRoles("user"), getMyReportDetail);

// =========================
// ADMIN + SUPERADMIN
// =========================
router.get("/", verifyToken, allowRoles("admin", "superadmin"), getAllReports);

router.get("/:id", verifyToken, allowRoles("admin", "superadmin"), getReportDetail);

router.put(
  "/:id/status",
  verifyToken,
  allowRoles("admin", "superadmin"),
  updateReportStatus
);

// =========================
// SUPERADMIN ONLY
// =========================
router.put(
  "/:id/priority",
  verifyToken,
  allowRoles("superadmin"),
  setReportPriority
);

export default router;