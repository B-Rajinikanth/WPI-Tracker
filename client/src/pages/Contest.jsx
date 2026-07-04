import { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { Bar } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from "chart.js";
import { useDB } from "../context/DBContext";
import KPICard from "../components/ui/KPICard";
import { BandBadge, DeptChip } from "../components/ui/BandBadge";
import SortableTh from "../components/ui/SortableTh";
import { num, pct, applySortState, sortRows } from "../utils/wpi";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const CONTEST_VAL_FN = (item, col) => {
  if (col === "urn")  return item.s.urn;
  if (col === "name") return item.s.name;
  if (col === "dept") return item.s.dept;
  if (col === "wpi")  return item.rec?.computed?.WPI ?? -1;
  if (col === "band") return item.rec?.computed?.band ?? "";
  if (col === "att")  return Number(item.rec?.attendance) || 0;
  return "";
};

function downloadContestList(data, title, status) {
  const rows = [["#","URN No.","Name","Department","WPI","Band","Attendance %","Status"]];
  data.forEach(({ s, rec }, i) => {
    rows.push([
      i + 1, s.urn, s.name, s.dept,
      rec?.computed?.WPI?.toFixed(1) ?? "—",
      rec?.computed?.band ?? "—",
      rec?.attendance != null ? rec.attendance + "%" : "—",
      status,
    ]);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, status);
  XLSX.writeFile(wb, `${title.replace(/[^a-z0-9]/gi,"_")}_${status}.xlsx`);
}

function ContestPanel({ title, subtitle, color, list, mode, onToggle, sort, onSort }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const src = mode==="present" ? list.participated : list.absent;
    const sorted = sortRows(src, sort.col, sort.dir, CONTEST_VAL_FN);
    return sorted.filter(({s}) => !q || s.name.toLowerCase().includes(q) || s.urn.toLowerCase().includes(q));
  }, [list, mode, sort, q]);

  const total = list.participated.length + list.absent.length;
  const barPct = total ? pct(list.participated.length, total) : 0;

  return (
    <div>
      <div style={{background:color,color:"#fff",borderRadius:"var(--radius) var(--radius) 0 0",padding:"14px 20px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div>
          <div style={{fontSize:14,fontWeight:700}}>{title}</div>
          <div style={{fontSize:11,opacity:.8,marginTop:2}}>{subtitle}</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:26,fontWeight:800}}>{mode==="present"?list.participated.length:list.absent.length}</div>
          <div style={{fontSize:11,opacity:.8}}>{mode==="present"?"Participated":"Not Participated"}</div>
        </div>
      </div>
      {/* Progress bar */}
      <div style={{background:"#fff",padding:"12px 20px",borderLeft:"1px solid var(--border)",borderRight:"1px solid var(--border)",display:"flex",alignItems:"center",gap:10}}>
        <div style={{fontSize:12,color:"var(--green)",fontWeight:600,width:90}}>{list.participated.length} participated</div>
        <div style={{flex:1,height:10,borderRadius:5,background:"#EDF2F7",overflow:"hidden"}}>
          <div style={{height:"100%",background:"var(--green)",width:barPct+"%",transition:"width .4s",borderRadius:5}}></div>
        </div>
        <div style={{fontSize:12,color:"var(--red)",fontWeight:600,width:70,textAlign:"right"}}>{list.absent.length} absent</div>
      </div>
      {/* Toggle + Search + Download */}
      <div style={{background:"#fff",padding:"10px 16px",borderLeft:"1px solid var(--border)",borderRight:"1px solid var(--border)",display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        <div className="contest-toggle">
          <button className={`contest-toggle-btn${mode==="present"?" active-present":""}`} onClick={()=>onToggle("present")}>✅ Present</button>
          <button className={`contest-toggle-btn${mode==="absent"?" active-absent":""}`}  onClick={()=>onToggle("absent")}>❌ Absent</button>
        </div>
        <div className="search-wrap" style={{flex:1,minWidth:120}}>
          <input className="search-input" style={{width:"100%"}} placeholder="Search student…" value={q} onChange={e=>setQ(e.target.value)} />
        </div>
        <button className="btn btn-ghost btn-sm" style={{whiteSpace:"nowrap"}}
          onClick={() => downloadContestList(list.participated, title, "Participated")}>
          ⬇ Present List
        </button>
        <button className="btn btn-ghost btn-sm" style={{whiteSpace:"nowrap"}}
          onClick={() => downloadContestList(list.absent, title, "Absent")}>
          ⬇ Absent List
        </button>
      </div>
      {/* Table */}
      <div className="table-container" style={{borderRadius:"0 0 var(--radius) var(--radius)"}}>
        <table>
          <thead><tr>
            <th>#</th>
            <SortableTh label="URN No."    col="urn"  sort={sort} onSort={onSort} />
            <SortableTh label="Name"       col="name" sort={sort} onSort={onSort} />
            <SortableTh label="Dept"       col="dept" sort={sort} onSort={onSort} />
            <SortableTh label="WPI"        col="wpi"  sort={sort} onSort={onSort} />
            <th>Band</th>
            <SortableTh label="Attendance" col="att"  sort={sort} onSort={onSort} />
          </tr></thead>
          <tbody>
            {!filtered.length
              ? <tr><td colSpan={7} style={{textAlign:"center",padding:24,color:"var(--text-muted)"}}>
                  {(mode==="present"?list.participated:list.absent).length===0 ? "All students participated! ✅" : `No results for "${q}"`}
                </td></tr>
              : filtered.map(({s,rec},i) => (
                <tr key={s.id}>
                  <td>{i+1}</td>
                  <td><strong>{s.urn}</strong></td>
                  <td>{s.name}</td>
                  <td><DeptChip dept={s.dept}/></td>
                  <td className="score-val">{rec?.computed?.WPI?.toFixed(1)||"—"}</td>
                  <td><BandBadge band={rec?.computed?.band}/></td>
                  <td style={{color:Number(rec?.attendance)<75?"var(--red)":"inherit",fontWeight:Number(rec?.attendance)<75?700:400}}>
                    {rec?.attendance!=null?rec.attendance+"%":"—"}
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Contest() {
  const { students, records, weeks, activeWeek } = useDB();
  const [selWeek, setSelWeek] = useState(activeWeek);
  const [selDept, setSelDept] = useState("");
  const [mode1, setMode1] = useState("absent");
  const [mode2, setMode2] = useState("absent");
  const [sort1, setSort1] = useState({col:"name",dir:"asc"});
  const [sort2, setSort2] = useState({col:"name",dir:"asc"});
  const [sortBoth, setSortBoth] = useState({col:"name",dir:"asc"});

  const depts = useMemo(()=>[...new Set(students.map(s=>s.dept))].sort(),[students]);

  const weekRecs = useMemo(()=>records.filter(r=>!selWeek||r.week===selWeek),[records,selWeek]);
  const recByStudent = useMemo(()=>{
    const m={};
    weekRecs.forEach(r=>{if(!m[r.studentId]||r.week>m[r.studentId].week)m[r.studentId]=r;});
    return m;
  },[weekRecs]);

  const filteredStudents = useMemo(()=>students.filter(s=>!selDept||s.dept===selDept),[students,selDept]);

  const { p1, np1, p2, np2, noData } = useMemo(()=>{
    const p1=[],np1=[],p2=[],np2=[],noData=[];
    filteredStudents.forEach(s=>{
      const rec=recByStudent[s.id];
      if(!rec){noData.push(s);return;}
      if(num(rec.contestParticipation)===1)p1.push({s,rec}); else np1.push({s,rec});
      if(num(rec.proctoredContest)===1)p2.push({s,rec}); else np2.push({s,rec});
    });
    return {p1,np1,p2,np2,noData};
  },[filteredStudents,recByStudent]);

  const withData = filteredStudents.length - noData.length;

  const bothAbsent = useMemo(()=>
    sortRows(
      filteredStudents.filter(s=>{const rec=recByStudent[s.id];return rec&&num(rec.contestParticipation)!==1&&num(rec.proctoredContest)!==1;}).map(s=>({s,rec:recByStudent[s.id]})),
      sortBoth.col, sortBoth.dir, CONTEST_VAL_FN
    ),[filteredStudents,recByStudent,sortBoth]);

  return (
    <section className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">Contest Participation Tracker</div>
          <div className="page-subtitle">Week: {selWeek||"All Weeks"}</div>
        </div>
        <div className="page-actions">
          <select className="form-control" style={{width:150}} value={selWeek} onChange={e=>setSelWeek(e.target.value)}>
            <option value="">All Weeks</option>
            {[...weeks].reverse().map(w=><option key={w} value={w}>{w}</option>)}
          </select>
          <select className="form-control" style={{width:160}} value={selDept} onChange={e=>setSelDept(e.target.value)}>
            <option value="">All Departments</option>
            {depts.map(d=><option key={d}>{d}</option>)}
          </select>
        </div>
      </div>

      {/* KPIs - 3 rows × 2 */}
      <div className="g2 mb20" style={{marginBottom:12}}>
        <KPICard label="Total Students"      value={filteredStudents.length} sub="in selection"            cls="kpi-blue" />
        <KPICard label="🚫 Missed Both"      value={bothAbsent.length}       sub={`${pct(bothAbsent.length,withData)}% missed both`} cls="kpi-red" />
      </div>
      <div className="g2 mb20" style={{marginBottom:12}}>
        <KPICard label="CC Global Contest ✅" value={p1.length}  sub={`${pct(p1.length,withData)}% participated`} cls="kpi-green" />
        <KPICard label="CC Global Contest ❌" value={np1.length} sub={`${pct(np1.length,withData)}% absent`}      cls="kpi-red" />
      </div>
      <div className="g2 mb20">
        <KPICard label="University Contest ✅"  value={p2.length}  sub={`${pct(p2.length,withData)}% participated`} cls="kpi-green" />
        <KPICard label="University Contest ❌"  value={np2.length} sub={`${pct(np2.length,withData)}% absent`}      cls="kpi-red" />
      </div>

      {/* Two contest panels — stack on medium/small screens */}
      <div className="contest-panels mb20">
        <ContestPanel
          title="🖥️ CC Global Contest" subtitle="CodeChef + Pod.AI — Thursday"
          color="linear-gradient(135deg,#0A3D0A,#1B5E20,#2E7D32)"
          list={{participated:p1,absent:np1}} mode={mode1} onToggle={m=>setMode1(m)}
          sort={sort1} onSort={col=>setSort1(s=>applySortState(s,col))}
        />
        <ContestPanel
          title="🔒 University Contest" subtitle="University Assessment — Any Day"
          color="linear-gradient(135deg,#7F0000,#C62828,#D32F2F)"
          list={{participated:p2,absent:np2}} mode={mode2} onToggle={m=>setMode2(m)}
          sort={sort2} onSort={col=>setSort2(s=>applySortState(s,col))}
        />
      </div>

      {/* Both absent */}
      <div className="card">
        <div className="card-header">
          🚫 Missed Both Contests
          <span style={{background:"var(--red-bg)",color:"var(--red)",padding:"2px 8px",borderRadius:10,fontSize:12,fontWeight:700,marginLeft:8}}>{bothAbsent.length}</span>
        </div>
        {!bothAbsent.length
          ? <div className="alert alert-green"><span className="alert-icon">✅</span><div>No students missed both contests this week.</div></div>
          : <div className="table-container"><div className="table-scroll"><table>
              <thead><tr>
                <th>#</th>
                <SortableTh label="URN No."    col="urn"  sort={sortBoth} onSort={col=>setSortBoth(s=>applySortState(s,col))} />
                <SortableTh label="Name"       col="name" sort={sortBoth} onSort={col=>setSortBoth(s=>applySortState(s,col))} />
                <SortableTh label="Dept"       col="dept" sort={sortBoth} onSort={col=>setSortBoth(s=>applySortState(s,col))} />
                <SortableTh label="WPI"        col="wpi"  sort={sortBoth} onSort={col=>setSortBoth(s=>applySortState(s,col))} />
                <th>Band</th>
                <SortableTh label="Attendance" col="att"  sort={sortBoth} onSort={col=>setSortBoth(s=>applySortState(s,col))} />
                <th>Action</th>
              </tr></thead>
              <tbody>
                {bothAbsent.map(({s,rec},i)=>(
                  <tr key={s.id}>
                    <td>{i+1}</td><td><strong>{s.urn}</strong></td><td>{s.name}</td>
                    <td><DeptChip dept={s.dept}/></td>
                    <td className="score-val">{rec?.computed?.WPI?.toFixed(1)||"—"}</td>
                    <td><BandBadge band={rec?.computed?.band}/></td>
                    <td>{rec?.attendance!=null?rec.attendance+"%":"—"}</td>
                    <td><span className="chip chip-action">Immediate Follow-up</span></td>
                  </tr>
                ))}
              </tbody>
            </table></div></div>
        }
      </div>
    </section>
  );
}
