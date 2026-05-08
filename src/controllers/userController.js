import db from "../config/db.js";
import bcrypt from "bcryptjs";

// GET profile sendiri
export const getOwnProfile = async (req, res) => {
  const [rows] = await db.query(
    "SELECT id, full_name, email, phone, address, role, created_at FROM users WHERE id = ?",
    [req.user.id]
  );
  res.json(rows[0]);
};

// UPDATE profile sendiri (hanya user, bukan admin/superadmin)
export const updateOwnProfile = async (req, res) => {
  const { full_name, phone, address } = req.body;
  await db.query(
    "UPDATE users SET full_name = ?, phone = ?, address = ? WHERE id = ?",
    [full_name, phone, address, req.user.id]
  );
  res.json({ message: "Profil berhasil diupdate" });
};

// CHANGE PASSWORD
export const changeOwnPassword = async (req, res) => {
  const { old_password, new_password } = req.body;

  const [rows] = await db.query("SELECT password FROM users WHERE id = ?", [req.user.id]);
  const match = await bcrypt.compare(old_password, rows[0].password);
  if (!match) {
    return res.status(400).json({ message: "Password lama salah" });
  }

  const hashed = await bcrypt.hash(new_password, 10);
  await db.query("UPDATE users SET password = ? WHERE id = ?", [hashed, req.user.id]);
  res.json({ message: "Password berhasil diubah" });
};