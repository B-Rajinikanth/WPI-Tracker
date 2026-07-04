import { useState, useMemo, Fragment } from "react";
import * as XLSX from "xlsx";
import { useDB } from "../context/DBContext";
import { BandBadge, TrendBadge, DeptChip } from "../components/ui/BandBadge";
import SortableTh from "../components/ui/SortableTh";
import { DEPTS, uid, applySortState, sortRows, calcCPI } from "../utils/wpi";

const TIER_COLORS = { ready:"#1B5E20", near:"#33691E", progress:"#BF360C", noready:"#7F0000", gate:"#424242" };
const TIER_LABELS = { ready:"✅ Ready", near:"🟡 Near", progress:"🟠 Progress", noready:"🔴 Not Ready", gate:"🚧 Gate" };

export default function Students() {
  const { students, records, weeks, addStudent, updateStudent, deleteStudent, bulkAddStudents, getTrend, getLatestRecord } = useDB();

  const [q, setQ]           = useState("");
  const [dept, setDept]     = useState("");
  const [sort, setSort]     = useState({ col: "name", dir: "asc" });
  const [modal, setModal]   = useState(null);
  const [form, setForm]     = useState({ urn:"", name:"", dept:"CSE", email:"" });
  const [expandedId, setExpandedId] = useState(null);

  const depts = useMemo(() => [...new Set(students.map(s => s.dept))].sort(), [students]);

  const list = useMemo(() => {
    const filtered = students.filter(s => {
      const ql = q.toLowerCase();
      const m = !q || s.name.toLowerCase().includes(ql) || s.urn.toLowerCase().includes(ql) || s.dept.toLowerCase().includes(ql);
      return m && (!dept || s.dept === dept);
    });
    const aug = filtered.map(s => {
      const latest = getLatestRecord(s.id);
      return { s, latest, _wpi: latest?.computed?.WPI ?? -1, _band: latest?.computed?.band ?? "" };
    });
    return sortRows(aug, sort.col, sort.dir, (item, col) => {
      if (col === "wpi")  return item._wpi;
      if (col === "band") return item._band;
      return item.s[col] ?? "";
    });
  }, [students, q, dept, sort, getLatestRecord]);

  const onSort = col => setSort(s => applySortState(s, col));
  const toggleExpand = id => setExpandedId(prev => prev === id ? null : id);

  const openAdd  = () => { setForm({ urn:"", name:"", dept:"CSE", email:"" }); setModal({ mode:"add" }); };
  const openEdit = s  => { setForm({ urn:s.urn, name:s.name, dept:s.dept, email:s.email||"" }); setModal({ mode:"edit", id:s.id }); };
  const closeModal = () => setModal(null);

  const handleSubmit = async e => {
    e.preventDefault();
    if (modal.mode === "add") await addStudent({ id: uid(), ...form });
    else await updateStudent(modal.id, form);
    closeModal();
  };

  const handleDelete = (s) => {
    if (confirm(`Delete "${s.name}" and all their records? This cannot be undone.`))
      deleteStudent(s.id, s.name);
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["URN_No","Name","Department","Email"],
      ...students.map(s => [s.urn, s.name, s.dept, s.email||""])
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Students");
    XLSX.writeFile(wb, "Student_Roster_Template.xlsx");
  };

  const handleExcelImport = e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const wb  = XLSX.read(ev.target.result, { type:"array" });
      const ws  = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { header:1, defval:"" });
      const [hdr, ...rows] = raw;
      const ci = {}; hdr.forEach((h,i) => {
        const n = String(h).toLowerCase().replace(/[\s_]/g,"");
        if (n.includes("urn")) ci.urn=i;
        else if (n.includes("name")) ci.name=i;
        else if (n.includes("dept")) ci.dept=i;
        else if (n.includes("email")) ci.email=i;
      });
      const toImport = rows.filter(r => r[ci.urn]).map(r => ({
        id: uid(), urn: String(r[ci.urn]).trim(),
        name: String(r[ci.name]||"").trim(),
        dept: String(r[ci.dept]||"CSE").trim(),
        email: String(r[ci.email]||"").trim(),
      })).filter(s => s.name);
      if (toImport.length) bulkAddStudents(toImport);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  return (
    <section className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">Student Roster</div>
          <div className="page-subtitle">Manage the R24 batch student list</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm" onClick={downloadTemplate}>⬇ Download Template</button>
          <label className="btn btn-outline btn-sm" style={{cursor:"pointer"}}>
            📥 Import Students from Excel
            <input type="file" accept=".xlsx,.xls" onChange={handleExcelImport} style={{display:"none"}} />
          </label>
          <button className="btn btn-primary btn-sm" onClick={openAdd}>+ Add Student</button>
        </div>
      </div>

      {/* Filters */}
      <div className="roster-filters">
        <div className="search-wrap" style={{flex:1,minWidth:200}}>
          <input className="search-input" placeholder="Search name, URN, dept…" value={q} onChange={e=>setQ(e.target.value)} />
        </div>
        <select className="form-control roster-dept-sel" value={dept} onChange={e=>setDept(e.target.value)}>
          <option value="">All Departments</option>
          {depts.map(d => <option key={d}>{d}</option>)}
        </select>
        <span className="roster-count" style={{fontSize:13,color:"var(--text-muted)",whiteSpace:"nowrap"}}>
          {list.length} student{list.length!==1?"s":""}
        </span>
      </div>

      {/* Table */}
      <div className="table-container">
        <div className="table-scroll">
          <table className="table-fit" style={{minWidth:"unset"}}>
            <thead><tr>
              <th style={{width:28}}>#</th>
              <SortableTh label="Name"       col="name"  sort={sort} onSort={onSort} />
              <SortableTh label="URN No."    col="urn"   sort={sort} onSort={onSort} className="col-hide-sm" />
              <SortableTh label="Dept"       col="dept"  sort={sort} onSort={onSort} className="col-hide-sm" />
              <SortableTh label="Email"      col="email" sort={sort} onSort={onSort} className="col-hide-md" />
              <SortableTh label="WPI"        col="wpi"   sort={sort} onSort={onSort} />
              <SortableTh label="Band"       col="band"  sort={sort} onSort={onSort} />
              <th className="col-hide-md">Trend</th>
              <th className="col-hide-md">Placement</th>
              <th className="col-hide-sm">Actions</th>
              <th style={{width:32}}></th>
            </tr></thead>
            <tbody>
              {!list.length ? (
                <tr><td colSpan={11} style={{textAlign:"center",padding:32,color:"var(--text-muted)"}}>No students found.</td></tr>
              ) : list.map(({ s, latest }, i) => {
                const trend   = getTrend(s.id);
                const cpi     = calcCPI(s.id, records, weeks);
                const isOpen  = expandedId === s.id;
                return (
                  <Fragment key={s.id}>
                    <tr style={isOpen ? {background:"var(--blue-pale)"} : {}}>
                      <td style={{color:"var(--text-muted)",fontSize:12}}>{i+1}</td>
                      <td><strong>{s.name}</strong></td>
                      <td className="col-hide-sm">{s.urn}</td>
                      <td className="col-hide-sm"><DeptChip dept={s.dept} /></td>
                      <td className="col-hide-md" style={{fontSize:12,color:"var(--text-muted)"}}>{s.email || "—"}</td>
                      <td className="score-val">{latest ? latest.computed?.WPI?.toFixed(1) : "—"}</td>
                      <td><BandBadge band={latest?.computed?.band} /></td>
                      <td className="col-hide-md"><TrendBadge trend={trend} /></td>
                      <td className="col-hide-md">
                        {cpi
                          ? <span style={{fontSize:11,fontWeight:700,color:TIER_COLORS[cpi.tierKey]}}>{TIER_LABELS[cpi.tierKey]} <span style={{opacity:.7}}>({cpi.cpi})</span></span>
                          : <span style={{color:"var(--text-muted)",fontSize:11}}>—</span>}
                      </td>
                      <td className="col-hide-sm">
                        <div style={{display:"flex",gap:5}}>
                          <button className="btn btn-outline btn-xs" onClick={()=>openEdit(s)}>Edit</button>
                          <button className="btn btn-danger btn-xs"  onClick={()=>handleDelete(s)}>Del</button>
                        </div>
                      </td>
                      <td>
                        <button
                          className={`expand-btn${isOpen ? " open" : ""}`}
                          onClick={() => toggleExpand(s.id)}
                          title={isOpen ? "Collapse" : "Expand details"}
                        >
                          {isOpen ? "▾" : "▸"}
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={11} style={{padding:0}}>
                          <div className="student-detail-panel">
                            <div className="sdp-item">
                              <span className="sdp-label">URN No.</span>
                              <strong className="sdp-value">{s.urn}</strong>
                            </div>
                            <div className="sdp-item">
                              <span className="sdp-label">Department</span>
                              <span className="sdp-value"><DeptChip dept={s.dept} /></span>
                            </div>
                            <div className="sdp-item" style={{gridColumn:"1 / -1"}}>
                              <span className="sdp-label">Email</span>
                              <span className="sdp-value">{s.email || "—"}</span>
                            </div>
                            <div className="sdp-item">
                              <span className="sdp-label">Trend</span>
                              <span className="sdp-value"><TrendBadge trend={trend} /></span>
                            </div>
                            <div className="sdp-item">
                              <span className="sdp-label">Placement</span>
                              {cpi
                                ? <span className="sdp-value" style={{fontWeight:700,color:TIER_COLORS[cpi.tierKey]}}>
                                    {TIER_LABELS[cpi.tierKey]}
                                    <span style={{opacity:.7,fontWeight:400,fontSize:12}}> · CPI {cpi.cpi} · WPI {cpi.avgWPI}</span>
                                  </span>
                                : <span className="sdp-value" style={{color:"var(--text-muted)"}}>No records yet</span>}
                            </div>
                            <div className="sdp-actions">
                              <button className="btn btn-outline btn-sm" onClick={()=>openEdit(s)}>✏ Edit</button>
                              <button className="btn btn-danger btn-sm"  onClick={()=>handleDelete(s)}>🗑 Delete</button>
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

      {/* Add/Edit Modal */}
      {modal && (
        <div className="modal-overlay open">
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">{modal.mode==="add"?"Add Student":"Edit Student"}</div>
              <button className="modal-close" onClick={closeModal}>✕</button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleSubmit}>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">URN Number *</label>
                    <input className="form-control" required value={form.urn} onChange={e=>setForm(f=>({...f,urn:e.target.value}))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Full Name *</label>
                    <input className="form-control" required value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Department *</label>
                    <select className="form-control" value={form.dept} onChange={e=>setForm(f=>({...f,dept:e.target.value}))}>
                      {DEPTS.map(d=><option key={d}>{d}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email</label>
                    <input className="form-control" type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} />
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-ghost" onClick={closeModal}>Cancel</button>
                  <button type="submit" className="btn btn-primary">{modal.mode==="add"?"Add Student":"Save Changes"}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
