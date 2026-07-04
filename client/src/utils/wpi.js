/* =========================================================
   WPI Score Engine – ported from original app.js
   ========================================================= */

export const num    = v => (v === null || v === undefined || v === "" || isNaN(v)) ? 0 : Number(v);
export const clamp  = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const round1 = v => Math.round(v * 10) / 10;
export const pct    = (n, d) => (d ? Math.round((n / d) * 100) : 0);

export function calcScores(r) {
  // T – Technical
  const tv = [r.uniContest, r.vendorScore, r.coreSubject, r.skillActivities]
    .filter(v => v !== null && v !== undefined && v !== "" && !isNaN(v))
    .map(Number);
  let T = tv.length ? tv.reduce((a, b) => a + b, 0) / tv.length : 0;
  if (Number(r.probAttempted) > 0) {
    const ratio = Math.min(Number(r.probSolved) / Number(r.probAttempted), 1) * 100;
    T = tv.length ? T * 0.8 + ratio * 0.2 : ratio;
  }
  T = clamp(round1(T), 0, 100);

  // A – Aptitude
  const A = clamp(round1(num(r.quant) * 0.5 + num(r.logical) * 0.3 + num(r.verbal) * 0.2), 0, 100);

  // C – Communication
  const C = clamp(round1(num(r.gd) * 0.2 + num(r.mock) * 0.6 + num(r.confidence) * 0.2), 0, 100);

  // D – Discipline
  const att      = clamp(num(r.attendance), 0, 100) / 100;
  const contestP = ((num(r.contestParticipation) + num(r.proctoredContest)) / 2) * 100;
  const D        = clamp(round1(att * 0.75 + contestP * 0.25), 0, 100);

  const rawWPI = round1(T * 0.4 + A * 0.25 + C * 0.25 + D * 0.1);

  // Floor score rule
  const floorFails = [];
  if (T < 50) floorFails.push("Technical < 50");
  if (A < 50) floorFails.push("Aptitude < 50");
  if (C < 30) floorFails.push("Communication < 30");

  let band = rawWPI >= 75 ? "A" : rawWPI >= 50 ? "B" : "C";
  if (band === "A" && floorFails.length) band = "B";

  return { T, A, C, D, WPI: rawWPI, band, floorFails };
}

/**
 * Calculate 3-week trend for a student.
 * @param {string} studentId
 * @param {Array}  records   - all records
 * @param {Array}  weeks     - ordered weeks array (context order = chronological)
 * @returns "↑" | "↓" | "⚠" | "→"
 */
export function calcTrend(studentId, records, weeks = []) {
  const sorted = records
    .filter(r => r.studentId === studentId)
    .sort((a, b) => {
      // Use weeks array order if available (handles custom labels correctly)
      if (weeks.length) {
        const ia = weeks.indexOf(a.week);
        const ib = weeks.indexOf(b.week);
        const ra = ia === -1 ? 9999 : ia;
        const rb = ib === -1 ? 9999 : ib;
        return ra - rb;
      }
      return a.week.localeCompare(b.week);
    });

  if (sorted.length < 2) return "→";

  // Take last 3 weeks (or fewer)
  const last3 = sorted.slice(-3).map(r => r.computed?.WPI ?? 0);

  if (last3.length === 2) {
    const diff = last3[1] - last3[0];
    if (diff >  5) return "↑";
    if (diff < -5) return "↓";
    return "→";
  }

  // 3-point analysis
  const [w1, w2, w3] = last3;
  const d1 = w2 - w1;   // slope: week1→week2
  const d2 = w3 - w2;   // slope: week2→week3
  const net = w3 - w1;  // total change over 3 weeks

  // Oscillating: significant reversal in direction
  if (d1 >  4 && d2 < -4) return "⚠";
  if (d1 < -4 && d2 >  4) return "⚠";

  // Consistently rising (both slopes positive, or net gain > 6)
  if (d1 >= 0 && d2 >= 2) return "↑";
  if (d1 >= 2 && d2 >= 0) return "↑";
  if (net >  6) return "↑";

  // Consistently falling (both slopes negative, or net drop > 6)
  if (d1 <= 0 && d2 <= -2) return "↓";
  if (d1 <= -2 && d2 <= 0) return "↓";
  if (net < -6) return "↓";

  return "→";
}

/** Return { trend, wpiHistory } — useful for analytics */
export function calcTrendDetail(studentId, records, weeks = []) {
  const sorted = records
    .filter(r => r.studentId === studentId)
    .sort((a, b) => {
      if (weeks.length) {
        const ia = weeks.indexOf(a.week);
        const ib = weeks.indexOf(b.week);
        return (ia === -1 ? 9999 : ia) - (ib === -1 ? 9999 : ib);
      }
      return a.week.localeCompare(b.week);
    });
  const wpiHistory = sorted.map(r => ({ week: r.week, wpi: r.computed?.WPI ?? 0, band: r.computed?.band }));
  const trend = calcTrend(studentId, records, weeks);
  const last3 = wpiHistory.slice(-3);
  const netChange = last3.length >= 2 ? round1(last3[last3.length - 1].wpi - last3[0].wpi) : 0;
  return { trend, wpiHistory, netChange, last3 };
}

/**
 * Cumulative Performance Index — placement readiness score for a student.
 * Returns null if student has no records.
 */
export function calcCPI(studentId, records, weeks = []) {
  const sorted = records
    .filter(r => r.studentId === studentId)
    .sort((a, b) => {
      if (weeks.length) {
        const ia = weeks.indexOf(a.week);
        const ib = weeks.indexOf(b.week);
        return (ia === -1 ? 9999 : ia) - (ib === -1 ? 9999 : ib);
      }
      return a.week.localeCompare(b.week);
    });

  if (sorted.length === 0) return null;

  const n = sorted.length;
  const totalWeeks = weeks.length || n;

  const avgWPI = round1(sorted.reduce((s, r) => s + (r.computed?.WPI ?? 0), 0) / n);
  const avgT   = round1(sorted.reduce((s, r) => s + (r.computed?.T   ?? 0), 0) / n);
  const avgA   = round1(sorted.reduce((s, r) => s + (r.computed?.A   ?? 0), 0) / n);
  const avgC   = round1(sorted.reduce((s, r) => s + (r.computed?.C   ?? 0), 0) / n);

  // Consistency: penalise high WPI variance
  const vals   = sorted.map(r => r.computed?.WPI ?? 0);
  const mean   = vals.reduce((s, v) => s + v, 0) / n;
  const sigma  = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
  const consistency = round1(Math.max(0, 100 - sigma * 3));

  // Trend score using existing calcTrend
  const trend = calcTrend(studentId, records, weeks);
  const trendScore = trend === "↑" ? 100 : trend === "→" ? 60 : trend === "⚠" ? 30 : 0;

  // Floor compliance: % of weeks where all floors were met
  const floorPass = sorted.filter(r =>
    (r.computed?.T ?? 0) >= 50 &&
    (r.computed?.A ?? 0) >= 50 &&
    (r.computed?.C ?? 0) >= 30
  ).length;
  const floorCompliance = round1((floorPass / n) * 100);

  const cpi = round1(avgWPI * 0.60 + consistency * 0.20 + trendScore * 0.10 + floorCompliance * 0.10);

  const coveragePct = round1((n / totalWeeks) * 100);

  // Hard gates — must all pass to earn a tier
  const gates = {
    avgT:     { pass: avgT >= 55,          label: "Avg Technical ≥ 55",     actual: avgT   },
    avgA:     { pass: avgA >= 55,          label: "Avg Aptitude ≥ 55",      actual: avgA   },
    avgC:     { pass: avgC >= 40,          label: "Avg Communication ≥ 40", actual: avgC   },
    coverage: { pass: coveragePct >= 60,   label: "Weeks attended ≥ 60%",   actual: `${coveragePct}%` },
  };
  const allGatesPassed = Object.values(gates).every(g => g.pass);

  let tier, tierKey;
  if (!allGatesPassed)  { tier = "Gate Fail";        tierKey = "gate";     }
  else if (cpi >= 80)   { tier = "Placement Ready";  tierKey = "ready";    }
  else if (cpi >= 65)   { tier = "Near Ready";        tierKey = "near";     }
  else if (cpi >= 50)   { tier = "In Progress";       tierKey = "progress"; }
  else                  { tier = "Not Ready";          tierKey = "noready";  }

  return {
    cpi, avgWPI, avgT, avgA, avgC,
    consistency, trendScore, floorCompliance,
    trend, coveragePct,
    gates, allGatesPassed,
    tier, tierKey,
    weeksCount: n,
  };
}

export function trendCls(t) {
  if (t === "↑") return "trend-up";
  if (t === "↓") return "trend-down";
  if (t === "⚠") return "trend-osc";
  return "trend-stable";
}

export function actionLabel(band) {
  if (band === "A") return "Advanced Training";
  if (band === "B") return "Guided Practice";
  return "Immediate Intervention";
}

export function isoWeek(d = new Date()) {
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const w    = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(w).padStart(2, "0")}`;
}

export function weekLabel(w) {
  if (!w) return "—";
  if (!/^\d{4}-W\d{2}$/.test(w)) return w;
  const [yr, wn] = w.split("-W").map(Number);
  const jan4     = new Date(yr, 0, 4);
  const start    = new Date(jan4);
  start.setDate(jan4.getDate() - jan4.getDay() + 1 + (wn - 1) * 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = d => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  return `${w} (${fmt(start)} – ${fmt(end)})`;
}

export function uid() {
  return "id" + Date.now() + Math.random().toString(36).slice(2, 7);
}

// Sort utilities
export function applySortState(state, col) {
  return state.col === col
    ? { col, dir: state.dir === "asc" ? "desc" : "asc" }
    : { col, dir: "asc" };
}

export function sortRows(arr, col, dir, valFn) {
  return [...arr].sort((a, b) => {
    const va = valFn(a, col) ?? "";
    const vb = valFn(b, col) ?? "";
    if (typeof va === "number" && typeof vb === "number")
      return dir === "asc" ? va - vb : vb - va;
    return dir === "asc"
      ? String(va).localeCompare(String(vb))
      : String(vb).localeCompare(String(va));
  });
}

export const DEPTS = ["CSE","IT","ECE","EEE","MECH","CIVIL","AIDS","AIML","CSD","MBA","Other"];
