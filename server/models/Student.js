const mongoose = require("mongoose");

const StudentSchema = new mongoose.Schema({
  id       : { type: String, required: true, unique: true },
  urn      : { type: String, required: true },
  name     : { type: String, required: true },
  dept     : { type: String, required: true },
  email    : { type: String, default: "" },
}, { timestamps: true, versionKey: false });

StudentSchema.index({ urn: 1 });
StudentSchema.index({ dept: 1 });

module.exports = mongoose.model("Student", StudentSchema);
