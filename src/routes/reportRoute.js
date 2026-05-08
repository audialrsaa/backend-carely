import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

// Public
router.get("/categories", getCategories);

// User routes
router.post("/", verifyToken, allowRoles("user"), upload.single("bukti_foto"), createReport);
router.get("/my", verifyToken, allowRoles("user"), getMyReports);
router.get("/my/:id", verifyToken, allowRoles("user"), getMyReportDetail);

// Admin + Superadmin
router.get("/", verifyToken, allowRoles("admin", "superadmin"), getAllReports);
router.get("/:id", verifyToken, allowRoles("admin", "superadmin"), getReportDetail);
router.put("/:id/status", verifyToken, allowRoles("admin", "superadmin"), updateReportStatus);

// Superadmin only
router.put("/:id/priority", verifyToken, allowRoles("superadmin"), setReportPriority);

export default router;