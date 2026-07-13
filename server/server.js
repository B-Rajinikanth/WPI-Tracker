/* =========================================================
   WPI Tracker – Express + MongoDB Atlas API Server
   ========================================================= */
"use strict";

require("dotenv").config();
const express  = require("express");
const cors     = require("cors");
const mongoose = require("mongoose");

const app  = express();
const PORT = process.env.PORT || 5001;

// ── Middleware ────────────────────────────────────────────
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "50mb" }));

// ── MongoDB connection ────────────────────────────────────
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("✅  MongoDB Atlas connected"))
  .catch(err => {
    console.error("❌  MongoDB connection error:", err.message);
    process.exit(1);
  });

// ── Routes ────────────────────────────────────────────────
app.use("/api/students", require("./routes/students"));
app.use("/api/records",  require("./routes/records"));
app.use("/api/settings", require("./routes/settings"));
app.use("/api/auth",     require("./routes/auth"));

// GET /api/data – load everything in one request (used on app boot)
app.get("/api/data", async (_req, res) => {
  try {
    const Student  = require("./models/Student");
    const Record   = require("./models/Record");
    const Settings = require("./models/Settings");

    const [students, records, settings] = await Promise.all([
      Student.find().lean(),
      Record.find().lean(),
      Settings.findById("main").lean(),
    ]);

    res.json({
      students,
      records,
      weeks      : settings?.weeks      || [],
      activeWeek : settings?.activeWeek || "",
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Seed default admin on first run
async function seedAdmin() {
  const bcrypt = require("bcryptjs");
  const User   = require("./models/User");
  const exists = await User.findOne({ role: "admin" });
  if (!exists) {
    const passwordHash = await bcrypt.hash("Admin@123", 10);
    await User.create({ username: "admin", passwordHash, role: "admin", name: "Administrator" });
    console.log("🔑  Default admin created — username: admin  password: Admin@123");
  }
}
mongoose.connection.once("open", seedAdmin);

// Health check
app.get("/api/health", (_req, res) =>
  res.json({ ok: true, ts: new Date().toISOString() })
);

// ── Global error handler ──────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`\n🚀  WPI Tracker API  →  http://localhost:${PORT}`);
  console.log(`    Health check     →  http://localhost:${PORT}/api/health\n`);
});
