import express from "express";
import dotenv from "dotenv";
import cors from "cors";

import authRoute from "./src/routes/authRoute.js";
import adminRoute from "./src/routes/adminRoute.js";
import reportRoute from "./src/routes/reportRoute.js";
import notificationRoute from "./src/routes/notificationRoute.js";
import userRoute from "./src/routes/userRoute.js";
import commentRoute from "./src/routes/commentRoute.js";

dotenv.config();

const app = express();
app.use(cors({
  origin: "http://localhost:3000",
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

app.use(express.json());
app.use("/uploads", express.static("uploads")); // serve foto bukti

app.use("/api/auth", authRoute);
app.use("/api/admin", adminRoute);
app.use("/api/reports", reportRoute);
app.use("/api/notifications", notificationRoute);
app.use("/api/users", userRoute);
app.use("/api/comments", commentRoute);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));