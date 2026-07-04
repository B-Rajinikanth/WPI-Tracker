const router  = require("express").Router();
const Student = require("../models/Student");
const Record  = require("../models/Record");

// GET all students
router.get("/", async (_req, res) => {
  try {
    const students = await Student.find().sort({ name: 1 }).lean();
    res.json(students);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST create student
router.post("/", async (req, res) => {
  try {
    const student = await Student.findOneAndUpdate(
      { id: req.body.id },
      req.body,
      { upsert: true, new: true, runValidators: true }
    );
    res.status(201).json(student);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// PUT update student
router.put("/:id", async (req, res) => {
  try {
    const student = await Student.findOneAndUpdate(
      { id: req.params.id },
      req.body,
      { new: true, runValidators: true }
    );
    if (!student) return res.status(404).json({ error: "Student not found" });
    res.json(student);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// DELETE student + their records
router.delete("/:id", async (req, res) => {
  try {
    await Promise.all([
      Student.deleteOne({ id: req.params.id }),
      Record.deleteMany({ studentId: req.params.id }),
    ]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST bulk import
router.post("/bulk", async (req, res) => {
  try {
    const { students = [] } = req.body;
    if (!students.length) return res.json({ ok: true, count: 0 });
    await Student.bulkWrite(
      students.map(s => ({
        replaceOne: { filter: { id: s.id }, replacement: s, upsert: true },
      })),
      { ordered: false }
    );
    res.json({ ok: true, count: students.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
