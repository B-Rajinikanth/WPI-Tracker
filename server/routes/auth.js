"use strict";
const router  = require("express").Router();
const bcrypt  = require("bcryptjs");
const User    = require("../models/User");

/* POST /api/auth/login */
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Username and password required" });

    const user = await User.findOne({ username: username.toLowerCase().trim() });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });
    if (!user.isActive) return res.status(403).json({ error: "Account is deactivated. Contact the admin." });

    res.json({ id: user._id, username: user.username, name: user.name, role: user.role, studentId: user.studentId || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* GET /api/auth/users — list all users (admin only, enforced client-side) */
router.get("/users", async (_req, res) => {
  const users = await User.find({}, "-passwordHash").lean();
  res.json(users);
}); // displayPassword is included (passwordHash is excluded)

/* POST /api/auth/users — create user */
router.post("/users", async (req, res) => {
  try {
    const { username, password, role, studentId, name } = req.body;
    if (!username || !password || !role || !name)
      return res.status(400).json({ error: "username, password, role, and name are required" });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      username: username.toLowerCase().trim(),
      passwordHash, displayPassword: password, role,
      studentId: studentId || null,
      name,
    });
    res.json({ id: user._id, username: user.username, name: user.name, role: user.role, studentId: user.studentId });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: "Username already exists" });
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/auth/users/bulk-students — create accounts for all students not yet registered */
router.post("/users/bulk-students", async (req, res) => {
  try {
    const Student = require("../models/Student");
    const students = await Student.find({}).lean();
    const defaultHash = await bcrypt.hash("Student@123", 10);

    let created = 0, skipped = 0;
    const errors = [];

    for (const s of students) {
      try {
        const username = String(s.urn).toLowerCase().trim();
        const existing = await User.findOne({ username });
        if (existing) { skipped++; continue; }
        await User.create({
          username,
          passwordHash: defaultHash,
          displayPassword: "Student@123",
          role: "student",
          studentId: s.id,
          name: s.name,
        });
        created++;
      } catch (e) {
        if (e.code === 11000) { skipped++; }
        else { errors.push(`${s.urn}: ${e.message}`); }
      }
    }

    res.json({ created, skipped, errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* PUT /api/auth/users/:id/toggle-active — admin toggles user active/inactive */
router.put("/users/:id/toggle-active", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.role === "admin") return res.status(400).json({ error: "Cannot deactivate admin accounts" });
    user.isActive = !user.isActive;
    await user.save();
    res.json({ isActive: user.isActive });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* PUT /api/auth/users/:id/role — admin changes a user's role */
router.put("/users/:id/role", async (req, res) => {
  try {
    const { role } = req.body;
    if (!["admin", "faculty", "student"].includes(role))
      return res.status(400).json({ error: "Invalid role" });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.role === "admin") return res.status(400).json({ error: "Cannot change admin role" });
    user.role = role;
    if (role !== "student") user.studentId = null;
    await user.save();
    res.json({ role: user.role, studentId: user.studentId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/auth/users/bulk-faculty — create faculty accounts from uploaded list */
router.post("/users/bulk-faculty", async (req, res) => {
  try {
    const { users: list = [] } = req.body;
    if (!list.length) return res.status(400).json({ error: "No users provided" });

    let created = 0, skipped = 0;
    const errors = [];

    for (const f of list) {
      try {
        const username = String(f.username || "").toLowerCase().trim();
        const name     = String(f.name     || "").trim();
        const password = String(f.password || "Faculty@123").trim() || "Faculty@123";
        if (!username || !name) { errors.push(`Row skipped — missing name or username`); continue; }

        const existing = await User.findOne({ username });
        if (existing) { skipped++; continue; }

        const passwordHash = await bcrypt.hash(password, 10);
        await User.create({ username, passwordHash, displayPassword: password, role: "faculty", name });
        created++;
      } catch (e) {
        if (e.code === 11000) skipped++;
        else errors.push(`${f.username}: ${e.message}`);
      }
    }

    res.json({ created, skipped, errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* DELETE /api/auth/users/:id */
router.delete("/users/:id", async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

/* PUT /api/auth/users/:id/password — admin resets any user's password */
router.put("/users/:id/password", async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: "Password required" });
    const passwordHash = await bcrypt.hash(password, 10);
    await User.findByIdAndUpdate(req.params.id, { passwordHash, displayPassword: password });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* PUT /api/auth/me/password — any user changes their own password */
router.put("/me/password", async (req, res) => {
  try {
    const { userId, oldPassword, newPassword } = req.body;
    if (!userId || !oldPassword || !newPassword)
      return res.status(400).json({ error: "userId, oldPassword, and newPassword are required" });
    if (newPassword.length < 6)
      return res.status(400).json({ error: "New password must be at least 6 characters" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const valid = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!valid) return res.status(401).json({ error: "Current password is incorrect" });

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await User.findByIdAndUpdate(userId, { passwordHash, displayPassword: newPassword });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
