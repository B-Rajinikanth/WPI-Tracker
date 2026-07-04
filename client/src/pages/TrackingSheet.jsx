import { useState, useMemo, Fragment } from "react";
import * as XLSX from "xlsx";
import { useDB } from "../context/DBContext";
import { BandBadge, TrendBadge, DeptChip, ActionChip } from "../components/ui/BandBadge";
import SortableTh from "../components/ui/SortableTh";
import { calcScores, uid, applySortState, sortRows } from "../utils/wpi";

export default function TrackingSheet() {
  const { students, records, weeks, activeWeek, bulkSaveRecords, getTrend } = useDB();
  const [wf, setWf]     = useState(activeWeek);
  const [df, setDf]     = useState("");
  const [bf, setBf]     = useState("");
  const [q,  setQ]      = useState("");
  const [sort, setSort] = useState({ col:"week", dir:"desc" });
  const [expandedId, setExpandedId] = useState(null);
  const toggleExpand = id => setExpandedId(prev => prev === id ? null : id);

  const depts = useMemo(() => [...new Set(students.map(s=>s.dept))].sort(), [students]);

  const filtered = useMemo(() => {
    return records.filter(r => {
      const s = students.find(st=>st.id===r.studentId);
      if (!s) return false;
      if (wf && r.week!==wf) return false;
      if (df && s.dept!==df)  return false;
      if (bf && r.computed?.band!==bf) return false;
      const ql = q.toLowerCase();
      if (q && !s.name.toLowerCase().includes(ql) && !s.urn.toLowerCase().includes(ql)) return false;
      return true;
    });
  }, [records, students, wf, df, bf, q]);

  const sorted = useMemo(() =>
    sortRows(filtered, sort.col, sort.dir, (r, col) => {
      const s = students.find(st=>st.id===r.studentId)||{};
      switch(col) {
        case "urn":  return s.urn||"";
        case "name": return s.name||"";
        case "dept": return s.dept||"";
        case "week": return r.week;
        case "T":    return r.computed?.T??0;
        case "A":    return r.computed?.A??0;
        case "C":    return r.computed?.C??0;
        case "D":    return r.computed?.D??0;
        case "wpi":  return r.computed?.WPI??0;
        case "band": return r.computed?.band??"";
        default:     return "";
      }
    }), [filtered, sort, students]);

  const onSort = col => setSort(s => applySortState(s, col));

  // Export CSV
  const exportCSV = () => {
    const rows = [["URN","Name","Dept","Week","T","A","C","D","WPI","Band"]];
    sorted.forEach(r => {
      const s = students.find(st=>st.id===r.studentId)||{};
      rows.push([s.urn,s.name,s.dept,r.week,
        r.computed?.T,r.computed?.A,r.computed?.C,r.computed?.D,r.computed?.WPI,r.computed?.band]);
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Tracking");
    XLSX.writeFile(wb, "WPI_Tracking.xlsx");
  };

  // Excel import for bulk scores
  const handleImport = e => {
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const wb  = XLSX.read(ev.target.result,{type:"array"});
      const ws  = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws,{header:1,defval:""});
      const hdr = raw[0]||[];
      const ci  = {}; hdr.forEach((h,i)=>{
        const n=String(h).toLowerCase().replace(/[\s_]/g,"");
        if(n.includes("urn"))ci.urn=i; else if(n.includes("name"))ci.name=i;
        else if(n.includes("unico"))ci.uniContest=i; else if(n.includes("vendor"))ci.vendorScore=i;
        else if(n.includes("core"))ci.coreSubject=i; else if(n.includes("skill"))ci.skillActivities=i;
        else if(n.includes("attempt"))ci.probAttempted=i; else if(n.includes("solved"))ci.probSolved=i;
        else if(n.includes("quant"))ci.quant=i; else if(n.includes("logic"))ci.logical=i;
        else if(n.includes("verb"))ci.verbal=i; else if(n.includes("gd"))ci.gd=i;
        else if(n.includes("mock"))ci.mock=i; else if(n.includes("conf"))ci.confidence=i;
        else if(n.includes("attend"))ci.attendance=i;
        else if(n.includes("ccglobal")||n.includes("contestp")||n.includes("uni_contest_p"))ci.contestParticipation=i;
        else if(n.includes("universitycontest")||n.includes("proctor"))ci.proctoredContest=i;
      });
      const getN = (row,f) => { const v=row[ci[f]]; return(v===""||v==null)?null:Number(v); };
      const getYN= (row,f) => { const v=String(row[ci[f]]||"").toLowerCase(); return(v==="yes"||v==="1"||v==="y")?1:0; };
      const newRecs = raw.slice(1).filter(r=>r[ci.urn]).map(row=>{
        const s=students.find(st=>st.urn===String(row[ci.urn]).trim());
        if(!s) return null;
        const rd={ uniContest:getN(row,"uniContest"),vendorScore:getN(row,"vendorScore"),
          coreSubject:getN(row,"coreSubject"),skillActivities:getN(row,"skillActivities"),
          probAttempted:getN(row,"probAttempted"),probSolved:getN(row,"probSolved"),
          quant:getN(row,"quant"),logical:getN(row,"logical"),verbal:getN(row,"verbal"),
          gd:getN(row,"gd"),mock:getN(row,"mock"),confidence:getN(row,"confidence"),
          attendance:getN(row,"attendance"),
          contestParticipation:getYN(row,"contestParticipation"),
          proctoredContest:getYN(row,"proctoredContest") };
        return { id:uid(), studentId:s.id, week:activeWeek, ...rd, computed:calcScores(rd) };
      }).filter(Boolean);
      if(newRecs.length) bulkSaveRecords(newRecs);
    };
    reader.readAsArrayBuffer(file);
    e.target.value="";
  };

  return (
    <section className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">Student Tracking Sheet</div>
          <div className="page-subtitle">Weekly performance data for all students</div>
        </div>
        <div className="page-actions">
          <span style={{fontSize:13,color:"var(--text-muted)"}}>{sorted.length} records</span>
          <button className="btn btn-ghost btn-sm" onClick={exportCSV}>⬇ Export</button>
          <label className="btn btn-outline btn-sm" style={{cursor:"pointer"}}>
            📥 Import Excel
            <input type="file" accept=".xlsx,.xls" onChange={handleImport} style={{display:"none"}} />
          </label>
        </div>
      </div>

      {/* Filters */}
      <div className="tracking-filters">
        <div className="search-wrap tracking-search">
          <input className="search-input" placeholder="Search name or URN…" value={q} onChange={e=>setQ(e.target.value)} />
        </div>
        <select className="form-control tracking-sel" value={wf} onChange={e=>setWf(e.target.value)}>
          <option value="">All Weeks</option>
          {[...weeks].reverse().map(w=><option key={w} value={w}>{w}</option>)}
        </select>
        <select className="form-control tracking-sel" value={df} onChange={e=>setDf(e.target.value)}>
          <option value="">All Departments</option>
          {depts.map(d=><option key={d}>{d}</option>)}
        </select>
        <select className="form-control tracking-sel" value={bf} onChange={e=>setBf(e.target.value)}>
          <option value="">All Bands</option>
          <option value="A">Band A</option>
          <option value="B">Band B</option>
          <option value="C">Band C</option>
        </select>
      </div>

      <div className="table-container">
        <div className="table-scroll">
          <table className="table-fit" style={{minWidth:"unset"}}>
            <thead><tr>
              <th style={{width:28}}>#</th>
              <SortableTh label="URN No."  col="urn"  sort={sort} onSort={onSort} />
              <SortableTh label="Name"     col="name" sort={sort} onSort={onSort} className="col-hide-sm" />
              <SortableTh label="Dept"     col="dept" sort={sort} onSort={onSort} className="col-hide-sm" />
              <SortableTh label="Week"     col="week" sort={sort} onSort={onSort} className="col-hide-sm" />
              <SortableTh label="T"        col="T"    sort={sort} onSort={onSort} className="col-hide-sm" />
              <SortableTh label="A"        col="A"    sort={sort} onSort={onSort} className="col-hide-sm" />
              <SortableTh label="C"        col="C"    sort={sort} onSort={onSort} className="col-hide-sm" />
              <SortableTh label="D"        col="D"    sort={sort} onSort={onSort} className="col-hide-sm" />
              <SortableTh label="WPI"      col="wpi"  sort={sort} onSort={onSort} />
              <SortableTh label="Band"     col="band" sort={sort} onSort={onSort} />
              <th className="col-hide-sm">Trend</th>
              <th className="col-hide-md">Action Plan</th>
              <th style={{width:32}}></th>
            </tr></thead>
            <tbody>
              {!sorted.length
                ? <tr><td colSpan={14} style={{textAlign:"center",padding:32,color:"var(--text-muted)"}}>No records found.</td></tr>
                : sorted.map(r => {
                  const s      = students.find(st=>st.id===r.studentId)||{};
                  const c      = r.computed||{};
                  const trend  = getTrend(r.studentId);
                  const isOpen = expandedId === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr style={isOpen ? {background:"var(--blue-pale)"} : {}}>
                        <td style={{color:"var(--text-muted)",fontSize:12}}>{sorted.indexOf(r)+1}</td>
                        <td><strong>{s.urn||"—"}</strong></td>
                        <td className="col-hide-sm"><strong>{s.name||"—"}</strong></td>
                        <td className="col-hide-sm"><DeptChip dept={s.dept||"—"} /></td>
                        <td className="col-hide-sm"><span className="week-pill">{r.week}</span></td>
                        <td className={`score-val col-hide-sm ${c.T<50?"floor-fail":""}`}>{c.T?.toFixed(1)}</td>
                        <td className={`score-val col-hide-sm ${c.A<50?"floor-fail":""}`}>{c.A?.toFixed(1)}</td>
                        <td className={`score-val col-hide-sm ${c.C<30?"floor-fail":""}`}>{c.C?.toFixed(1)}</td>
                        <td className="score-val col-hide-sm">{c.D?.toFixed(1)}</td>
                        <td className="score-val"><strong>{c.WPI?.toFixed(1)}</strong></td>
                        <td><BandBadge band={c.band} /></td>
                        <td className="col-hide-sm"><TrendBadge trend={trend} /></td>
                        <td className="col-hide-md"><ActionChip band={c.band} /></td>
                        <td>
                          <button
                            className={`expand-btn${isOpen ? " open" : ""}`}
                            onClick={() => toggleExpand(r.id)}
                            title={isOpen ? "Collapse" : "Expand details"}
                          >
                            {isOpen ? "▾" : "▸"}
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={14} style={{padding:0}}>
                            <div className="student-detail-panel">
                              <div className="sdp-item">
                                <span className="sdp-label">Name</span>
                                <strong className="sdp-value">{s.name||"—"}</strong>
                              </div>
                              <div className="sdp-item">
                                <span className="sdp-label">Week</span>
                                <span className="sdp-value"><span className="week-pill">{r.week}</span></span>
                              </div>
                              <div className="sdp-item">
                                <span className="sdp-label">Department</span>
                                <span className="sdp-value"><DeptChip dept={s.dept||"—"} /></span>
                              </div>
                              <div className="sdp-item">
                                <span className="sdp-label">Trend</span>
                                <span className="sdp-value"><TrendBadge trend={trend} /></span>
                              </div>
                              {/* Component scores */}
                              <div style={{gridColumn:"1 / -1"}}>
                                <span className="sdp-label" style={{display:"block",marginBottom:6}}>Component Scores</span>
                                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:6}}>
                                  {[
                                    {label:"T", val:c.T, floor:50},
                                    {label:"A", val:c.A, floor:50},
                                    {label:"C", val:c.C, floor:30},
                                    {label:"D", val:c.D, floor:null},
                                  ].map(({label, val, floor}) => {
                                    const fail = floor !== null && (val ?? 0) < floor;
                                    return (
                                      <div key={label} style={{
                                        background: fail ? "#FEE2E2" : "var(--green-bg)",
                                        border: `1px solid ${fail ? "#FCA5A5" : "#86EFAC"}`,
                                        borderRadius:8, padding:"6px 4px", textAlign:"center"
                                      }}>
                                        <div style={{fontSize:10,fontWeight:700,color:"var(--text-muted)",textTransform:"uppercase"}}>{label}</div>
                                        <div style={{fontSize:16,fontWeight:800,color: fail ? "var(--red)" : "var(--green)"}}>{val?.toFixed(1) ?? "—"}</div>
                                        {fail && <div style={{fontSize:9,color:"var(--red)",marginTop:1}}>⚠ &lt;{floor}</div>}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                              <div className="sdp-item" style={{gridColumn:"1 / -1"}}>
                                <span className="sdp-label">Action Plan</span>
                                <span className="sdp-value"><ActionChip band={c.band} /></span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              }
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
