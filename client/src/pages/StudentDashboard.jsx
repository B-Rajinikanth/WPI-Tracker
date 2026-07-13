import { useMemo } from "react";
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Title, Tooltip, Legend, Filler,
} from "chart.js";
import { Line, Bar } from "react-chartjs-2";
import { useDB } from "../context/DBContext";
import { useAuth } from "../context/AuthContext";
import { calcCPI, calcTrend, trendCls } from "../utils/wpi";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler);

const TIER_COLOR = {
  ready:    { bg: "#E8F5E9", text: "#1B5E20", border: "#A5D6A7" },
  near:     { bg: "#E3F2FD", text: "#0D47A1", border: "#90CAF9" },
  progress: { bg: "#FFF8E1", text: "#F57F17", border: "#FFE082" },
  noready:  { bg: "#FFF3E0", text: "#BF360C", border: "#FFCC80" },
  gate:     { bg: "#FCE4EC", text: "#880E4F", border: "#F48FB1" },
};

export default function StudentDashboard() {
  const { students, records, weeks, activeWeek } = useDB();
  const { user } = useAuth();

  // Resolve this student from URN (username is their URN)
  const student = useMemo(() =>
    students.find(s => String(s.urn).toLowerCase() === user?.username?.toLowerCase()),
    [students, user]
  );

  const myRecords = useMemo(() =>
    records
      .filter(r => student && r.studentId === student.id)
      .sort((a, b) => {
        const ia = weeks.indexOf(a.week);
        const ib = weeks.indexOf(b.week);
        return (ia === -1 ? 9999 : ia) - (ib === -1 ? 9999 : ib);
      }),
    [records, student, weeks]
  );

  const cpi = useMemo(() =>
    student ? calcCPI(student.id, records, weeks) : null,
    [student, records, weeks]
  );

  // Latest week scores
  const latest = myRecords.length ? myRecords[myRecords.length - 1] : null;
  const latestScores = latest?.computed || null;
  const trend = student ? calcTrend(student.id, records, weeks) : "→";

  // Chart data — WPI progress over weeks
  const wpiChartData = useMemo(() => {
    if (!myRecords.length) return null;
    const labels = myRecords.map(r => r.week.replace(/^Week\s*/i, "Wk "));
    const wpiVals = myRecords.map(r => r.computed?.WPI ?? 0);

    // Class average WPI per week (same weeks only)
    const classAvgByWeek = myRecords.map(r => {
      const weekRecs = records.filter(x => x.week === r.week && x.computed?.WPI != null);
      if (!weekRecs.length) return null;
      return +(weekRecs.reduce((s, x) => s + x.computed.WPI, 0) / weekRecs.length).toFixed(1);
    });

    return {
      labels,
      datasets: [
        {
          label: "My WPI",
          data: wpiVals,
          borderColor: "#2563EB",
          backgroundColor: "rgba(37,99,235,0.12)",
          tension: 0.35,
          fill: true,
          pointRadius: 5,
          pointBackgroundColor: "#2563EB",
        },
        {
          label: "Class Avg",
          data: classAvgByWeek,
          borderColor: "#9CA3AF",
          borderDash: [5, 4],
          backgroundColor: "transparent",
          tension: 0.35,
          fill: false,
          pointRadius: 3,
          pointBackgroundColor: "#9CA3AF",
        },
      ],
    };
  }, [myRecords, records]);

  // Chart data — score breakdown for latest week
  const scoreChartData = useMemo(() => {
    if (!latestScores) return null;
    return {
      labels: ["Technical", "Aptitude", "Communication", "Discipline"],
      datasets: [
        {
          label: "My Score",
          data: [latestScores.T, latestScores.A, latestScores.C, latestScores.D],
          backgroundColor: ["#3B82F6", "#10B981", "#F59E0B", "#8B5CF6"],
          borderRadius: 6,
          borderSkipped: false,
        },
        {
          label: "Floor (min required)",
          data: [50, 50, 30, 0],
          backgroundColor: "rgba(239,68,68,0.15)",
          borderColor: "rgba(239,68,68,0.5)",
          borderWidth: 1,
          borderRadius: 6,
          borderSkipped: false,
        },
      ],
    };
  }, [latestScores]);

  // Leaderboard — top 10 by CPI (or avg WPI if no CPI)
  const leaderboard = useMemo(() => {
    return students
      .map(s => {
        const cpiData = calcCPI(s.id, records, weeks);
        return { s, cpiData, score: cpiData?.cpi ?? 0 };
      })
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((x, i) => ({ ...x, rank: i + 1 }));
  }, [students, records, weeks]);

  const myRank = leaderboard.findIndex(x => x.s.id === student?.id);

  const tierStyle = cpi ? (TIER_COLOR[cpi.tierKey] || TIER_COLOR.gate) : null;

  if (!student) {
    return (
      <section className="page active">
        <div className="page-header"><div className="page-title">My Dashboard</div></div>
        <div className="card" style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Student profile not found</div>
          <div style={{ fontSize: 13, marginTop: 8 }}>
            Your URN ({user?.username}) was not found in the roster. Contact the admin.
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">Hello, {student.name}!</div>
          <div className="page-subtitle">
            <strong>{student.urn}</strong> · {student.dept}
          </div>
        </div>
        {activeWeek && <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Active week: <strong>{activeWeek}</strong></div>}
      </div>

      {/* CPI + Placement tier */}
      {cpi && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 20 }}>
          <div className="card" style={{ padding: "18px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1 }}>CPI</div>
            <div style={{ fontSize: 40, fontWeight: 800, color: "var(--blue)", lineHeight: 1.1 }}>{cpi.cpi}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Cumulative Performance</div>
          </div>
          <div className="card" style={{
            padding: "18px 20px", textAlign: "center",
            background: tierStyle?.bg, border: `1px solid ${tierStyle?.border}`,
          }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1 }}>Placement Tier</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: tierStyle?.text, marginTop: 6 }}>{cpi.tier}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Based on CPI</div>
          </div>
          <div className="card" style={{ padding: "18px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1 }}>Avg WPI</div>
            <div style={{ fontSize: 40, fontWeight: 800, color: "var(--blue)", lineHeight: 1.1 }}>{cpi.avgWPI}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>across {cpi.weeksCount} week{cpi.weeksCount !== 1 ? "s" : ""}</div>
          </div>
          <div className="card" style={{ padding: "18px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1 }}>Trend</div>
            <div className={`trend-badge ${trendCls(trend)}`} style={{ fontSize: 28, margin: "6px auto 0", width: "fit-content" }}>{trend}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Recent 3 weeks</div>
          </div>
        </div>
      )}

      {/* Latest week scores */}
      {latestScores && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Latest Week Scores — {latest.week}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {[
              ["Technical",     latestScores.T, latestScores.T < 50 ? "#FFF3F0" : "var(--bg)"],
              ["Aptitude",      latestScores.A, latestScores.A < 50 ? "#FFF3F0" : "var(--bg)"],
              ["Communication", latestScores.C, latestScores.C < 30 ? "#FFF3F0" : "var(--bg)"],
              ["Discipline",    latestScores.D, "var(--bg)"],
              ["WPI",           latestScores.WPI, "var(--bg)"],
            ].map(([label, val, bg]) => (
              <div key={label} style={{
                background: bg, border: "1px solid var(--border)", borderRadius: 10,
                padding: "12px 14px", textAlign: "center",
              }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: "var(--text)" }}>{val?.toFixed(1)}</div>
              </div>
            ))}
            <div style={{
              border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px", textAlign: "center",
              background: "var(--bg)",
            }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Band</div>
              <span className={`band-badge band-${latestScores.band}`} style={{ fontSize: 14 }}>
                <span className={`dot dot-${latestScores.band}`}></span>Band {latestScores.band}
              </span>
            </div>
          </div>
          {latestScores.floorFails?.length > 0 && (
            <div className="floor-rule-box" style={{ marginTop: 12 }}>
              ⚠ Floor score fails: {latestScores.floorFails.join(" · ")} → Band downgraded to B
            </div>
          )}
        </div>
      )}

      {/* WPI Progress Chart */}
      {wpiChartData && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>WPI Progress — Week by Week</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>Your WPI vs class average each week</div>
          <div style={{ position: "relative", height: 220 }}>
            <Line
              data={wpiChartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { position: "bottom", labels: { font: { size: 11 }, boxWidth: 14 } },
                  tooltip: { mode: "index", intersect: false },
                },
                scales: {
                  y: {
                    min: 0, max: 100,
                    ticks: { font: { size: 11 } },
                    grid: { color: "rgba(0,0,0,0.05)" },
                  },
                  x: { ticks: { font: { size: 11 } }, grid: { display: false } },
                },
              }}
            />
          </div>
        </div>
      )}

      {/* Score Breakdown Chart */}
      {scoreChartData && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Score Breakdown — Latest Week</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>
            Your T / A / C / D scores vs minimum floor thresholds
          </div>
          <div style={{ position: "relative", height: 220 }}>
            <Bar
              data={scoreChartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { position: "bottom", labels: { font: { size: 11 }, boxWidth: 14 } },
                  tooltip: { mode: "index", intersect: false },
                },
                scales: {
                  y: {
                    min: 0, max: 100,
                    ticks: { font: { size: 11 } },
                    grid: { color: "rgba(0,0,0,0.05)" },
                  },
                  x: { ticks: { font: { size: 11 } }, grid: { display: false } },
                },
              }}
            />
          </div>
        </div>
      )}

      {/* Week-by-week history */}
      {myRecords.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>My Week-by-Week History</div>
          <div className="table-container">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Week</th><th>T</th><th>A</th><th>C</th><th>D</th><th>WPI</th><th>Band</th>
                  </tr>
                </thead>
                <tbody>
                  {myRecords.map(r => {
                    const c = r.computed || {};
                    return (
                      <tr key={r._id || r.id}>
                        <td style={{ fontSize: 12 }}>{r.week}</td>
                        <td className={`score-val ${(c.T??0)<50?"floor-fail":""}`}>{c.T?.toFixed(1)}</td>
                        <td className={`score-val ${(c.A??0)<50?"floor-fail":""}`}>{c.A?.toFixed(1)}</td>
                        <td className={`score-val ${(c.C??0)<30?"floor-fail":""}`}>{c.C?.toFixed(1)}</td>
                        <td className="score-val">{c.D?.toFixed(1)}</td>
                        <td className="score-val"><strong>{c.WPI?.toFixed(1)}</strong></td>
                        <td><span className={`band-badge band-${c.band}`}><span className={`dot dot-${c.band}`}></span>{c.band}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {myRecords.length === 0 && (
        <div className="card" style={{ padding: 28, textAlign: "center", color: "var(--text-muted)", marginBottom: 20 }}>
          No scores recorded yet for your profile.
        </div>
      )}

      {/* Hard gates status */}
      {cpi && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Placement Gate Status</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.values(cpi.gates).map(g => (
              <div key={g.label} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "8px 12px", borderRadius: 8,
                background: g.pass ? "#E8F5E9" : "#FFF3F0",
                border: `1px solid ${g.pass ? "#A5D6A7" : "#FFCDD2"}`,
              }}>
                <span style={{ fontSize: 13, color: g.pass ? "#1B5E20" : "#B71C1C" }}>
                  {g.pass ? "✓" : "✗"} {g.label}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: g.pass ? "#1B5E20" : "#B71C1C" }}>
                  {g.actual}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Leaderboard */}
      <div className="card">
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>
          Class Leaderboard — Top 10
          {myRank >= 0 && (
            <span style={{ fontSize: 12, fontWeight: 400, color: "var(--text-muted)", marginLeft: 10 }}>
              (Your rank: #{myRank + 1})
            </span>
          )}
        </div>
        {leaderboard.length === 0 ? (
          <div style={{ color: "var(--text-muted)", fontSize: 13 }}>No data yet.</div>
        ) : (
          <div className="table-container">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr><th>#</th><th>Name</th><th>CPI</th><th>Avg WPI</th><th>Tier</th></tr>
                </thead>
                <tbody>
                  {leaderboard.map(({ rank, s, cpiData }) => {
                    const isMe = s.id === student?.id;
                    const ts = TIER_COLOR[cpiData?.tierKey] || TIER_COLOR.gate;
                    return (
                      <tr key={s.id} style={{ background: isMe ? "rgba(59,130,246,0.07)" : "" }}>
                        <td style={{ fontWeight: rank <= 3 ? 800 : 400 }}>
                          {rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`}
                        </td>
                        <td>
                          <strong>{s.name}</strong>
                          {isMe && <span style={{ marginLeft: 8, fontSize: 11, color: "var(--blue)", fontWeight: 600 }}>(You)</span>}
                        </td>
                        <td className="score-val"><strong>{cpiData?.cpi}</strong></td>
                        <td className="score-val">{cpiData?.avgWPI}</td>
                        <td>
                          <span style={{
                            fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6,
                            background: ts.bg, color: ts.text, border: `1px solid ${ts.border}`,
                            whiteSpace: "nowrap",
                          }}>{cpiData?.tier}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
