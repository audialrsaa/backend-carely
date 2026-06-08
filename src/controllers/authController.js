import db from "../config/db.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

// register
export const register = async (req, res) => {

  // ambil data yang dikirim dari form registrasi
  const { full_name, email, password, phone, address } = req.body;

  // mastiin nama, email, dan password sudah diisi
  if (!full_name || !email || !password) {
    return res.status(400).json({
      message: "Semua field wajib diisi"
    });
  }

  // ek apakah email sudah pernah digunakan
  const [existing] = await db.query(
    "SELECT id FROM users WHERE email = ?",
    [email]
  );

  // kalau email sudah ada maka registrasi dibatalkan
  if (existing.length > 0) {
    return res.status(400).json({
      message: "Email sudah terdaftar"
    });
  }

  // enkrip hash password sebelum disimpan ke database
  const hashed = await bcrypt.hash(password, 10);

  // simpan data user baru ke database
  await db.query(
    "INSERT INTO users (full_name, email, password, phone, address, role) VALUES (?, ?, ?, ?, ?, ?)",
    [
      full_name,
      email,
      hashed,
      phone || null,
      address || null,
      "user"
    ]
  );

  // krim response bahwa registrasi berhasil
  res.status(201).json({
    message: "Registrasi berhasil"
  });
};

// login
export const login = async (req, res) => {

  // ambil email dan password dari form login
  const { email, password } = req.body;

  // cari user berdasarkan email yang dimasukkan
  const [rows] = await db.query(
    "SELECT * FROM users WHERE email = ?",
    [email]
  );

  // kalau email tidak ditemukan maka login gagal
  if (rows.length === 0) {
    return res.status(401).json({
      message: "Email atau password salah"
    });
  }

  // ambil data user yang ditemukan
  const user = rows[0];

  // bandingin password input dengan password terenkripsi di database
  const match = await bcrypt.compare(
    password,
    user.password
  );

  // kalau password tidak cocok maka login gagal
  if (!match) {
    return res.status(401).json({
      message: "Email atau password salah"
    });
  }

  // bikin JWT token yang berisi informasi user
  // token dipakai buat autentikasi di request berikutnya
  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      full_name: user.full_name
    },
    process.env.JWT_SECRET
  );

  // kirim token dan data user ke frontend
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