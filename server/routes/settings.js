const router   = require("express").Router();
const Settings = require("../models/Settings");

// GET settings
router.get("/", async (_req, res) => {
  try {
    const s = await Settings.findById("main").lean();
    res.json(s || { weeks: [], activeWeek: "" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT update settings
router.put("/", async (req, res) => {
  try {
    const s = await Settings.findByIdAndUpdate(
      "main",
      { $set: req.body },
      { upsert: true, new: true }
    );
    res.json(s);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
