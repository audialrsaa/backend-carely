import db from "../config/db.js";
import bcrypt from "bcryptjs";

// get own profile
export const getOwnProfile = async (req, res) => {

  // mengambil data profil berdasarkan id user yang login
  const [rows] = await db.query(
    "SELECT id, full_name, email, phone, address, role, created_at FROM users WHERE id = ?",
    [req.user.id]
  );

  // mengirim data profil ke frontend
  res.json(rows[0]);
};

// update own profile
export const updateOwnProfile = async (req, res) => {

  // mengambil data yang diinput user
  const { full_name, phone, address } = req.body;

  // memperbarui data profil user di database
  await db.query(
    "UPDATE users SET full_name = ?, phone = ?, address = ? WHERE id = ?",
    [full_name, phone, address, req.user.id]
  );

  // mengirim response berhasil
  res.json({
    message: "profil berhasil diupdate"
  });
};

// change own password
export const changeOwnPassword = async (req, res) => {

  // mengambil password lama dan password baru
  const { old_password, new_password } = req.body;

  // mengambil password user yang tersimpan di database
  const [rows] = await db.query(
    "SELECT password FROM users WHERE id = ?",
    [req.user.id]
  );

  // membandingkan password lama dengan password database
  const match = await bcrypt.compare(
    old_password,
    rows[0].password
  );

  // jika password lama salah maka proses dibatalkan
  if (!match) {
    return res.status(400).json({
      message: "password lama salah"
    });
  }

  // mengenkripsi password baru
  const hashed = await bcrypt.hash(
    new_password,
    10
  );

  // menyimpan password baru ke database
  await db.query(
    "UPDATE users SET password = ? WHERE id = ?",
    [hashed, req.user.id]
  );

  // mengirim response berhasil
  res.json({
    message: "password berhasil diubah"
  });
};