import express from "express";
import { getOwnProfile, updateOwnProfile, changeOwnPassword } from "../controllers/userController.js";
import { verifyToken, allowRoles } from "../middleware/auth.js";

const router = express.Router();

// Profile — semua role bisa akses
router.get("/profile", verifyToken, getOwnProfile);

// Edit profile — hanya user biasa (admin dan superadmin tidak bisa edit profile)
router.put("/profile", verifyToken, allowRoles("user"), updateOwnProfile);

// Ganti password — semua role bisa
router.put("/change-password", verifyToken, changeOwnPassword);

export default router;