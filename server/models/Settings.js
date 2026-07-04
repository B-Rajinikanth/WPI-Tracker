const mongoose = require("mongoose");

const SettingsSchema = new mongoose.Schema({
  _id        : { type: String, default: "main" },
  weeks      : { type: [String], default: [] },
  activeWeek : { type: String, default: "" },
}, { versionKey: false });

module.exports = mongoose.model("Settings", SettingsSchema);
