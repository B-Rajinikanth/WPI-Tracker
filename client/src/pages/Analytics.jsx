import { useMemo } from "react";
import { Line, Bar, Doughnut } from "react-chartjs-2";
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  PointElement, LineElement, ArcElement, Tooltip, Legend, Filler,
} from "chart.js";
import { useDB } from "../context/DBContext";
import { round1, pct, calcTrend, calcTrendDetail } from "../utils/wpi";
import { TrendBadge, BandBadge, DeptChip } from "../components/ui/BandBadge";

ChartJS.register(
  CategoryScale, LinearScale, BarElement,
  PointElement, LineElement, ArcElement, Tooltip, Legend, Filler
);
const CO = { responsive: true, maintainAspectRatio: false };
/* Strips date range from week labels: "2024-W2 (1 Jun - 6 Jun)" → "2024-W2" */
const shortLabel = label => label ? label.replace(/\s*\(.*\)$/, '').trim() : label;
const weekXAxis = (weeksArr) => ({
  ticks: {
    callback: (_, i) => shortLabel(weeksArr[i]),
    maxRotation: 30,
    minRotation: 0,
    font: { size: 10 },
    autoSkip: true,
    maxTicksLimit: 8,
  },
});

/* ── Small stat tile used in multiple places ─────────── */
function StatTile({ label, value, sub, color = "var(--blue-mid)", bg = "var(--blue-bg)" }) {
  return (
    <div style={{
      flex: "1 1 120px", background: bg, borderRadius: 10,
      padding: "12px 16px", textAlign: "center",
      borderTop: `3px solid ${color}`,
    }}>
      <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text)", marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/* ── WPI score → band color ──────────────────────────── */
function wpiColor(v) {
  return v >= 75 ? "#059669" : v >= 50 ? "#D97706" : "#DC2626";
}

export default function Analytics() {
  const { students, records, weeks, activeWeek } = useDB();

  const depts = useMemo(() =>
    [...new Set(students.map(s => s.dept))].sort(), [students]);

  // Use the week with most records as "latest" (usually the active week)
  const latestWeek = useMemo(() => {
    if (!weeks.length) return null;
    // prefer active week if it has records, else week with most records
    const activeHasRecs = records.some(r => r.week === activeWeek);
    if (activeHasRecs) return activeWeek;
    return weeks.reduce((best, w) => {
      const cnt = records.filter(r => r.week === w).length;
      const bestCnt = records.filter(r => r.week === best).length;
      return cnt > bestCnt ? w : best;
    }, weeks[0]);
  }, [weeks, records, activeWeek]);

  // Find the week just before latestWeek in the weeks array
  const prevWeek = useMemo(() => {
    const idx = weeks.indexOf(latestWeek);
    if (idx <= 0) return null;
    return weeks[idx - 1];
  }, [weeks, latestWeek]);

  const latestRecs = useMemo(() =>
    records.filter(r => r.week === latestWeek), [records, latestWeek]);

  const prevRecs = useMemo(() =>
    records.filter(r => r.week === prevWeek), [records, prevWeek]);

  /* ── 1. WPI Trend ──────────────────────────────────── */
  const trendData = useMemo(() => ({
    labels: weeks,
    datasets: [{
      label: "Avg WPI", fill: true, tension: 0.4,
      borderColor: "#2E7D32", backgroundColor: "rgba(46,125,50,.12)",
      pointBackgroundColor: "#2E7D32", pointRadius: 4,
      data: weeks.map(w => {
        const rs = records.filter(r => r.week === w);
        return rs.length ? round1(rs.reduce((s, r) => s + (r.computed?.WPI || 0), 0) / rs.length) : null;
      }),
    }],
  }), [weeks, records]);

  /* ── 2. Band Migration stacked bar ─────────────────── */
  const bandMigration = useMemo(() => ({
    labels: weeks,
    datasets: [
      { label: "Band A", data: weeks.map(w => records.filter(r => r.week === w && r.computed?.band === "A").length), backgroundColor: "#22C55E", stack: "s", borderRadius: 3 },
      { label: "Band B", data: weeks.map(w => records.filter(r => r.week === w && r.computed?.band === "B").length), backgroundColor: "#F59E0B", stack: "s", borderRadius: 3 },
      { label: "Band C", data: weeks.map(w => records.filter(r => r.week === w && r.computed?.band === "C").length), backgroundColor: "#EF4444", stack: "s", borderRadius: 3 },
    ],
  }), [weeks, records]);

  /* ── 3. WPI Histogram (latest week) ────────────────── */
  const histogram = useMemo(() => {
    if (!latestWeek) return null;
    const bins = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const counts = bins.slice(0, -1).map((_, i) =>
      latestRecs.filter(r => { const w = r.computed?.WPI || 0; return w >= bins[i] && w < bins[i + 1]; }).length
    );
    return {
      labels: bins.slice(0, -1).map((b, i) => `${b}–${bins[i + 1]}`),
      datasets: [{ label: "Students", data: counts, backgroundColor: bins.slice(0, -1).map(b => b >= 75 ? "#22C55E" : b >= 50 ? "#F59E0B" : "#EF4444"), borderRadius: 5 }],
    };
  }, [latestRecs, latestWeek]);

  /* ── 4. Dept comparison last 3 weeks ───────────────── */
  const deptData = useMemo(() => ({
    labels: depts,
    datasets: weeks.slice(-3).map((w, i) => ({
      label: w,
      data: depts.map(d => {
        const rs = records.filter(r => r.week === w && students.find(s => s.id === r.studentId && s.dept === d));
        return rs.length ? round1(rs.reduce((s, r) => s + (r.computed?.WPI || 0), 0) / rs.length) : 0;
      }),
      backgroundColor: ["rgba(46,125,50,.75)", "rgba(198,40,40,.65)", "rgba(230,81,0,.7)"][i],
      borderRadius: 5,
    })),
  }), [depts, weeks, records, students]);

  /* ── 5. Floor Failure Analysis (latest week) ────────── */
  const floorStats = useMemo(() => {
    const total = latestRecs.length;
    const failT = latestRecs.filter(r => (r.computed?.T ?? 0) < 50).length;
    const failA = latestRecs.filter(r => (r.computed?.A ?? 0) < 50).length;
    const failC = latestRecs.filter(r => (r.computed?.C ?? 0) < 30).length;
    const allFail = latestRecs.filter(r =>
      (r.computed?.T ?? 0) < 50 || (r.computed?.A ?? 0) < 50 || (r.computed?.C ?? 0) < 30
    ).length;
    return { total, failT, failA, failC, allFail };
  }, [latestRecs]);

  const floorChartData = useMemo(() => ({
    labels: ["Technical (floor 50)", "Aptitude (floor 50)", "Communication (floor 30)"],
    datasets: [{
      label: "Below Floor",
      data: [floorStats.failT, floorStats.failA, floorStats.failC],
      backgroundColor: ["#EF4444", "#F97316", "#FBBF24"],
      borderRadius: 6,
    }],
  }), [floorStats]);

  /* ── 6. Week-over-Week Movement ─────────────────────── */
  const wowMovement = useMemo(() => {
    if (!latestWeek || !prevWeek) return null;
    const prevMap = {};
    prevRecs.forEach(r => { prevMap[r.studentId] = r.computed?.WPI || 0; });
    let improved = 0, declined = 0, stable = 0, topGainer = null, topDecliner = null;
    let maxGain = -Infinity, maxDrop = Infinity;
    latestRecs.forEach(r => {
      const prev = prevMap[r.studentId];
      if (prev == null) return;
      const diff = (r.computed?.WPI || 0) - prev;
      if (diff > 0.5) { improved++; if (diff > maxGain) { maxGain = diff; topGainer = { ...r, diff, prev }; } }
      else if (diff < -0.5) { declined++; if (diff < maxDrop) { maxDrop = diff; topDecliner = { ...r, diff, prev }; } }
      else stable++;
    });
    return { improved, declined, stable, topGainer, topDecliner };
  }, [latestRecs, prevRecs, latestWeek, prevWeek]);

  /* ── 7. Top 5 Most Improved + Top 5 Most Declined ─── */
  const movementLists = useMemo(() => {
    if (!latestWeek || !prevWeek) return { gainers: [], decliners: [] };
    const prevMap = {};
    prevRecs.forEach(r => { prevMap[r.studentId] = r.computed?.WPI || 0; });
    const diffs = latestRecs
      .filter(r => prevMap[r.studentId] != null)
      .map(r => ({
        rec: r,
        student: students.find(s => s.id === r.studentId) || {},
        diff: round1((r.computed?.WPI || 0) - prevMap[r.studentId]),
        nowWPI: r.computed?.WPI || 0,
        prevWPI: prevMap[r.studentId],
      }));
    return {
      gainers:   [...diffs].sort((a, b) => b.diff - a.diff).slice(0, 5),
      decliners: [...diffs].sort((a, b) => a.diff - b.diff).slice(0, 5).filter(d => d.diff < 0),
    };
  }, [latestRecs, prevRecs, latestWeek, prevWeek, students]);

  /* ── 8. Band Transition Matrix ───────────────────────── */
  const bandMatrix = useMemo(() => {
    if (!latestWeek || !prevWeek) return null;
    const prevMap = {};
    prevRecs.forEach(r => { prevMap[r.studentId] = r.computed?.band; });
    const matrix = { A: { A: 0, B: 0, C: 0 }, B: { A: 0, B: 0, C: 0 }, C: { A: 0, B: 0, C: 0 } };
    latestRecs.forEach(r => {
      const prev = prevMap[r.studentId];
      const curr = r.computed?.band;
      if (prev && curr && matrix[prev]) matrix[prev][curr]++;
    });
    return matrix;
  }, [latestRecs, prevRecs, latestWeek, prevWeek]);

  /* ── 9. Department Heatmap (all weeks) ──────────────── */
  const deptHeatmap = useMemo(() =>
    depts.map(d => ({
      dept: d,
      avgs: weeks.map(w => {
        const rs = records.filter(r => r.week === w && students.find(s => s.id === r.studentId && s.dept === d));
        return rs.length ? round1(rs.reduce((s, r) => s + (r.computed?.WPI || 0), 0) / rs.length) : null;
      }),
    })), [depts, weeks, records, students]);

  /* ── 10. Component Trend Lines ───────────────────────── */
  const componentTrend = useMemo(() => ({
    labels: weeks,
    datasets: [
      { label: "Technical",      borderColor: "#1B5E20", backgroundColor: "transparent", tension: 0.4, pointRadius: 3,
        data: weeks.map(w => { const rs = records.filter(r => r.week === w); return rs.length ? round1(rs.reduce((s, r) => s + (r.computed?.T || 0), 0) / rs.length) : null; }) },
      { label: "Aptitude",       borderColor: "#C62828", backgroundColor: "transparent", tension: 0.4, pointRadius: 3,
        data: weeks.map(w => { const rs = records.filter(r => r.week === w); return rs.length ? round1(rs.reduce((s, r) => s + (r.computed?.A || 0), 0) / rs.length) : null; }) },
      { label: "Communication",  borderColor: "#E65100", backgroundColor: "transparent", tension: 0.4, pointRadius: 3,
        data: weeks.map(w => { const rs = records.filter(r => r.week === w); return rs.length ? round1(rs.reduce((s, r) => s + (r.computed?.C || 0), 0) / rs.length) : null; }) },
      { label: "Discipline",     borderColor: "#7C3AED", backgroundColor: "transparent", tension: 0.4, pointRadius: 3,
        data: weeks.map(w => { const rs = records.filter(r => r.week === w); return rs.length ? round1(rs.reduce((s, r) => s + (r.computed?.D || 0), 0) / rs.length) : null; }) },
    ],
  }), [weeks, records]);

  const stdMap = useMemo(() => { const m = {}; students.forEach(s => { m[s.id] = s; }); return m; }, [students]);

  /* ── 11. Per-student trend details ──────────────────── */
  const allTrends = useMemo(() => {
    return students.map(s => {
      const det = calcTrendDetail(s.id, records, weeks);
      const latestRec = latestRecs.find(r => r.studentId === s.id);
      return {
        student: s,
        ...det,
        wpi: latestRec?.computed?.WPI ?? null,
        band: latestRec?.computed?.band ?? null,
      };
    }).filter(d => d.wpiHistory.length >= 2); // only students with 2+ weeks
  }, [students, records, weeks, latestRecs]);

  /* ── 12. Trend distribution counts ─────────────────── */
  const trendCounts = useMemo(() => {
    const c = { "↑": 0, "→": 0, "↓": 0, "⚠": 0 };
    allTrends.forEach(d => { if (c[d.trend] !== undefined) c[d.trend]++; });
    return c;
  }, [allTrends]);

  /* ── 13. Students trending down with data ───────────── */
  const decliningStudents = useMemo(() =>
    allTrends
      .filter(d => d.trend === "↓")
      .sort((a, b) => (a.wpi ?? 999) - (b.wpi ?? 999)), // worst WPI first
    [allTrends]);

  /* ── 14. Students oscillating ───────────────────────── */
  const oscillatingStudents = useMemo(() =>
    allTrends
      .filter(d => d.trend === "⚠")
      .sort((a, b) => (a.wpi ?? 999) - (b.wpi ?? 999)),
    [allTrends]);

  /* ── 15. Top consistent risers ──────────────────────── */
  const risingStudents = useMemo(() =>
    allTrends
      .filter(d => d.trend === "↑")
      .sort((a, b) => b.netChange - a.netChange)
      .slice(0, 10),
    [allTrends]);

  /* ── 16. Trend × Band cross-tab ─────────────────────── */
  const trendBandMatrix = useMemo(() => {
    const m = {
      "↑": { A: 0, B: 0, C: 0 },
      "→": { A: 0, B: 0, C: 0 },
      "↓": { A: 0, B: 0, C: 0 },
      "⚠": { A: 0, B: 0, C: 0 },
    };
    allTrends.forEach(d => {
      if (d.band && m[d.trend]) m[d.trend][d.band]++;
    });
    return m;
  }, [allTrends]);

  /* ── 17. Trend distribution chart data ─────────────── */
  const trendChartData = useMemo(() => ({
    labels: ["↑ Rising", "→ Stable", "↓ Declining", "⚠ Oscillating"],
    datasets: [{
      data: [trendCounts["↑"], trendCounts["→"], trendCounts["↓"], trendCounts["⚠"]],
      backgroundColor: ["#22C55E", "#94A3B8", "#EF4444", "#F59E0B"],
      borderWidth: 0,
    }],
  }), [trendCounts]);

  /* ── 18. Net WPI change distribution (histogram) ───── */
  const netChangeHist = useMemo(() => {
    const bins = [[-30,-15],[-15,-6],[-6,-2],[-2,2],[2,6],[6,15],[15,30]];
    const counts = bins.map(([lo, hi]) =>
      allTrends.filter(d => d.netChange >= lo && d.netChange < hi).length
    );
    return {
      labels: bins.map(([lo, hi]) => `${lo > 0 ? "+" : ""}${lo} to ${hi > 0 ? "+" : ""}${hi}`),
      datasets: [{
        label: "Students",
        data: counts,
        backgroundColor: bins.map(([lo]) => lo >= 2 ? "#22C55E" : lo <= -6 ? "#EF4444" : lo <= -2 ? "#F97316" : "#94A3B8"),
        borderRadius: 5,
      }],
    };
  }, [allTrends]);

  /* ── Heatmap cell color ──────────────────────────────── */
  function heatColor(v) {
    if (v === null) return "#F4F4F4";
    if (v >= 75) return "#DCFCE7";
    if (v >= 60) return "#D1FAE5";
    if (v >= 50) return "#FEF3C7";
    if (v >= 35) return "#FEE2E2";
    return "#FECACA";
  }
  function heatText(v) {
    if (v === null) return "#9CA3AF";
    if (v >= 50) return "#065F46";
    return "#991B1B";
  }

  return (
    <section className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">Analytics</div>
          <div className="page-subtitle">
            Performance trends, band migration &amp; actionable insights
            {latestWeek && <> · Latest: <strong>{latestWeek}</strong></>}
          </div>
        </div>
      </div>

      {/* ── WPI Trend + Component Trends ─────────────── */}
      <div className="g2 mb20">
        <div className="card">
          <div className="card-header">📈 Weekly WPI Trend</div>
          <div className="chart-scroll">
            <div className="chart-box chart-h250" style={{minWidth: Math.max(300, weeks.length * 60)}}>
              <Line data={trendData} options={{ ...CO, scales: { y: { min: 0, max: 100, grid: { color: "rgba(0,0,0,.05)" } }, x: weekXAxis(weeks) }, plugins: { legend: { display: false } } }} />
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-header">📉 Component Score Trends (T / A / C / D)</div>
          <div className="chart-scroll">
            <div className="chart-box chart-h250" style={{minWidth: Math.max(300, weeks.length * 60)}}>
              <Line data={componentTrend} options={{ ...CO, scales: { y: { min: 0, max: 100, grid: { color: "rgba(0,0,0,.05)" } }, x: weekXAxis(weeks) }, plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } } } }} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Band Migration + Histogram ────────────────── */}
      <div className="g2 mb20">
        <div className="card">
          <div className="card-header">📊 Band Migration (Stacked by Week)</div>
          <div className="chart-scroll">
            <div className="chart-box chart-h250" style={{minWidth: Math.max(300, weeks.length * 60)}}>
              <Bar data={bandMigration} options={{ ...CO, scales: { y: { stacked: true, grid: { color: "rgba(0,0,0,.05)" } }, x: { stacked: true, ...weekXAxis(weeks) } }, plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } } } }} />
            </div>
          </div>
        </div>
        {histogram ? (
          <div className="card">
            <div className="card-header">📉 WPI Distribution — {latestWeek}</div>
            <div className="chart-scroll">
              <div className="chart-box chart-h250" style={{minWidth: 320}}>
                <Bar data={histogram} options={{ ...CO, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { font: { size: 10 } } }, y: { grid: { color: "rgba(0,0,0,.05)" } } } }} />
              </div>
            </div>
          </div>
        ) : (
          <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div className="empty-state"><div className="empty-state-icon">📭</div><div className="empty-state-title">No data yet</div></div>
          </div>
        )}
      </div>

      {/* ── Floor Failure Analysis ───────────────────── */}
      <div className="card mb20">
        <div className="card-header">
          🚨 Floor Score Failure Analysis — {latestWeek || "Latest Week"}
          <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-muted)", textTransform: "none", letterSpacing: 0 }}>
            Floor rules: T≥50, A≥50, C≥30 required for Band A
          </span>
        </div>
        {!latestRecs.length ? (
          <div className="empty-state"><div className="empty-state-icon">📭</div><div className="empty-state-title">No records for latest week</div></div>
        ) : (
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "stretch" }}>
            {/* Summary tiles */}
            <div style={{ display: "flex", gap: 12, flex: "1 1 280px", flexDirection: "column", justifyContent: "space-between" }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <StatTile label="Fail Technical" value={floorStats.failT}
                  sub={`${pct(floorStats.failT, floorStats.total)}% of tracked`}
                  color="#EF4444" bg="#FEF2F2" />
                <StatTile label="Fail Aptitude" value={floorStats.failA}
                  sub={`${pct(floorStats.failA, floorStats.total)}% of tracked`}
                  color="#F97316" bg="#FFF7ED" />
                <StatTile label="Fail Communication" value={floorStats.failC}
                  sub={`${pct(floorStats.failC, floorStats.total)}% of tracked`}
                  color="#FBBF24" bg="#FFFBEB" />
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5, padding: "4px 2px" }}>
                ℹ️ Counts above are <strong>independent</strong> — a student failing multiple floors is counted once per tile. The total below counts each student only <strong>once</strong> (union).
              </div>
              <div style={{
                background: "linear-gradient(135deg,#FEF2F2,#FFF7ED)", border: "1.5px solid #FECACA",
                borderRadius: 10, padding: "12px 16px"
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#991B1B", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 6 }}>
                  ⚠ Students Failing Any Floor
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 38, fontWeight: 900, color: "#DC2626", lineHeight: 1 }}>{floorStats.allFail}</span>
                  <span style={{ fontSize: 13, color: "#7F0000", fontWeight: 600 }}>
                    of {floorStats.total} tracked ({pct(floorStats.allFail, floorStats.total)}%)
                  </span>
                </div>
                <div style={{ marginTop: 8, height: 8, borderRadius: 4, background: "#FECACA", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: pct(floorStats.allFail, floorStats.total) + "%", background: "linear-gradient(90deg,#EF4444,#DC2626)", borderRadius: 4, transition: "width .5s" }} />
                </div>
              </div>
            </div>
            {/* Floor bar chart */}
            <div style={{ flex: "1 1 260px", minHeight: 160 }}>
              <Bar data={floorChartData} options={{
                ...CO, indexAxis: "y",
                plugins: { legend: { display: false } },
                scales: {
                  x: { max: floorStats.total || 10, grid: { color: "rgba(0,0,0,.05)" } },
                  y: { grid: { display: false } },
                },
              }} />
            </div>
          </div>
        )}
      </div>

      {/* ── Week-over-Week Movement ──────────────────── */}
      {wowMovement && (
        <div className="card mb20">
          <div className="card-header">
            📶 Week-over-Week Performance Movement
            <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-muted)", textTransform: "none", letterSpacing: 0 }}>
              {prevWeek} → {latestWeek}
            </span>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <StatTile label="Improved" value={wowMovement.improved}   sub="WPI went up"   color="#059669" bg="#ECFDF5" />
            <StatTile label="Declined" value={wowMovement.declined}   sub="WPI went down" color="#DC2626" bg="#FEF2F2" />
            <StatTile label="Stable"   value={wowMovement.stable}     sub="No change"     color="#D97706" bg="#FFFBEB" />
          </div>
          {/* Stacked progress bar */}
          {(() => {
            const total = wowMovement.improved + wowMovement.declined + wowMovement.stable;
            if (!total) return null;
            return (
              <div style={{ display: "flex", height: 14, borderRadius: 7, overflow: "hidden", gap: 2 }}>
                <div style={{ flex: wowMovement.improved, background: "#22C55E", minWidth: wowMovement.improved ? 2 : 0 }} title={`Improved: ${wowMovement.improved}`} />
                <div style={{ flex: wowMovement.stable,   background: "#F59E0B", minWidth: wowMovement.stable   ? 2 : 0 }} title={`Stable: ${wowMovement.stable}`} />
                <div style={{ flex: wowMovement.declined, background: "#EF4444", minWidth: wowMovement.declined ? 2 : 0 }} title={`Declined: ${wowMovement.declined}`} />
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Top Gainers & Decliners ──────────────────── */}
      {(movementLists.gainers.length > 0 || movementLists.decliners.length > 0) && (
        <div className="g2 mb20">
          {/* Most Improved */}
          <div className="card">
            <div className="card-header">🚀 Top 5 Most Improved</div>
            <div className="table-scroll">
              <table style={{ minWidth: "unset" }}>
                <thead>
                  <tr><th>#</th><th>Name</th><th>Dept</th><th>Prev</th><th>Now</th><th>Δ WPI</th></tr>
                </thead>
                <tbody>
                  {movementLists.gainers.map(({ student, diff, nowWPI, prevWPI }, i) => (
                    <tr key={student.id || i}>
                      <td style={{ fontWeight: 700, color: "var(--text-muted)" }}>{i + 1}</td>
                      <td><strong>{student.name || "—"}</strong></td>
                      <td style={{ fontSize: 11 }}>{student.dept || "—"}</td>
                      <td style={{ color: "var(--text-muted)" }}>{prevWPI.toFixed(1)}</td>
                      <td style={{ fontWeight: 700, color: wpiColor(nowWPI) }}>{nowWPI.toFixed(1)}</td>
                      <td>
                        <span style={{ background: "#DCFCE7", color: "#065F46", padding: "2px 8px", borderRadius: 12, fontSize: 12, fontWeight: 700 }}>
                          +{diff.toFixed(1)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {/* Most Declined */}
          <div className="card">
            <div className="card-header">⚠ Top 5 Most Declined</div>
            <div className="table-scroll">
              <table style={{ minWidth: "unset" }}>
                <thead>
                  <tr><th>#</th><th>Name</th><th>Dept</th><th>Prev</th><th>Now</th><th>Δ WPI</th></tr>
                </thead>
                <tbody>
                  {movementLists.decliners.map(({ student, diff, nowWPI, prevWPI }, i) => (
                    <tr key={student.id || i}>
                      <td style={{ fontWeight: 700, color: "var(--text-muted)" }}>{i + 1}</td>
                      <td><strong>{student.name || "—"}</strong></td>
                      <td style={{ fontSize: 11 }}>{student.dept || "—"}</td>
                      <td style={{ color: "var(--text-muted)" }}>{prevWPI.toFixed(1)}</td>
                      <td style={{ fontWeight: 700, color: wpiColor(nowWPI) }}>{nowWPI.toFixed(1)}</td>
                      <td>
                        <span style={{ background: "#FEE2E2", color: "#991B1B", padding: "2px 8px", borderRadius: 12, fontSize: 12, fontWeight: 700 }}>
                          {diff.toFixed(1)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Band Transition Matrix ───────────────────── */}
      {bandMatrix && (
        <div className="card mb20">
          <div className="card-header">
            🔄 Band Transition Matrix
            <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-muted)", textTransform: "none", letterSpacing: 0 }}>
              {prevWeek} → {latestWeek}
            </span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ minWidth: "unset", width: "auto", margin: "0 auto" }}>
              <thead>
                <tr>
                  <th style={{ background: "var(--grad-blue)", borderRadius: "8px 0 0 0" }}>From ↓ / To →</th>
                  {["A", "B", "C"].map(b => (
                    <th key={b} style={{ background: "var(--grad-blue)", textAlign: "center", minWidth: 90 }}>
                      Band {b}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {["A", "B", "C"].map(fromB => (
                  <tr key={fromB}>
                    <td style={{ fontWeight: 800, background: fromB === "A" ? "#DCFCE7" : fromB === "B" ? "#FEF3C7" : "#FEE2E2", color: fromB === "A" ? "#065F46" : fromB === "B" ? "#92400E" : "#991B1B", textAlign: "center", minWidth: 100 }}>
                      Band {fromB}
                    </td>
                    {["A", "B", "C"].map(toB => {
                      const val = bandMatrix[fromB][toB];
                      const isDiag = fromB === toB;
                      return (
                        <td key={toB} style={{
                          textAlign: "center", fontWeight: isDiag ? 700 : 500,
                          background: isDiag ? (fromB === "A" ? "#DCFCE7" : fromB === "B" ? "#FEF3C7" : "#FEE2E2") : val > 0 ? "#FFF3E0" : "transparent",
                          color: isDiag ? "inherit" : val > 0 ? "#7F4700" : "var(--text-muted)",
                          fontSize: 15,
                        }}>
                          {val}
                          {!isDiag && val > 0 && (
                            <div style={{ fontSize: 9, color: toB < fromB ? "#065F46" : "#991B1B", fontWeight: 600 }}>
                              {toB < fromB ? "▲ improved" : "▼ declined"}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 12, padding: "0 4px" }}>
            Diagonal = stayed in same band. Off-diagonal cells show students who moved between bands.
          </div>
        </div>
      )}

      {/* ── Dept Comparison Chart ────────────────────── */}
      <div className="card mb20">
        <div className="card-header">🏫 Department-wise WPI — Last 3 Weeks</div>
        <div className="chart-scroll">
          <div className="chart-box chart-h200" style={{ minWidth: Math.max(480, depts.length * 60) }}>
            <Bar data={deptData} options={{ ...CO, scales: { y: { min: 0, max: 100, grid: { color: "rgba(0,0,0,.05)" } }, x: { grid: { display: false } } }, plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } } } }} />
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════
          TREND ANALYTICS SECTION
      ══════════════════════════════════════════════════ */}
      {allTrends.length > 0 && (
        <>
          {/* ── Trend Distribution Overview ──────────── */}
          <div className="section-divider" style={{marginTop:8}}>📶 Trend Analysis — Based on Last 3 Weeks WPI</div>

          <div className="g2 mb20">
            {/* Doughnut */}
            <div className="card">
              <div className="card-header">Trend Distribution</div>
              <div style={{display:"flex",gap:20,alignItems:"center",flexWrap:"wrap"}}>
                <div style={{flex:"0 0 180px",height:180}}>
                  <Doughnut data={trendChartData} options={{
                    ...CO,
                    plugins:{ legend:{ display:false } },
                    cutout:"62%",
                  }}/>
                </div>
                <div style={{flex:1,display:"flex",flexDirection:"column",gap:10,minWidth:180}}>
                  {[
                    { trend:"↑", label:"Rising",      bg:"#DCFCE7", color:"#065F46", border:"#86EFAC" },
                    { trend:"→", label:"Stable",       bg:"#F1F5F9", color:"#475569", border:"#CBD5E1" },
                    { trend:"↓", label:"Declining",    bg:"#FEE2E2", color:"#991B1B", border:"#FCA5A5" },
                    { trend:"⚠", label:"Oscillating",  bg:"#FEF3C7", color:"#92400E", border:"#FCD34D" },
                  ].map(({ trend, label, bg, color, border }) => {
                    const cnt = trendCounts[trend];
                    const total = allTrends.length;
                    return (
                      <div key={trend} style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{background:bg,color,border:`1px solid ${border}`,borderRadius:20,
                          padding:"2px 9px",fontSize:11,fontWeight:700,minWidth:104,textAlign:"center",flexShrink:0}}>
                          {trend} {label}
                        </span>
                        <div style={{flex:1,height:8,borderRadius:4,background:"#F1F5F9",overflow:"hidden"}}>
                          <div style={{height:"100%",width:pct(cnt,total)+"%",background:color,borderRadius:4,transition:"width .5s"}}/>
                        </div>
                        <span style={{fontSize:13,fontWeight:800,color,minWidth:32,textAlign:"right"}}>{cnt}</span>
                        <span style={{fontSize:11,color:"var(--text-muted)",minWidth:36}}>{pct(cnt,total)}%</span>
                      </div>
                    );
                  })}
                  <div style={{fontSize:11,color:"var(--text-muted)",borderTop:"1px solid var(--border)",paddingTop:8}}>
                    Based on {allTrends.length} students with 2+ weeks of data
                  </div>
                </div>
              </div>
            </div>

            {/* Net WPI Change Histogram */}
            <div className="card">
              <div className="card-header">Net WPI Change — Distribution (Last 3 Weeks)</div>
              <div className="chart-box chart-h200">
                <Bar data={netChangeHist} options={{
                  ...CO,
                  plugins:{ legend:{ display:false },
                    tooltip:{ callbacks:{ label: ctx => ` ${ctx.parsed.y} students` } } },
                  scales:{
                    x:{ grid:{ display:false }, ticks:{ font:{ size:10 } } },
                    y:{ grid:{ color:"rgba(0,0,0,.05)" }, ticks:{ stepSize:1 } },
                  },
                }}/>
              </div>
            </div>
          </div>

          {/* ── Trend × Band Cross-tab ────────────────── */}
          <div className="card mb20">
            <div className="card-header">Trend × Current Band Matrix</div>
            <div style={{overflowX:"auto"}}>
              <table style={{minWidth:"unset",width:"auto"}}>
                <thead>
                  <tr>
                    <th style={{background:"var(--grad-blue)",minWidth:130}}>Trend ↓ / Band →</th>
                    {["Band A – High","Band B – Mid","Band C – Critical"].map(b=>(
                      <th key={b} style={{background:"var(--grad-blue)",textAlign:"center",minWidth:110}}>{b}</th>
                    ))}
                    <th style={{background:"var(--grad-blue)",textAlign:"center",minWidth:70}}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { trend:"↑", label:"↑ Rising",      bg:"#DCFCE7", color:"#065F46" },
                    { trend:"→", label:"→ Stable",       bg:"#F8FAFC", color:"#475569" },
                    { trend:"↓", label:"↓ Declining",    bg:"#FEE2E2", color:"#991B1B" },
                    { trend:"⚠", label:"⚠ Oscillating", bg:"#FEF3C7", color:"#92400E" },
                  ].map(({ trend, label, bg, color }) => {
                    const row = trendBandMatrix[trend];
                    const total = row.A + row.B + row.C;
                    return (
                      <tr key={trend}>
                        <td style={{fontWeight:700,background:bg,color}}>{label}</td>
                        {["A","B","C"].map(b=>(
                          <td key={b} style={{textAlign:"center",fontWeight:row[b]>0?700:400,
                            color:row[b]>0?color:"var(--text-muted)",
                            background:row[b]>0?bg:"transparent",fontSize:15}}>
                            {row[b]||"—"}
                          </td>
                        ))}
                        <td style={{textAlign:"center",fontWeight:700,color:"var(--text-muted)",fontSize:13}}>{total||"—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p style={{fontSize:11,color:"var(--text-muted)",marginTop:10,padding:"0 4px"}}>
              ↓ Declining × Band A = high performers losing ground — highest priority for coaching. &nbsp;
              ↑ Rising × Band C = critical students recovering — monitor closely.
            </p>
          </div>

          {/* ── Top Rising + Declining ────────────────── */}
          <div className="g2 mb20">
            <div className="card">
              <div className="card-header">🚀 Top Consistent Risers (↑)</div>
              {risingStudents.length === 0
                ? <div className="empty-state"><div className="empty-state-icon">📭</div><div className="empty-state-title">No rising trend yet</div></div>
                : <div className="table-scroll"><table className="table-fit" style={{minWidth:"unset"}}>
                    <thead><tr><th>#</th><th>URN</th><th className="col-hide-sm">Name</th><th>WPI</th><th>Band</th><th>+Δ (3 wk)</th></tr></thead>
                    <tbody>
                      {risingStudents.map(({ student, wpi, band, netChange }, i) => (
                        <tr key={student.id}>
                          <td style={{color:"var(--text-muted)",fontWeight:700}}>{i+1}</td>
                          <td><strong>{student.urn||"—"}</strong></td>
                          <td className="col-hide-sm">{student.name}</td>
                          <td className="score-val">{wpi?.toFixed(1)??'—'}</td>
                          <td><BandBadge band={band}/></td>
                          <td>
                            <span style={{background:"#DCFCE7",color:"#065F46",border:"1px solid #86EFAC",
                              padding:"2px 8px",borderRadius:12,fontSize:12,fontWeight:700}}>
                              +{netChange.toFixed(1)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
              }
            </div>

            <div className="card">
              <div className="card-header">🔻 Declining Students (↓) — Needs Attention</div>
              {decliningStudents.length === 0
                ? <div className="empty-state"><div className="empty-state-icon">✅</div><div className="empty-state-title">No declining students!</div></div>
                : <div className="table-scroll"><table className="table-fit" style={{minWidth:"unset"}}>
                    <thead><tr><th>#</th><th>URN</th><th className="col-hide-sm">Name</th><th>WPI</th><th>Band</th><th>Δ (3 wk)</th></tr></thead>
                    <tbody>
                      {decliningStudents.slice(0,10).map(({ student, wpi, band, netChange }, i) => (
                        <tr key={student.id}>
                          <td style={{color:"var(--text-muted)",fontWeight:700}}>{i+1}</td>
                          <td><strong>{student.urn||"—"}</strong></td>
                          <td className="col-hide-sm">{student.name}</td>
                          <td className="score-val" style={{color:wpi!=null&&wpi<50?"var(--red)":"var(--blue-mid)"}}>
                            {wpi?.toFixed(1)??'—'}
                          </td>
                          <td><BandBadge band={band}/></td>
                          <td>
                            <span style={{background:"#FEE2E2",color:"#991B1B",border:"1px solid #FCA5A5",
                              padding:"2px 8px",borderRadius:12,fontSize:12,fontWeight:700}}>
                              {netChange.toFixed(1)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
              }
            </div>
          </div>

          {/* ── Oscillating Students ──────────────────── */}
          {oscillatingStudents.length > 0 && (
            <div className="card mb20">
              <div className="card-header">
                ⚡ Oscillating Students — Inconsistent Performance
                <span style={{background:"#FEF3C7",color:"#92400E",border:"1px solid #FCD34D",
                  padding:"2px 9px",borderRadius:12,fontSize:11,fontWeight:700}}>
                  {oscillatingStudents.length} students
                </span>
              </div>
              <p style={{fontSize:12,color:"var(--text-muted)",marginBottom:12}}>
                Significant WPI swings (large rise followed by large drop, or vice versa) — inconsistent effort or circumstances. Need structured consistency coaching.
              </p>
              <div className="table-scroll"><table className="table-fit" style={{minWidth:"unset"}}>
                <thead><tr>
                  <th>#</th><th>URN</th><th className="col-hide-sm">Name</th>
                  <th>Current WPI</th><th>Band</th>
                  <th className="col-hide-sm">Last 3 Week WPIs</th>
                </tr></thead>
                <tbody>
                  {oscillatingStudents.slice(0,15).map(({ student, wpi, band, last3 }, i) => (
                    <tr key={student.id}>
                      <td style={{color:"var(--text-muted)",fontWeight:700}}>{i+1}</td>
                      <td><strong>{student.urn||"—"}</strong></td>
                      <td className="col-hide-sm">{student.name}</td>
                      <td className="score-val" style={{color:wpi!=null&&wpi<50?"var(--red)":"var(--blue-mid)"}}>
                        {wpi?.toFixed(1)??'—'}
                      </td>
                      <td><BandBadge band={band}/></td>
                      <td className="col-hide-sm">
                        <div style={{display:"flex",gap:4,alignItems:"center",flexWrap:"wrap"}}>
                          {last3.map((p, j) => (
                            <span key={j} style={{
                              background:p.wpi>=75?"#DCFCE7":p.wpi>=50?"#FEF3C7":"#FEE2E2",
                              color:p.wpi>=75?"#065F46":p.wpi>=50?"#92400E":"#991B1B",
                              padding:"2px 8px",borderRadius:8,fontSize:11,fontWeight:700,
                              border:`1px solid ${p.wpi>=75?"#86EFAC":p.wpi>=50?"#FCD34D":"#FCA5A5"}`,
                            }}>
                              {j > 0 && (
                                <span style={{marginRight:2,opacity:.6}}>
                                  {p.wpi > last3[j-1].wpi ? "▲" : "▼"}
                                </span>
                              )}
                              {p.wpi.toFixed(1)}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          )}
        </>
      )}

      {/* ── Department × Week Heatmap ────────────────── */}
      {deptHeatmap.length > 0 && weeks.length > 0 && (
        <div className="card mb20">
          <div className="card-header">🌡️ Department × Week Heatmap (Avg WPI)</div>
          <div className="table-scroll">
            <table style={{ minWidth: `${160 + weeks.length * 90}px` }}>
              <thead>
                <tr>
                  <th style={{ background: "var(--grad-blue)", minWidth: 130 }}>Department</th>
                  {weeks.map(w => <th key={w} style={{ background: "var(--grad-blue)", textAlign: "center", minWidth: 80 }}>{w}</th>)}
                </tr>
              </thead>
              <tbody>
                {deptHeatmap.map(({ dept, avgs }) => (
                  <tr key={dept}>
                    <td style={{ fontWeight: 700, background: "var(--blue-pale)", color: "var(--blue)" }}>{dept}</td>
                    {avgs.map((v, i) => (
                      <td key={i} style={{
                        textAlign: "center", fontWeight: v !== null ? 700 : 400,
                        background: heatColor(v), color: heatText(v),
                        fontSize: 13,
                      }}>
                        {v !== null ? v.toFixed(1) : "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Legend */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12, fontSize: 11, color: "var(--text-muted)", alignItems: "center" }}>
            <span style={{ fontWeight: 700 }}>Legend:</span>
            {[["≥75", "#DCFCE7", "#065F46"], ["60–74", "#D1FAE5", "#065F46"], ["50–59", "#FEF3C7", "#7F4700"], ["35–49", "#FEE2E2", "#991B1B"], ["<35", "#FECACA", "#991B1B"]].map(([label, bg, color]) => (
              <span key={label} style={{ background: bg, color, padding: "2px 9px", borderRadius: 6, fontWeight: 600 }}>{label}</span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
