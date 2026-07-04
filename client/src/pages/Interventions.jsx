import { useMemo } from "react";
import { useDB } from "../context/DBContext";
import { num } from "../utils/wpi";

export default function Interventions() {
  const { students, records, activeWeek, getTrend } = useDB();

  const weekRecs = useMemo(() => records.filter(r => r.week === activeWeek), [records, activeWeek]);

  const crit = useMemo(() => weekRecs.filter(r => r.computed?.band === "C"), [weekRecs]);
  const osc  = useMemo(() => students.filter(s => getTrend(s.id) === "⚠"), [students, getTrend]);
  const abs  = useMemo(() => weekRecs.filter(r => r.attendance != null && Number(r.attendance) < 75), [weekRecs]);
  const flr  = useMemo(() => weekRecs.filter(r => (r.computed?.floorFails||[]).length > 0), [weekRecs]);

  const byId = useMemo(() => { const m={}; students.forEach(s=>m[s.id]=s); return m; }, [students]);

  const Section = ({ title, color, items, renderItem }) => (
    <div className="card mb20">
      <div className="card-header">
        {title}
        <span style={{background:color,color:"#fff",padding:"2px 8px",borderRadius:10,fontSize:12,fontWeight:700,marginLeft:8}}>{items.length}</span>
      </div>
      {!items.length
        ? <div className="alert alert-green"><span className="alert-icon">✅</span><div>None this week.</div></div>
        : items.map((item,i) => renderItem(item, i))
      }
    </div>
  );

  return (
    <section className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">Interventions Required</div>
          <div className="page-subtitle">Active week: {activeWeek || "—"}</div>
        </div>
      </div>

      <div className="g2">
        <div>
          <Section title="🔴 Band C — Critical" color="var(--red)" items={crit} renderItem={r => {
            const s = byId[r.studentId]||{};
            return (
              <div key={r.id} className="alert alert-red">
                <span className="alert-icon">🔴</span>
                <div>
                  <strong>{s.name}</strong> ({s.urn}) · {s.dept}
                  <br/><small>WPI: {r.computed?.WPI?.toFixed(1)} · T:{r.computed?.T?.toFixed(1)} · A:{r.computed?.A?.toFixed(1)} · C:{r.computed?.C?.toFixed(1)} · D:{r.computed?.D?.toFixed(1)}</small>
                  <br/><small><em>Action: Min 3 extra practice hrs/week · FPC counselling · Weekly reassessment</em></small>
                </div>
              </div>
            );
          }} />

          <Section title="⚠ Oscillating Students" color="var(--amber)" items={osc} renderItem={s => {
            const lr = records.filter(r=>r.studentId===s.id).sort((a,b)=>b.week.localeCompare(a.week))[0];
            return (
              <div key={s.id} className="alert alert-amber">
                <span className="alert-icon">⚠</span>
                <div>
                  <strong>{s.name}</strong> ({s.dept}) · Band oscillating for 3+ weeks
                  <br/><small>Latest WPI: {lr?.computed?.WPI?.toFixed(1)||"—"} · Formal intervention plan must be triggered</small>
                </div>
              </div>
            );
          }} />
        </div>

        <div>
          <Section title="📅 Attendance Below 75%" color="var(--amber)" items={abs} renderItem={r => {
            const s = byId[r.studentId]||{};
            return (
              <div key={r.id} className="alert alert-amber">
                <span className="alert-icon">📅</span>
                <div>
                  <strong>{s.name}</strong> · Attendance: <strong>{r.attendance}%</strong>
                  <br/><small>Minimum required: 75% · Governance compliance action required</small>
                </div>
              </div>
            );
          }} />

          <Section title="🚫 Floor Score Failures" color="var(--red)" items={flr} renderItem={r => {
            const s = byId[r.studentId]||{};
            return (
              <div key={r.id} className="alert alert-red">
                <span className="alert-icon">🚫</span>
                <div>
                  <strong>{s.name}</strong> · WPI: {r.computed?.WPI?.toFixed(1)} → Band: <strong>{r.computed?.band}</strong>
                  <br/><small>Floor fails: {(r.computed?.floorFails||[]).join(" · ")}</small>
                </div>
              </div>
            );
          }} />
        </div>
      </div>
    </section>
  );
}
