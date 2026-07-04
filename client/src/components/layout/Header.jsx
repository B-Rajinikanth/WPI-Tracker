import { useState } from "react";
import { useDB } from "../../context/DBContext";
import { weekLabel } from "../../utils/wpi";

export default function Header() {
  const { weeks, activeWeek, addWeek, setActiveWeek } = useDB();
  const [showDialog, setShowDialog] = useState(false);
  const [weekTitle, setWeekTitle]   = useState("");

  const openDialog = () => {
    setWeekTitle(`Week ${weeks.length + 1}`);
    setShowDialog(true);
  };

  const confirmAddWeek = async () => {
    const label = weekTitle.trim();
    if (!label) return;
    await addWeek(label);
    setShowDialog(false);
  };

  return (
    <>
      <header className="app-header">
        <div className="app-logo">
          <div className="app-logo-uni">Sreenidhi University</div>
          <div className="app-logo-title">WPI Tracker — A24 Batch</div>
          <div className="app-logo-sub">Skill Development Centre</div>
        </div>

        <div className="header-controls">
          <span className="header-week-label">Active Week:</span>
          <select
            className="week-select"
            value={activeWeek}
            onChange={e => setActiveWeek(e.target.value)}
          >
            {weeks.map(w => (
              <option key={w} value={w}>{weekLabel(w)}</option>
            ))}
          </select>
          <button className="btn-header" onClick={openDialog}>+ New Week</button>
        </div>
      </header>

      {showDialog && (
        <div style={{
          position:"fixed",inset:0,background:"rgba(0,0,0,.45)",
          display:"flex",alignItems:"center",justifyContent:"center",zIndex:9000
        }}>
          <div style={{
            background:"#fff",borderRadius:14,padding:28,width:"min(380px,92vw)",
            boxShadow:"0 8px 32px rgba(0,0,0,.2)",
            borderTop:"4px solid var(--blue-mid)"
          }}>
            <div style={{fontSize:16,fontWeight:700,marginBottom:4,color:"var(--text)"}}>Create New Week</div>
            <div style={{fontSize:12,color:"var(--text-muted)",marginBottom:16}}>Enter a title for the new performance week.</div>
            <label style={{fontSize:11,fontWeight:700,display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:".5px",color:"var(--text-muted)"}}>Week Title</label>
            <input
              autoFocus
              className="form-control"
              value={weekTitle}
              onChange={e => setWeekTitle(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") confirmAddWeek(); if (e.key === "Escape") setShowDialog(false); }}
              placeholder="e.g. Week 5 – Python Sprint"
              style={{marginBottom:20}}
            />
            <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
              <button className="btn btn-ghost" onClick={() => setShowDialog(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={confirmAddWeek} disabled={!weekTitle.trim()}>
                Create Week
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
