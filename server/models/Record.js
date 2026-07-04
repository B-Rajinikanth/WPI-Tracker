const mongoose = require("mongoose");

const ComputedSchema = new mongoose.Schema({
  T          : Number,
  A          : Number,
  C          : Number,
  D          : Number,
  WPI        : Number,
  band       : String,
  floorFails : [String],
}, { _id: false });

const RecordSchema = new mongoose.Schema({
  id          : { type: String, required: true, unique: true },
  studentId   : { type: String, required: true },
  week        : { type: String, required: true },
  // Technical
  uniContest      : { type: Number, default: null },
  vendorScore     : { type: Number, default: null },
  coreSubject     : { type: Number, default: null },
  skillActivities : { type: Number, default: null },
  probAttempted   : { type: Number, default: null },
  probSolved      : { type: Number, default: null },
  // Aptitude
  quant    : { type: Number, default: null },
  logical  : { type: Number, default: null },
  verbal   : { type: Number, default: null },
  // Communication
  gd         : { type: Number, default: null },
  mock       : { type: Number, default: null },
  confidence : { type: Number, default: null },
  // Discipline
  attendance           : { type: Number, default: null },
  contestParticipation : { type: Number, default: 0 },
  proctoredContest     : { type: Number, default: 0 },
  // Computed
  computed : ComputedSchema,
}, { timestamps: true, versionKey: false });

RecordSchema.index({ studentId: 1, week: 1 }, { unique: true });
RecordSchema.index({ week: 1 });

module.exports = mongoose.model("Record", RecordSchema);
