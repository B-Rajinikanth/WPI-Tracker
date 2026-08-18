import { useState, useMemo, useEffect } from "react";
import * as XLSX from "xlsx";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  PointElement, LineElement, ArcElement, Tooltip, Legend, Filler,
} from "chart.js";
import { useDB } from "../context/DBContext";
import KPICard from "../components/ui/KPICard";
import { BandBadge, DeptChip } from "../components/ui/BandBadge";
import SortableTh from "../components/ui/SortableTh";
import { num, pct, round1, applySortState, sortRows } from "../utils/wpi";

ChartJS.register(
  CategoryScale, LinearScale, BarElement,
  PointElement, LineElement, ArcElement, Tooltip, Legend, Filler
);

const CO = { responsive: true, maintainAspectRatio: false };
const shortW = w => w ? w.replace(/\s*\(.*\)$/, "").trim() : w;

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
  const [q, setQ]           = useState("");
  const [open, setOpen]     = useState(false);
  const filtered = useMemo(() => {
    const src = mode==="present" ? list.participated : list.absent;
    const sorted = sortRows(src, sort.col, sort.dir, CONTEST_VAL_FN);
    return sorted.filter(({s}) => !q || s.name.toLowerCase().includes(q) || s.urn.toLowerCase().includes(q));
  }, [list, mode, sort, q]);

  const total  = list.participated.length + list.absent.length;
  const barPct = total ? pct(list.participated.length, total) : 0;

  return (
    <div>
      {/* Clickable header */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          background:color, color:"#fff",
          borderRadius: open ? "var(--radius) var(--radius) 0 0" : "var(--radius)",
          padding:"14px 20px", display:"flex", alignItems:"center",
          justifyContent:"space-between", cursor:"pointer", userSelect:"none",
        }}
      >
        <div>
          <div style={{fontSize:14,fontWeight:700}}>{title}</div>
          <div style={{fontSize:11,opacity:.8,marginTop:2}}>{subtitle}</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:26,fontWeight:800}}>{list.participated.length}</div>
            <div style={{fontSize:11,opacity:.8}}>participated</div>
          </div>
          <span style={{fontSize:18,opacity:.8,transition:"transform .25s",display:"inline-block",transform:open?"rotate(180deg)":"rotate(0deg)"}}>▾</span>
        </div>
      </div>

      {open && (
        <>
          {/* Progress bar */}
          <div style={{background:"var(--card-bg,#fff)",padding:"12px 20px",borderLeft:"1px solid var(--border)",borderRight:"1px solid var(--border)",display:"flex",alignItems:"center",gap:10}}>
            <div style={{fontSize:12,color:"var(--green)",fontWeight:600,width:90}}>{list.participated.length} participated</div>
            <div style={{flex:1,height:10,borderRadius:5,background:"#EDF2F7",overflow:"hidden"}}>
              <div style={{height:"100%",background:"var(--green)",width:barPct+"%",transition:"width .4s",borderRadius:5}}></div>
            </div>
            <div style={{fontSize:12,color:"var(--red)",fontWeight:600,width:70,textAlign:"right"}}>{list.absent.length} absent</div>
          </div>
          {/* Toggle + Search + Download */}
          <div style={{background:"var(--card-bg,#fff)",padding:"10px 16px",borderLeft:"1px solid var(--border)",borderRight:"1px solid var(--border)",display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <div className="contest-toggle">
              <button className={`contest-toggle-btn${mode==="present"?" active-present":""}`} onClick={e=>{e.stopPropagation();onToggle("present");}}>✅ Present</button>
              <button className={`contest-toggle-btn${mode==="absent"?" active-absent":""}`}   onClick={e=>{e.stopPropagation();onToggle("absent");}}>❌ Absent</button>
            </div>
            <div className="search-wrap" style={{flex:1,minWidth:120}}>
              <input className="search-input" style={{width:"100%"}} placeholder="Search student…" value={q} onChange={e=>setQ(e.target.value)} onClick={e=>e.stopPropagation()} />
            </div>
            <button className="btn btn-ghost btn-sm" style={{whiteSpace:"nowrap"}} onClick={e=>{e.stopPropagation();downloadContestList(list.participated,title,"Participated");}}>⬇ Present List</button>
            <button className="btn btn-ghost btn-sm" style={{whiteSpace:"nowrap"}} onClick={e=>{e.stopPropagation();downloadContestList(list.absent,title,"Absent");}}>⬇ Absent List</button>
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
        </>
      )}
    </div>
  );
}

export default function Contest() {
  const { students, records, weeks, activeWeek } = useDB();
  const [selWeek, setSelWeek] = useState(activeWeek);
  const [selDept, setSelDept] = useState("");
  useEffect(() => { setSelWeek(activeWeek); }, [activeWeek]);
  const [mode1, setMode1] = useState("absent");
  const [mode2, setMode2] = useState("absent");
  const [sort1, setSort1] = useState({col:"name",dir:"asc"});
  const [sort2, setSort2] = useState({col:"name",dir:"asc"});
  const [openBDBoth,    setOpenBDBoth]    = useState(false);
  const [openBDCC,      setOpenBDCC]      = useState(false);
  const [openBDUni,     setOpenBDUni]     = useState(false);
  const [openBDNeither, setOpenBDNeither] = useState(false);
  const [sortBDBoth,    setSortBDBoth]    = useState({col:"name",dir:"asc"});
  const [sortBDCC,      setSortBDCC]      = useState({col:"name",dir:"asc"});
  const [sortBDUni,     setSortBDUni]     = useState({col:"name",dir:"asc"});
  const [sortBDNeither, setSortBDNeither] = useState({col:"name",dir:"asc"});

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

  // ── Chart 2: Breakdown donut (Both / CC Only / Uni Only / Neither) ──
  const breakdownCounts = useMemo(() => {
    let both=0, ccOnly=0, uniOnly=0, neither=0;
    const bothList=[], ccOnlyList=[], uniOnlyList=[], neitherList=[];
    filteredStudents.forEach(s => {
      const rec = recByStudent[s.id];
      if (!rec) return;
      const cc  = num(rec.contestParticipation) === 1;
      const uni = num(rec.proctoredContest)      === 1;
      if (cc && uni)  { both++;    bothList.push({s,rec}); }
      else if (cc)    { ccOnly++;  ccOnlyList.push({s,rec}); }
      else if (uni)   { uniOnly++; uniOnlyList.push({s,rec}); }
      else            { neither++; neitherList.push({s,rec}); }
    });
    return { both, ccOnly, uniOnly, neither, bothList, ccOnlyList, uniOnlyList, neitherList };
  }, [filteredStudents, recByStudent]);

  // ── Chart 3: Week-over-week participation trend ──
  const weekTrend = useMemo(() => {
    return weeks.map(w => {
      const wRecs = records.filter(r => r.week === w);
      if (!wRecs.length) return { w, cc: null, uni: null };
      const cc  = round1(pct(wRecs.filter(r => num(r.contestParticipation) === 1).length, wRecs.length));
      const uni = round1(pct(wRecs.filter(r => num(r.proctoredContest)      === 1).length, wRecs.length));
      return { w, cc, uni };
    });
  }, [weeks, records]);

  // ── Chart 4: Dept-wise participation % (selected week) ──
  const deptParticipation = useMemo(() => {
    return depts.map(dept => {
      const deptStudents = filteredStudents.filter(s => s.dept === dept);
      const withRec = deptStudents.filter(s => recByStudent[s.id]);
      if (!withRec.length) return { dept, cc: 0, uni: 0 };
      const cc  = round1(pct(withRec.filter(s => num(recByStudent[s.id]?.contestParticipation) === 1).length, withRec.length));
      const uni = round1(pct(withRec.filter(s => num(recByStudent[s.id]?.proctoredContest)      === 1).length, withRec.length));
      return { dept, cc, uni };
    }).filter(d => d.cc > 0 || d.uni > 0);
  }, [depts, filteredStudents, recByStudent]);

  // ── Chart 5: Avg WPI by participation group ──
  const wpiByGroup = useMemo(() => {
    const groups = { both: [], ccOnly: [], uniOnly: [], neither: [] };
    filteredStudents.forEach(s => {
      const rec = recByStudent[s.id];
      if (!rec || rec.computed?.WPI == null) return;
      const cc  = num(rec.contestParticipation) === 1;
      const uni = num(rec.proctoredContest)      === 1;
      const wpi = rec.computed.WPI;
      if (cc && uni)  groups.both.push(wpi);
      else if (cc)    groups.ccOnly.push(wpi);
      else if (uni)   groups.uniOnly.push(wpi);
      else            groups.neither.push(wpi);
    });
    const avg = arr => arr.length ? round1(arr.reduce((a,b) => a+b, 0) / arr.length) : 0;
    return {
      both:    avg(groups.both),
      ccOnly:  avg(groups.ccOnly),
      uniOnly: avg(groups.uniOnly),
      neither: avg(groups.neither),
    };
  }, [filteredStudents, recByStudent]);

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

      {/* KPIs */}
      <div className="g2 mb20" style={{marginBottom:12}}>
        <KPICard label="Total Students"      value={filteredStudents.length} sub="in selection" cls="kpi-blue" />
        <KPICard label="Neither ❌"           value={breakdownCounts.neither} sub={`${pct(breakdownCounts.neither,withData)}% missed both`} cls="kpi-red" />
      </div>
      <div className="g2 mb20" style={{marginBottom:12}}>
        <KPICard label="CC Global Contest ✅" value={p1.length}  sub={`${pct(p1.length,withData)}% participated`} cls="kpi-green" />
        <KPICard label="CC Global Contest ❌" value={np1.length} sub={`${pct(np1.length,withData)}% absent`}      cls="kpi-red" />
      </div>
      <div className="g2 mb20">
        <KPICard label="University Contest ✅"  value={p2.length}  sub={`${pct(p2.length,withData)}% participated`} cls="kpi-green" />
        <KPICard label="University Contest ❌"  value={np2.length} sub={`${pct(np2.length,withData)}% absent`}      cls="kpi-red" />
      </div>

      {/* ── Charts row 1: Breakdown donut + Week trend ── */}
      <div className="g2 mb20">
        <div className="card">
          <div className="card-header">Participation Breakdown</div>
          <div style={{fontSize:11,color:"var(--text-muted)",padding:"0 16px 8px"}}>
            {selWeek || "All weeks"} · {withData} students with data
          </div>
          <div className="chart-box" style={{height:220}}>
            <Doughnut
              data={{
                labels: ["Both Contests", "CC Global Only", "University Only", "Neither"],
                datasets: [{
                  data: [breakdownCounts.both, breakdownCounts.ccOnly, breakdownCounts.uniOnly, breakdownCounts.neither],
                  backgroundColor: ["#22C55E","#6366F1","#F59E0B","#EF4444"],
                  borderWidth: 0,
                }],
              }}
              options={{ ...CO, plugins: { legend: { position:"bottom", labels:{ font:{size:11}, boxWidth:12 } } } }}
            />
          </div>
          <div style={{display:"flex",gap:8,padding:"12px 16px",flexWrap:"wrap"}}>
            {[
              {label:"Both ✅✅", val:breakdownCounts.both,    color:"#22C55E"},
              {label:"CC Only",   val:breakdownCounts.ccOnly,  color:"#6366F1"},
              {label:"Uni Only",  val:breakdownCounts.uniOnly, color:"#F59E0B"},
              {label:"Neither ❌",val:breakdownCounts.neither, color:"#EF4444"},
            ].map(({label,val,color}) => (
              <div key={label} style={{flex:"1 1 70px",background:"var(--bg-secondary,#F4F6F9)",borderRadius:8,padding:"6px 10px",textAlign:"center",borderTop:`3px solid ${color}`}}>
                <div style={{fontSize:18,fontWeight:800,color}}>{val}</div>
                <div style={{fontSize:10,color:"var(--text-muted)",marginTop:2}}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header">Week-over-Week Participation Trend</div>
          <div style={{fontSize:11,color:"var(--text-muted)",padding:"0 16px 8px"}}>% of students who participated each week</div>
          <div className="chart-box" style={{height:260}}>
            {weekTrend.length < 2
              ? <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:"var(--text-muted)",fontSize:13}}>Need at least 2 weeks of data</div>
              : <Line
                  data={{
                    labels: weekTrend.map(d => shortW(d.w)),
                    datasets: [
                      {
                        label: "CC Global %",
                        data: weekTrend.map(d => d.cc),
                        borderColor: "#6366F1", backgroundColor: "rgba(99,102,241,.1)",
                        fill: true, tension: 0.4, pointRadius: 4,
                      },
                      {
                        label: "University %",
                        data: weekTrend.map(d => d.uni),
                        borderColor: "#F59E0B", backgroundColor: "rgba(245,158,11,.08)",
                        fill: true, tension: 0.4, pointRadius: 4,
                      },
                    ],
                  }}
                  options={{
                    ...CO,
                    scales: {
                      y: { min:0, max:100, ticks:{ callback: v => v+"%" } },
                      x: { ticks:{ font:{size:10}, maxRotation:30 } },
                    },
                    plugins: { legend:{ position:"bottom", labels:{ font:{size:11}, boxWidth:12 } } },
                  }}
                />
            }
          </div>
        </div>
      </div>

      {/* ── Charts row 2: Dept bar + WPI correlation ── */}
      <div className="g2 mb20">
        <div className="card">
          <div className="card-header">Department-wise Participation Rate</div>
          <div style={{fontSize:11,color:"var(--text-muted)",padding:"0 16px 8px"}}>{selWeek || "All weeks"} · % participated per dept</div>
          <div className="chart-box" style={{height:260}}>
            {!deptParticipation.length
              ? <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:"var(--text-muted)",fontSize:13}}>No data for selected filters</div>
              : <Bar
                  data={{
                    labels: deptParticipation.map(d => d.dept),
                    datasets: [
                      { label:"CC Global %",   data: deptParticipation.map(d=>d.cc),  backgroundColor:"#6366F1", borderRadius:4 },
                      { label:"University %",  data: deptParticipation.map(d=>d.uni), backgroundColor:"#F59E0B", borderRadius:4 },
                    ],
                  }}
                  options={{
                    ...CO,
                    scales: {
                      y: { min:0, max:100, ticks:{ callback: v => v+"%" } },
                      x: { grid:{ display:false }, ticks:{ font:{size:10} } },
                    },
                    plugins: { legend:{ position:"bottom", labels:{ font:{size:11}, boxWidth:12 } } },
                  }}
                />
            }
          </div>
        </div>

        <div className="card">
          <div className="card-header">Contest Participation vs Avg WPI</div>
          <div style={{fontSize:11,color:"var(--text-muted)",padding:"0 16px 8px"}}>Does participating in contests correlate with higher WPI?</div>
          <div className="chart-box" style={{height:220}}>
            <Bar
              data={{
                labels: ["Both Contests", "CC Global Only", "University Only", "Neither"],
                datasets: [{
                  label: "Avg WPI",
                  data: [wpiByGroup.both, wpiByGroup.ccOnly, wpiByGroup.uniOnly, wpiByGroup.neither],
                  backgroundColor: [
                    "#22C55E", "#6366F1", "#F59E0B", "#EF4444",
                  ],
                  borderRadius: 5,
                }],
              }}
              options={{
                ...CO,
                scales: {
                  y: { min:0, max:100, grid:{ color:"rgba(0,0,0,.05)" } },
                  x: { grid:{ display:false }, ticks:{ font:{size:11} } },
                },
                plugins: { legend:{ display:false } },
              }}
            />
          </div>
          <div style={{display:"flex",gap:8,padding:"12px 16px",flexWrap:"wrap"}}>
            {[
              {label:"Both",    val:wpiByGroup.both,    color:"#22C55E"},
              {label:"CC Only", val:wpiByGroup.ccOnly,  color:"#6366F1"},
              {label:"Uni Only",val:wpiByGroup.uniOnly, color:"#F59E0B"},
              {label:"Neither", val:wpiByGroup.neither, color:"#EF4444"},
            ].map(({label,val,color}) => (
              <div key={label} style={{flex:"1 1 60px",background:"var(--bg-secondary,#F4F6F9)",borderRadius:8,padding:"6px 10px",textAlign:"center",borderTop:`3px solid ${color}`}}>
                <div style={{fontSize:16,fontWeight:800,color}}>{val || "—"}</div>
                <div style={{fontSize:10,color:"var(--text-muted)",marginTop:2}}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Two contest panels — stack on medium/small screens */}
      <div className="contest-panels mb20">
        <ContestPanel
          title="🖥️ CC Global Contest" subtitle="CodeChef Starters Contest - Wednesday"
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

      {/* ── Participation Breakdown Lists ── */}
      {[
        { key:"both",    label:"Both ✅✅",  color:"#22C55E", list:breakdownCounts.bothList,    open:openBDBoth,    setOpen:setOpenBDBoth,    sort:sortBDBoth,    setSort:setSortBDBoth },
        { key:"ccOnly",  label:"CC Only",   color:"#6366F1", list:breakdownCounts.ccOnlyList,  open:openBDCC,      setOpen:setOpenBDCC,      sort:sortBDCC,      setSort:setSortBDCC },
        { key:"uniOnly", label:"Uni Only",  color:"#F59E0B", list:breakdownCounts.uniOnlyList, open:openBDUni,     setOpen:setOpenBDUni,     sort:sortBDUni,     setSort:setSortBDUni },
        { key:"neither", label:"Neither ❌", color:"#EF4444", list:breakdownCounts.neitherList, open:openBDNeither, setOpen:setOpenBDNeither, sort:sortBDNeither, setSort:setSortBDNeither },
      ].map(({ key, label, color, list, open, setOpen, sort, setSort }) => {
        const sorted = sortRows(list||[], sort.col, sort.dir, CONTEST_VAL_FN);
        return (
          <div key={key} className="card" style={{padding:0,overflow:"hidden",marginBottom:12,borderTop:`3px solid ${color}`}}>
            <div
              onClick={() => setOpen(o => !o)}
              className="card-header"
              style={{display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",userSelect:"none",padding:"14px 20px"}}
            >
              <span style={{fontWeight:700}}>
                {label}
                <span style={{background:"var(--bg-secondary,#F4F6F9)",color,padding:"2px 8px",borderRadius:10,fontSize:12,fontWeight:700,marginLeft:8,border:`1px solid ${color}`}}>
                  {(list||[]).length}
                </span>
              </span>
              <span style={{fontSize:16,transition:"transform .25s",display:"inline-block",transform:open?"rotate(180deg)":"rotate(0deg)",color:"var(--text-muted)"}}>▾</span>
            </div>
            {open && (
              !(list||[]).length
                ? <div style={{padding:"12px 20px",color:"var(--text-muted)",fontSize:13}}>No students in this group.</div>
                : <div className="table-container"><div className="table-scroll"><table>
                    <thead><tr>
                      <th>#</th>
                      <SortableTh label="URN No."    col="urn"  sort={sort} onSort={col=>setSort(s=>applySortState(s,col))} />
                      <SortableTh label="Name"       col="name" sort={sort} onSort={col=>setSort(s=>applySortState(s,col))} />
                      <SortableTh label="Dept"       col="dept" sort={sort} onSort={col=>setSort(s=>applySortState(s,col))} />
                      <SortableTh label="WPI"        col="wpi"  sort={sort} onSort={col=>setSort(s=>applySortState(s,col))} />
                      <th>Band</th>
                      <SortableTh label="Attendance" col="att"  sort={sort} onSort={col=>setSort(s=>applySortState(s,col))} />
                    </tr></thead>
                    <tbody>
                      {sorted.map(({s,rec},i)=>(
                        <tr key={s.id}>
                          <td style={{color:"var(--text-muted)",fontSize:12}}>{i+1}</td>
                          <td><strong>{s.urn}</strong></td>
                          <td>{s.name}</td>
                          <td><DeptChip dept={s.dept}/></td>
                          <td className="score-val">{rec?.computed?.WPI?.toFixed(1)||"—"}</td>
                          <td><BandBadge band={rec?.computed?.band}/></td>
                          <td style={{color:Number(rec?.attendance)<75?"var(--red)":"inherit",fontWeight:Number(rec?.attendance)<75?700:400}}>
                            {rec?.attendance!=null?rec.attendance+"%":"—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div></div>
            )}
          </div>
        );
      })}
    </section>
  );
}
