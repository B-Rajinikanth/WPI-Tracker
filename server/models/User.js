const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash:    { type: String, required: true },
  displayPassword: { type: String, default: "" },
  role:            { type: String, enum: ["admin", "faculty", "student"], required: true },
  studentId:       { type: String, default: null },
  name:            { type: String, required: true },
  isActive:        { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
