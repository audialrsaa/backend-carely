import db from "../config/db.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

// REGISTER
export const register = async (req, res) => {
  const { full_name, email, password, phone, address } = req.body;

  if (!full_name || !email || !password) {
    return res.status(400).json({ message: "Semua field wajib diisi" });
  }

  const [existing] = await db.query("SELECT id FROM users WHERE email = ?", [email]);
  if (existing.length > 0) {
    return res.status(400).json({ message: "Email sudah terdaftar" });
  }

  const hashed = await bcrypt.hash(password, 10);
  await db.query(
    "INSERT INTO users (full_name, email, password, phone, address, role) VALUES (?, ?, ?, ?, ?, ?)",
    [full_name, email, hashed, phone || null, address || null, "user"]
  );

  res.status(201).json({ message: "Registrasi berhasil" });
};

// LOGIN
export const login = async (req, res) => {
  const { email, password } = req.body;

  const [rows] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
  if (rows.length === 0) {
    return res.status(401).json({ message: "Email atau password salah" });
  }

  const user = rows[0];
  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return res.status(401).json({ message: "Email atau password salah" });
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, full_name: user.full_name },
    process.env.JWT_SECRET
  );

  res.json({
    message: "Login berhasil",
    token,
    user: {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      role: user.role,
    },
  });
};