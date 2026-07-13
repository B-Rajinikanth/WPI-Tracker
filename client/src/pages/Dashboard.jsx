import { useMemo } from "react";
import { Doughnut, Bar, Radar, Line } from "react-chartjs-2";
import {
  Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale,
  LinearScale, BarElement, PointElement, LineElement, RadialLinearScale, Filler,
} from "chart.js";
import { useDB } from "../context/DBContext";
import { useAuth } from "../context/AuthContext";
import KPICard from "../components/ui/KPICard";
import { BandBadge, TrendBadge, DeptChip, ActionChip } from "../components/ui/BandBadge";
import { pct, round1 } from "../utils/wpi";

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale,
  BarElement, PointElement, LineElement, RadialLinearScale, Filler);

const CO = { responsive: true, maintainAspectRatio: false };

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function Dashboard() {
  const { students, records, weeks, activeWeek, getTrend } = useDB();
  const { user } = useAuth();

  const weekRecs = useMemo(() =>
    records.filter(r => r.week === activeWeek), [records, activeWeek]);

  const recMap = useMemo(() => {
    const m = {};
    weekRecs.forEach(r => { m[r.studentId] = r; });
    return m;
  }, [weekRecs]);

  const bandCounts = useMemo(() => {
    const c = { A: 0, B: 0, C: 0 };
    weekRecs.forEach(r => { if (c[r.computed?.band] !== undefined) c[r.computed.band]++; });
    return c;
  }, [weekRecs]);

  const avgWPI = useMemo(() =>
    weekRecs.length ? round1(weekRecs.reduce((s, r) => s + (r.computed?.WPI || 0), 0) / weekRecs.length) : 0,
    [weekRecs]);

  const top10 = useMemo(() =>
    [...weekRecs].sort((a, b) => (b.computed?.WPI || 0) - (a.computed?.WPI || 0)).slice(0, 10),
    [weekRecs]);

  const bottom10 = useMemo(() =>
    [...weekRecs].sort((a, b) => (a.computed?.WPI || 0) - (b.computed?.WPI || 0)).slice(0, 10),
    [weekRecs]);

  const depts = useMemo(() => [...new Set(students.map(s => s.dept))].sort(), [students]);

  const deptAvg = useMemo(() =>
    depts.map(d => {
      const recs = weekRecs.filter(r => students.find(s => s.id === r.studentId && s.dept === d));
      return recs.length ? round1(recs.reduce((s, r) => s + r.computed.WPI, 0) / recs.length) : 0;
    }), [depts, weekRecs, students]);

  // Only show departments that have records this week
  const chartDepts   = depts.filter((_, i) => deptAvg[i] > 0);
  const chartAvgData = deptAvg.filter(v => v > 0);

  const trendPts = useMemo(() =>
    weeks.map(w => {
      const rs = records.filter(r => r.week === w);
      return rs.length ? round1(rs.reduce((s, r) => s + (r.computed?.WPI || 0), 0) / rs.length) : null;
    }), [weeks, records]);

  const stdByName = useMemo(() => {
    const m = {}; students.forEach(s => { m[s.id] = s; });
    return m;
  }, [students]);

  const compAvg = useMemo(() => {
    if (!weekRecs.length) return { T: 0, A: 0, C: 0, D: 0 };
    const sum = weekRecs.reduce((acc, r) => ({
      T: acc.T + (r.computed?.T || 0),
      A: acc.A + (r.computed?.A || 0),
      C: acc.C + (r.computed?.C || 0),
      D: acc.D + (r.computed?.D || 0),
    }), { T: 0, A: 0, C: 0, D: 0 });
    return {
      T: round1(sum.T / weekRecs.length),
      A: round1(sum.A / weekRecs.length),
      C: round1(sum.C / weekRecs.length),
      D: round1(sum.D / weekRecs.length),
    };
  }, [weekRecs]);

  const handleSavePDF = () => window.print();

  return (
    <section className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">{getGreeting()}, {user?.name?.split(" ")[0]}!</div>
          <div className="page-subtitle">Week: {activeWeek || "—"} · {weekRecs.length} students tracked</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm" onClick={handleSavePDF}>📄 Save as PDF</button>
        </div>
      </div>

      {/* KPIs – row 1: summary */}
      <div className="g2 mb20" style={{marginBottom:10}}>
        <KPICard label="Total Students"    value={students.length} sub="enrolled"    cls="kpi-blue"  />
        <KPICard label="Avg WPI This Week" value={avgWPI}          sub={`${weekRecs.length} students tracked`} cls="kpi-green" />
      </div>
      {/* KPIs – row 2: band breakdown */}
      <div className="g3 mb20">
        <KPICard label="Band A – High"     value={bandCounts.A} sub={`${pct(bandCounts.A, weekRecs.length)}% high performers`}   cls="kpi-green" />
        <KPICard label="Band B – Mid"      value={bandCounts.B} sub={`${pct(bandCounts.B, weekRecs.length)}% guided practice`}   cls="kpi-amber" />
        <KPICard label="Band C – Critical" value={bandCounts.C} sub={`${pct(bandCounts.C, weekRecs.length)}% need intervention`} cls="kpi-red"   />
      </div>

      {/* Charts row 1 */}
      <div className="g2 mb20">
        <div className="card">
          <div className="card-header">Band Distribution</div>
          <div className="chart-box">
            <Doughnut
              data={{
                labels: ["Band A", "Band B", "Band C"],
                datasets: [{ data: [bandCounts.A, bandCounts.B, bandCounts.C],
                  backgroundColor: ["#22C55E","#F59E0B","#EF4444"],
                  borderWidth: 0 }],
              }}
              options={{ ...CO, plugins: { legend: { position: "bottom" } } }}
            />
          </div>
        </div>
        <div className="card">
          <div className="card-header">Weekly WPI Trend</div>
          <div className="chart-box">
            <Line
              data={{
                labels: weeks,
                datasets: [{ label: "Avg WPI", data: trendPts,
                  borderColor: "#6366F1", backgroundColor: "rgba(99,102,241,.1)",
                  fill: true, tension: 0.4 }],
              }}
              options={{ ...CO, scales: { y: { min: 0, max: 100 } } }}
            />
          </div>
        </div>
      </div>

      {/* Dept bar + Component breakdown */}
      <div className="g2 mb20">
        <div className="card">
          <div className="card-header">Department-wise Avg WPI</div>
          {chartDepts.length === 0 ? (
            <div style={{padding:"24px 20px",color:"var(--text-muted)",fontSize:13,textAlign:"center"}}>
              No records for the active week yet.
            </div>
          ) : (
            <div className="chart-box chart-h200">
              <Bar
                data={{
                  labels: chartDepts,
                  datasets: [{ label: "Avg WPI", data: chartAvgData,
                    backgroundColor: chartAvgData.map(v => v >= 75 ? "#22C55E" : v >= 50 ? "#F59E0B" : "#EF4444"),
                    borderRadius: 5 }],
                }}
                options={{ ...CO, scales: { y: { min: 0, max: 100 }, x: { grid: { display: false } } },
                  plugins: { legend: { display: false } } }}
              />
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header">Component Score Breakdown (Avg)</div>
          {!weekRecs.length ? (
            <div style={{padding:"24px 20px",color:"var(--text-muted)",fontSize:13,textAlign:"center"}}>
              No records for the active week yet.
            </div>
          ) : (
            <>
              <div className="chart-box chart-h200">
                <Bar
                  data={{
                    labels: ["Technical (T)", "Aptitude (A)", "Communication (C)", "Discipline (D)"],
                    datasets: [{
                      label: "Avg Score",
                      data: [compAvg.T, compAvg.A, compAvg.C, compAvg.D],
                      backgroundColor: [
                        compAvg.T >= 50 ? "#22C55E" : "#EF4444",
                        compAvg.A >= 50 ? "#22C55E" : "#EF4444",
                        compAvg.C >= 30 ? "#22C55E" : "#EF4444",
                        "#6366F1",
                      ],
                      borderRadius: 5,
                    }],
                  }}
                  options={{
                    ...CO,
                    indexAxis: "y",
                    scales: {
                      x: { min: 0, max: 100, grid: { color: "rgba(0,0,0,.05)" } },
                      y: { grid: { display: false } },
                    },
                    plugins: { legend: { display: false } },
                  }}
                />
              </div>
              <div style={{display:"flex",gap:16,marginTop:12,flexWrap:"wrap"}}>
                {[
                  { label:"Technical",    val:compAvg.T, floor:50, weight:"40%" },
                  { label:"Aptitude",     val:compAvg.A, floor:50, weight:"25%" },
                  { label:"Communication",val:compAvg.C, floor:30, weight:"25%" },
                  { label:"Discipline",   val:compAvg.D, floor:null,weight:"10%" },
                ].map(({ label, val, floor, weight }) => (
                  <div key={label} style={{flex:"1 1 80px",background:"var(--bg,#F4F6F9)",
                    borderRadius:8,padding:"8px 12px",textAlign:"center",
                    borderTop:`3px solid ${floor !== null && val < floor ? "#EF4444" : "#22C55E"}`}}>
                    <div style={{fontSize:11,color:"var(--text-muted)",fontWeight:600}}>{label}</div>
                    <div style={{fontSize:22,fontWeight:800,color:"var(--text)"}}>{val}</div>
                    <div style={{fontSize:10,color:"var(--text-muted)"}}>{weight} weight</div>
                    {floor !== null && val < floor && (
                      <div style={{fontSize:10,color:"#EF4444",fontWeight:700,marginTop:2}}>
                        ⚠ Below floor ({floor})
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Top / Bottom */}
      <div className="g2 mb20">
        <div className="card">
          <div className="card-header">🏆 Top 10 Performers</div>
          <div className="table-container">
            <div className="table-scroll">
            <table className="table-fit" style={{minWidth:"unset"}}>
              <thead><tr><th>#</th><th>URN</th><th className="col-hide-sm">Name</th><th>WPI</th><th>Band</th></tr></thead>
              <tbody>
                {top10.map((r, i) => {
                  const s = stdByName[r.studentId] || {};
                  return (
                    <tr key={r.id}>
                      <td>{i + 1}</td>
                      <td><strong>{s.urn || "—"}</strong></td>
                      <td className="col-hide-sm">{s.name}</td>
                      <td className="score-val"><strong>{r.computed?.WPI?.toFixed(1)}</strong></td>
                      <td><BandBadge band={r.computed?.band} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-header">⚠ Needs Attention (Bottom 10)</div>
          <div className="table-container">
            <div className="table-scroll">
            <table className="table-fit" style={{minWidth:"unset"}}>
              <thead><tr><th>#</th><th>URN</th><th className="col-hide-sm">Name</th><th>WPI</th><th>Band</th></tr></thead>
              <tbody>
                {bottom10.map((r, i) => {
                  const s = stdByName[r.studentId] || {};
                  return (
                    <tr key={r.id}>
                      <td>{i + 1}</td>
                      <td><strong>{s.urn || "—"}</strong></td>
                      <td className="col-hide-sm">{s.name}</td>
                      <td className="score-val">{r.computed?.WPI?.toFixed(1)}</td>
                      <td><BandBadge band={r.computed?.band} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
