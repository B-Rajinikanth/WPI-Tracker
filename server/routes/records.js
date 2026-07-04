const router = require("express").Router();
const Record = require("../models/Record");

// GET records (optional ?week=&studentId= filters)
router.get("/", async (req, res) => {
  try {
    const filter = {};
    if (req.query.week)      filter.week      = req.query.week;
    if (req.query.studentId) filter.studentId = req.query.studentId;
    const records = await Record.find(filter).lean();
    res.json(records);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST create/update record (upsert by studentId+week)
router.post("/", async (req, res) => {
  try {
    const record = await Record.findOneAndUpdate(
      { studentId: req.body.studentId, week: req.body.week },
      req.body,
      { upsert: true, new: true, runValidators: false }
    );
    res.status(201).json(record);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// DELETE record by id
router.delete("/:id", async (req, res) => {
  try {
    await Record.deleteOne({ id: req.params.id });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST bulk import records
router.post("/bulk", async (req, res) => {
  try {
    const { records = [] } = req.body;
    if (!records.length) return res.json({ ok: true, count: 0 });
    await Record.bulkWrite(
      records.map(r => ({
        replaceOne: {
          filter      : { studentId: r.studentId, week: r.week },
          replacement : r,
          upsert      : true,
        },
      })),
      { ordered: false }
    );
    res.json({ ok: true, count: records.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
