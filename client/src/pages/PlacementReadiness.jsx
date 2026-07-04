import { useMemo, useState, Fragment } from "react";
import { useDB } from "../context/DBContext";
import { calcCPI, applySortState, sortRows, round1 } from "../utils/wpi";
import { BandBadge, TrendBadge } from "../components/ui/BandBadge";
import SortableTh from "../components/ui/SortableTh";

/* ── Tier config ─────────────────────────────────────────── */
const TIER_CFG = {
  ready:    { label: "Placement Ready",  emoji: "✅", bg: "#E8F5E9", color: "#1B5E20", border: "#A5D6A7", badgeBg: "#C8E6C9" },
  near:     { label: "Near Ready",       emoji: "🟡", bg: "#F1F8E9", color: "#33691E", border: "#C5E1A5", badgeBg: "#DCEDC8" },
  progress: { label: "In Progress",      emoji: "🟠", bg: "#FFF8E1", color: "#BF360C", border: "#FFE082", badgeBg: "#FFE0B2" },
  noready:  { label: "Not Ready",        emoji: "🔴", bg: "#FFF3F0", color: "#7F0000", border: "#FFAB91", badgeBg: "#FFCCBC" },
  gate:     { label: "Gate Fail",        emoji: "🚧", bg: "#F5F5F5", color: "#424242", border: "#BDBDBD", badgeBg: "#E0E0E0" },
};

function TierBadge({ tierKey, cpi }) {
  const cfg = TIER_CFG[tierKey] || TIER_CFG.gate;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 10px", borderRadius: 20,
      fontSize: 11, fontWeight: 700,
      background: cfg.badgeBg, color: cfg.color,
      border: `1px solid ${cfg.border}`,
      whiteSpace: "nowrap",
    }}>
      {cfg.emoji} {cfg.label}{cpi != null ? ` — ${cpi}` : ""}
    </span>
  );
}

function GateRow({ label, pass, actual }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
      <span style={{ fontSize: 13 }}>{pass ? "✅" : "❌"}</span>
      <span style={{ fontSize: 12, color: pass ? "#1B5E20" : "#7F0000", flex: 1 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: pass ? "#1B5E20" : "#7F0000" }}>{actual}</span>
    </div>
  );
}

function ScoreBar({ value, max = 100, color }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ flex: 1, height: 6, background: "#E0E0E0", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width .3s" }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, minWidth: 32, textAlign: "right", color }}>{value}</span>
    </div>
  );
}

export default function PlacementReadiness() {
  const { students, records, weeks } = useDB();
  const [sort, setSort]     = useState({ col: "cpi", dir: "desc" });
  const [filter, setFilter] = useState("");
  const [tierFilter, setTierFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [expanded, setExpanded] = useState(null);

  const depts = useMemo(() => [...new Set(students.map(s => s.dept))].sort(), [students]);

  const cpiData = useMemo(() =>
    students.map(s => {
      const cpi = calcCPI(s.id, records, weeks);
      return { s, cpi };
    }),
    [students, records, weeks]
  );

  // KPI counts
  const counts = useMemo(() => {
    const c = { ready: 0, near: 0, progress: 0, noready: 0, gate: 0, nodata: 0 };
    cpiData.forEach(({ cpi }) => {
      if (!cpi) c.nodata++;
      else c[cpi.tierKey] = (c[cpi.tierKey] || 0) + 1;
    });
    return c;
  }, [cpiData]);

  // Filtered + sorted list
  const list = useMemo(() => {
    const ql = filter.toLowerCase();
    let rows = cpiData.filter(({ s, cpi }) => {
      if (filter && !s.name.toLowerCase().includes(ql) && !s.urn.toLowerCase().includes(ql)) return false;
      if (tierFilter && (!cpi || cpi.tierKey !== tierFilter)) return false;
      if (deptFilter && s.dept !== deptFilter) return false;
      return true;
    });
    return sortRows(rows, sort.col, sort.dir, (item, col) => {
      const { s, cpi } = item;
      switch (col) {
        case "name":        return s.name;
        case "urn":         return s.urn;
        case "dept":        return s.dept;
        case "cpi":         return cpi?.cpi ?? -1;
        case "avgWPI":      return cpi?.avgWPI ?? -1;
        case "consistency": return cpi?.consistency ?? -1;
        case "floor":       return cpi?.floorCompliance ?? -1;
        case "tier":        return cpi?.tierKey ?? "z";
        default:            return "";
      }
    });
  }, [cpiData, filter, tierFilter, deptFilter, sort]);

  const onSort = col => setSort(s => applySortState(s, col));

  // Dept breakdown
  const deptSummary = useMemo(() => {
    const map = {};
    cpiData.forEach(({ s, cpi }) => {
      if (!map[s.dept]) map[s.dept] = { dept: s.dept, total: 0, ready: 0, sumCPI: 0 };
      map[s.dept].total++;
      if (cpi?.tierKey === "ready") map[s.dept].ready++;
      if (cpi) map[s.dept].sumCPI += cpi.cpi;
    });
    return Object.values(map)
      .map(d => ({ ...d, avgCPI: d.total ? round1(d.sumCPI / d.total) : 0 }))
      .sort((a, b) => b.avgCPI - a.avgCPI);
  }, [cpiData]);

  const total = students.length;
  const withData = cpiData.filter(d => d.cpi).length;

  return (
    <section className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">Placement Readiness</div>
          <div className="page-subtitle">Cumulative Performance Index (CPI) — aggregated across all weekly WPI records</div>
        </div>
        <div className="page-actions">
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{withData} of {total} students assessed</span>
        </div>
      </div>

      {/* Formula banner */}
      <div style={{
        background: "linear-gradient(135deg,#0A1F0A,#1B5E20,#2E7D32)",
        borderRadius: 12, padding: "14px 20px", marginBottom: 20,
        color: "#fff", display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center",
      }}>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: .5, color: "#FFD54F" }}>CPI Formula</div>
        <div style={{ fontSize: 12, opacity: .9 }}>
          <strong>AvgWPI × 0.60</strong>
          <span style={{ opacity: .6, margin: "0 6px" }}>+</span>
          <strong>Consistency × 0.20</strong>
          <span style={{ opacity: .6, margin: "0 6px" }}>+</span>
          <strong>Trend Score × 0.10</strong>
          <span style={{ opacity: .6, margin: "0 6px" }}>+</span>
          <strong>Floor Compliance × 0.10</strong>
        </div>
        <div style={{ marginLeft: "auto", fontSize: 11, opacity: .7, lineHeight: 1.5 }}>
          Hard gates: Avg T≥55 · Avg A≥55 · Avg C≥40 · Weeks≥60%
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12, marginBottom: 24 }}>
        {["ready","near","progress","noready","gate"].map(key => {
          const cfg = TIER_CFG[key];
          return (
            <div key={key}
              onClick={() => setTierFilter(t => t === key ? "" : key)}
              style={{
                background: tierFilter === key ? cfg.bg : "#fff",
                border: `1.5px solid ${tierFilter === key ? cfg.border : "#E0E0E0"}`,
                borderRadius: 12, padding: "14px 16px", cursor: "pointer",
                transition: "all .15s", boxShadow: tierFilter === key ? `0 2px 8px ${cfg.border}` : "none",
              }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>{cfg.emoji}</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: cfg.color }}>{counts[key] || 0}</div>
              <div style={{ fontSize: 11, color: "#666", marginTop: 2, lineHeight: 1.3 }}>{cfg.label}</div>
            </div>
          );
        })}
        <div style={{ background: "#fff", border: "1.5px solid #E0E0E0", borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontSize: 20, marginBottom: 4 }}>📊</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: "var(--blue-mid)" }}>{counts.nodata || 0}</div>
          <div style={{ fontSize: 11, color: "#666", marginTop: 2, lineHeight: 1.3 }}>No Data</div>
        </div>
      </div>

      {/* Dept Summary */}
      {deptSummary.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 10 }}>
            Department Summary
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {deptSummary.map(d => (
              <div key={d.dept} style={{
                background: "#fff", border: "1px solid var(--border)",
                borderRadius: 10, padding: "10px 14px", minWidth: 120,
              }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "var(--blue-mid)", marginBottom: 4 }}>{d.dept}</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: d.avgCPI >= 80 ? "#1B5E20" : d.avgCPI >= 65 ? "#33691E" : d.avgCPI >= 50 ? "#BF360C" : "#7F0000" }}>{d.avgCPI}</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)" }}>avg CPI · {d.total} students</div>
                <div style={{ fontSize: 10, color: "#1B5E20", marginTop: 2 }}>✅ {d.ready} ready</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="roster-filters">
        <div className="search-wrap" style={{ flex: 1, minWidth: 180 }}>
          <input className="search-input" placeholder="Search name or URN…" value={filter} onChange={e => setFilter(e.target.value)} />
        </div>
        <select className="form-control roster-dept-sel" value={tierFilter} onChange={e => setTierFilter(e.target.value)}>
          <option value="">All Tiers</option>
          {Object.entries(TIER_CFG).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
        </select>
        <select className="form-control roster-dept-sel" value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
          <option value="">All Departments</option>
          {depts.map(d => <option key={d}>{d}</option>)}
        </select>
        <span className="roster-count" style={{ fontSize: 13, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{list.length} students</span>
      </div>

      {/* Main Table */}
      <div className="table-container">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <SortableTh label="URN"         col="urn"         sort={sort} onSort={onSort} />
                <SortableTh label="Name"         col="name"        sort={sort} onSort={onSort} />
                <SortableTh label="Dept"         col="dept"        sort={sort} onSort={onSort} className="col-hide-sm" />
                <SortableTh label="CPI"          col="cpi"         sort={sort} onSort={onSort} />
                <SortableTh label="Tier"         col="tier"        sort={sort} onSort={onSort} />
                <SortableTh label="Avg WPI"      col="avgWPI"      sort={sort} onSort={onSort} className="col-hide-sm" />
                <SortableTh label="Consistency"  col="consistency" sort={sort} onSort={onSort} className="col-hide-md" />
                <SortableTh label="Floor %"      col="floor"       sort={sort} onSort={onSort} className="col-hide-md" />
                <th className="col-hide-sm">Trend</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {!list.length ? (
                <tr><td colSpan={11} style={{ textAlign: "center", padding: 32, color: "var(--text-muted)" }}>No students found.</td></tr>
              ) : list.map(({ s, cpi }, i) => {
                const isOpen = expanded === s.id;
                return (
                  <Fragment key={s.id}>
                    <tr style={{ background: isOpen ? "#F8FFF8" : undefined }}>
                      <td style={{ color: "var(--text-muted)", fontSize: 12 }}>{i + 1}</td>
                      <td><strong>{s.urn}</strong></td>
                      <td><strong>{s.name}</strong></td>
                      <td className="col-hide-sm" style={{ fontSize: 12 }}>{s.dept}</td>
                      <td>
                        {cpi
                          ? <strong style={{ fontSize: 16, color: TIER_CFG[cpi.tierKey]?.color }}>{cpi.cpi}</strong>
                          : <span style={{ color: "var(--text-muted)" }}>—</span>}
                      </td>
                      <td>
                        {cpi
                          ? <TierBadge tierKey={cpi.tierKey} />
                          : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>No data</span>}
                      </td>
                      <td className="col-hide-sm score-val">{cpi?.avgWPI ?? "—"}</td>
                      <td className="col-hide-md score-val">{cpi?.consistency ?? "—"}</td>
                      <td className="col-hide-md score-val">{cpi ? `${cpi.floorCompliance}%` : "—"}</td>
                      <td className="col-hide-sm">{cpi ? <TrendBadge trend={cpi.trend} /> : "—"}</td>
                      <td>
                        {cpi && (
                          <button
                            className="btn btn-ghost btn-xs"
                            onClick={() => setExpanded(x => x === s.id ? null : s.id)}
                          >
                            {isOpen ? "▲ Hide" : "▼ Details"}
                          </button>
                        )}
                      </td>
                    </tr>
                    {isOpen && cpi && (
                      <tr>
                        <td colSpan={11} style={{ background: "#F0FFF0", padding: "16px 20px" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16 }}>

                            {/* CPI Breakdown */}
                            <div style={{ background: "#fff", borderRadius: 10, padding: 14, border: "1px solid #C8E6C9" }}>
                              <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".5px", color: "#2E7D32", marginBottom: 10 }}>CPI Breakdown</div>
                              <div style={{ marginBottom: 6 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
                                  <span>Avg WPI <span style={{ color: "#999" }}>×60%</span></span>
                                  <span style={{ fontWeight: 700 }}>{round1(cpi.avgWPI * 0.60)}</span>
                                </div>
                                <ScoreBar value={cpi.avgWPI} color="#1B5E20" />
                              </div>
                              <div style={{ marginBottom: 6 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
                                  <span>Consistency <span style={{ color: "#999" }}>×20%</span></span>
                                  <span style={{ fontWeight: 700 }}>{round1(cpi.consistency * 0.20)}</span>
                                </div>
                                <ScoreBar value={cpi.consistency} color="#0277BD" />
                              </div>
                              <div style={{ marginBottom: 6 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
                                  <span>Trend Score <span style={{ color: "#999" }}>×10%</span></span>
                                  <span style={{ fontWeight: 700 }}>{round1(cpi.trendScore * 0.10)}</span>
                                </div>
                                <ScoreBar value={cpi.trendScore} color="#E65100" />
                              </div>
                              <div style={{ marginBottom: 8 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
                                  <span>Floor Compliance <span style={{ color: "#999" }}>×10%</span></span>
                                  <span style={{ fontWeight: 700 }}>{round1(cpi.floorCompliance * 0.10)}</span>
                                </div>
                                <ScoreBar value={cpi.floorCompliance} color="#7B1FA2" />
                              </div>
                              <div style={{ borderTop: "1px solid #E8F5E9", paddingTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontSize: 12, fontWeight: 700 }}>Total CPI</span>
                                <span style={{ fontSize: 20, fontWeight: 900, color: TIER_CFG[cpi.tierKey]?.color }}>{cpi.cpi}</span>
                              </div>
                            </div>

                            {/* Hard Gates */}
                            <div style={{ background: "#fff", borderRadius: 10, padding: 14, border: `1px solid ${cpi.allGatesPassed ? "#C8E6C9" : "#FFAB91"}` }}>
                              <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".5px", color: cpi.allGatesPassed ? "#2E7D32" : "#BF360C", marginBottom: 10 }}>
                                Hard Gates {cpi.allGatesPassed ? "✅ All Passed" : "❌ Failed"}
                              </div>
                              {Object.values(cpi.gates).map(g => (
                                <GateRow key={g.label} {...g} />
                              ))}
                              <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>
                                Weeks recorded: <strong>{cpi.weeksCount}</strong> of {weeks.length} ({cpi.coveragePct}%)
                              </div>
                            </div>

                            {/* Component Averages */}
                            <div style={{ background: "#fff", borderRadius: 10, padding: 14, border: "1px solid #C8E6C9" }}>
                              <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".5px", color: "#2E7D32", marginBottom: 10 }}>
                                Component Averages
                              </div>
                              {[
                                { label: "Technical (T)", value: cpi.avgT, threshold: 55, color: "#1B5E20" },
                                { label: "Aptitude (A)",  value: cpi.avgA, threshold: 55, color: "#0277BD" },
                                { label: "Communication (C)", value: cpi.avgC, threshold: 40, color: "#7B1FA2" },
                              ].map(({ label, value, threshold, color }) => (
                                <div key={label} style={{ marginBottom: 8 }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
                                    <span>{label}</span>
                                    <span style={{ fontWeight: 700, color: value >= threshold ? "#1B5E20" : "#C62828" }}>
                                      {value} {value >= threshold ? "✓" : `(need ${threshold})`}
                                    </span>
                                  </div>
                                  <ScoreBar value={value} color={value >= threshold ? color : "#C62828"} />
                                </div>
                              ))}
                              <div style={{ marginTop: 8, padding: "8px 0", borderTop: "1px solid #E8F5E9" }}>
                                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Recommendation</div>
                                <div style={{ fontSize: 12, fontWeight: 600, color: TIER_CFG[cpi.tierKey]?.color, lineHeight: 1.5 }}>
                                  {cpi.tierKey === "ready"    && "✅ Recommend for campus drives. Prepare resume and mock interviews."}
                                  {cpi.tierKey === "near"     && "🟡 Targeted 2–4 week sprint on the weakest component."}
                                  {cpi.tierKey === "progress" && "🟠 1–2 months structured training. Focus on lowest CPI component."}
                                  {cpi.tierKey === "noready"  && "🔴 Intensive intervention. Address floor failures first."}
                                  {cpi.tierKey === "gate"     && "🚧 One or more hard gates failed. Resolve gate issues before CPI tier applies."}
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
