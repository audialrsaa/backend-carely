import express from "express";
import {
  getDashboardStats,
  getAdminDashboard,
  getAllUsers,
  getAllAdmins,
  createAdmin,
  deleteAdmin,
  deleteUser,
  getAuditLogs,
} from "../controllers/adminController.js";
import { verifyToken, allowRoles } from "../middleware/auth.js";

const router = express.Router();

// Dashboard
router.get("/dashboard", verifyToken, allowRoles("admin", "superadmin"), getAdminDashboard);
router.get("/dashboard/super", verifyToken, allowRoles("superadmin"), getDashboardStats);

// User management
router.get("/users", verifyToken, allowRoles("superadmin"), getAllUsers);
router.delete("/users/:id", verifyToken, allowRoles("superadmin"), deleteUser);

// Admin management
router.get("/admins", verifyToken, allowRoles("superadmin"), getAllAdmins);
router.post("/admins", verifyToken, allowRoles("superadmin"), createAdmin);
router.delete("/admins/:id", verifyToken, allowRoles("superadmin"), deleteAdmin);

// Logs
router.get("/audit-logs", verifyToken, allowRoles("superadmin"), getAuditLogs);

export default router;