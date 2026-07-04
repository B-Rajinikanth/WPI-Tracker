import { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { useDB } from "../context/DBContext";
import { calcScores, num, uid } from "../utils/wpi";

const DEF = {
  uniContest:"", vendorScore:"", coreSubject:"", skillActivities:"",
  probAttempted:"", probSolved:"",
  quant:"", logical:"", verbal:"",
  gd:"", mock:"", confidence:"",
  attendance:"", contestParticipation:"0", proctoredContest:"0",
};

export default function WeeklyEntry() {
  const { students, records, activeWeek, saveRecord, bulkSaveRecords } = useDB();
  const [sid, setSid]     = useState("");
  const [form, setForm]   = useState(DEF);
  const [preview, setPreview] = useState(null);

  const sortedStudents = useMemo(() =>
    [...students].sort((a,b) => a.name.localeCompare(b.name)), [students]);

  const handleStudentChange = e => {
    const id = e.target.value;
    setSid(id);
    const existing = records.find(r => r.studentId===id && r.week===activeWeek);
    if (existing) {
      const { uniContest="",vendorScore="",coreSubject="",skillActivities="",
        probAttempted="",probSolved="",quant="",logical="",verbal="",
        gd="",mock="",confidence="",attendance="",
        contestParticipation=0,proctoredContest=0 } = existing;
      setForm({ uniContest,vendorScore,coreSubject,skillActivities,
        probAttempted,probSolved,quant,logical,verbal,gd,mock,confidence,
        attendance,contestParticipation:String(contestParticipation),
        proctoredContest:String(proctoredContest) });
    } else {
      setForm(DEF);
    }
    compute(form);
  };

  const compute = (f = form) => {
    const scores = calcScores({
      ...f,
      contestParticipation: Number(f.contestParticipation),
      proctoredContest:     Number(f.proctoredContest),
    });
    setPreview(scores);
  };

  const handleChange = e => {
    const updated = { ...form, [e.target.name]: e.target.value };
    setForm(updated);
    compute(updated);
  };

  const handleSave = async () => {
    if (!sid) return alert("Select a student.");
    if (!activeWeek) return alert("No active week.");
    await saveRecord({
      studentId: sid, week: activeWeek,
      ...form,
      contestParticipation: Number(form.contestParticipation),
      proctoredContest:     Number(form.proctoredContest),
    });
    setSid(""); setForm(DEF); setPreview(null);
  };

  // ── Excel template download ──────────────────────────────
  const downloadTemplate = () => {
    try {
      const headers = [
        "URN_No","Name","Department",
        "Uni_Contest_Score","Vendor_Score","Core_Subject_Score","Skill_Activities_Score",
        "Problems_Attempted","Problems_Solved",
        "Quant","Logical","Verbal",
        "GD_Score","Mock_Interview","Confidence",
        "Attendance_Pct","CC_Global_Contest_1Yes_0No","University_Contest_1Yes_0No",
      ];
      const rows = sortedStudents.map(s => [
        s.urn, s.name, s.dept,
        "","","","","","","","","","","","","","0","0",
      ]);
      const notes = [["NOTE: Fill score columns 4–16 (0–100). Columns 17–18: 1=Yes, 0=No. Do NOT edit URN/Name/Dept."]];
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wsNotes = XLSX.utils.aoa_to_sheet(notes);
      const wb = XLSX.utils.book_new();
      const sheetName = `Scores_${activeWeek||"Week"}`.slice(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      XLSX.utils.book_append_sheet(wb, wsNotes, "Instructions");
      const filename = `Weekly_Scores_${(activeWeek||"Template").replace(/[^a-zA-Z0-9_-]/g,"_")}.xlsx`;
      const buf = XLSX.write(wb, { bookType:"xlsx", type:"array" });
      const blob = new Blob([buf], { type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Template download failed:", err);
      alert("Download failed: " + err.message);
    }
  };

  // ── Excel import ─────────────────────────────────────────
  const [importing, setImporting]       = useState(false);
  const [importResults, setImportResults] = useState(null);
  const handleExcelImport = async e => {
    const file = e.target.files[0]; if (!file) return;
    if (!activeWeek) { alert("No active week set. Create a week first."); return; }
    const reader = new FileReader();
    reader.onload = async ev => {
      setImporting(true);
      try {
        const wb  = XLSX.read(ev.target.result, { type:"array" });
        const ws  = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { header:1, defval:"" });
        const [hdr, ...rows] = raw;

        // Map column indices from header names
        const ci = {};
        hdr.forEach((h, i) => {
          const n = String(h).toLowerCase().replace(/[\s_]/g,"");
          if (n.includes("urn"))                  ci.urn = i;
          else if (n.includes("name"))            ci.name = i;
          else if (n.includes("dept"))            ci.dept = i;
          else if (n.includes("ccglobal"))        ci.contestParticipation = i;
          else if (n.includes("universitycontest")) ci.proctoredContest = i;
          else if (n.includes("uni"))             ci.uniContest = i;
          else if (n.includes("vendor"))          ci.vendorScore = i;
          else if (n.includes("core"))            ci.coreSubject = i;
          else if (n.includes("skill"))           ci.skillActivities = i;
          else if (n.includes("attempted"))       ci.probAttempted = i;
          else if (n.includes("solved"))          ci.probSolved = i;
          else if (n.includes("quant"))           ci.quant = i;
          else if (n.includes("logical"))         ci.logical = i;
          else if (n.includes("verbal"))          ci.verbal = i;
          else if (n.includes("gd"))              ci.gd = i;
          else if (n.includes("mock"))            ci.mock = i;
          else if (n.includes("confidence"))      ci.confidence = i;
          else if (n.includes("attendance"))      ci.attendance = i;
          else if (n.includes("contest") && n.includes("prot")) ci.proctoredContest = i;
          else if (n.includes("contest"))         ci.contestParticipation = i;
        });

        const urnMap = new Map(students.map(s => [String(s.urn).trim().toLowerCase(), s]));
        const toSave = [];
        const skipped = [];

        rows.forEach(row => {
          if (!row[ci.urn]) return;
          const urn = String(row[ci.urn]).trim().toLowerCase();
          const student = urnMap.get(urn);
          if (!student) { skipped.push(String(row[ci.urn]).trim()); return; }

          const g = (key) => {
            const v = ci[key] !== undefined ? row[ci[key]] : "";
            return v === "" ? "" : Number(v);
          };

          const formData = {
            uniContest:          g("uniContest"),
            vendorScore:         g("vendorScore"),
            coreSubject:         g("coreSubject"),
            skillActivities:     g("skillActivities"),
            probAttempted:       g("probAttempted"),
            probSolved:          g("probSolved"),
            quant:               g("quant"),
            logical:             g("logical"),
            verbal:              g("verbal"),
            gd:                  g("gd"),
            mock:                g("mock"),
            confidence:          g("confidence"),
            attendance:          g("attendance"),
            contestParticipation: Number(g("contestParticipation")) || 0,
            proctoredContest:     Number(g("proctoredContest")) || 0,
          };

          const computed = calcScores(formData);
          toSave.push({ id: uid(), studentId: student.id, week: activeWeek, ...formData, computed });
        });

        if (!toSave.length) {
          alert("No matching students found. Make sure URN numbers match exactly.");
          return;
        }
        await bulkSaveRecords(toSave);
        const studentMap = new Map(students.map(s => [s.id, s]));
        setImportResults({
          records: toSave.map(r => ({ ...r, student: studentMap.get(r.studentId) })),
          skipped,
        });
      } finally {
        setImporting(false);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const N = (name, label, tip="") => (
    <div className="form-group">
      <label className="form-label">{label}{tip && <span className="info-tag">{tip}</span>}</label>
      <input type="number" name={name} className="form-control" min="0" max="100"
        value={form[name]} onChange={handleChange} placeholder="0–100" />
    </div>
  );

  const bandCls = preview ? (preview.band==="A"?"band-A":preview.band==="B"?"band-B":"band-C") : "";

  return (
    <section className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">Weekly Score Entry</div>
          <div className="page-subtitle">Active Week: <strong>{activeWeek||"—"}</strong></div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          {preview && (
            <div style={{textAlign:"right",marginRight:8}}>
              <div style={{fontSize:13,color:"var(--text-muted)"}}>WPI</div>
              <div style={{fontSize:36,fontWeight:800,color:"var(--blue)"}}>{preview.WPI.toFixed(1)}</div>
              <span className={`band-badge band-${preview.band}`}><span className={`dot dot-${preview.band}`}></span>Band {preview.band}</span>
            </div>
          )}
          <button className="btn btn-ghost btn-sm" onClick={downloadTemplate}>⬇ Download Template</button>
          <label className={`btn btn-outline btn-sm${importing?" disabled":""}`} style={{cursor:importing?"not-allowed":"pointer"}}>
            {importing ? "⏳ Importing…" : "📥 Import Scores from Excel"}
            <input type="file" accept=".xlsx,.xls" onChange={handleExcelImport} style={{display:"none"}} disabled={importing} />
          </label>
        </div>
      </div>

      <div className="card">
        <div className="form-group mb20">
          <label className="form-label">Select Student</label>
          <select className="form-control" value={sid} onChange={handleStudentChange}>
            <option value="">— Choose a student —</option>
            {sortedStudents.map(s => <option key={s.id} value={s.id}>{s.name} ({s.urn})</option>)}
          </select>
        </div>

        {sid && (
          <>
            {/* Technical */}
            <div className="section-divider">Technical Component (40%)</div>
            <div className="form-grid-3">
              {N("uniContest","CC Global Contest Score","/100")}
              {N("vendorScore","Vendor Assessment Score","/100")}
              {N("coreSubject","Core Subject Score","/100")}
              {N("skillActivities","Skill Activities Score","/100")}
              {N("probAttempted","Problems Attempted","")}
              {N("probSolved","Problems Solved","")}
            </div>

            {/* Aptitude */}
            <div className="section-divider">Aptitude Component (25%)</div>
            <div className="form-grid-3">
              {N("quant","Quantitative","/100")}
              {N("logical","Logical","/100")}
              {N("verbal","Verbal","/100")}
            </div>

            {/* Communication */}
            <div className="section-divider">Communication Component (25%)</div>
            <div className="form-grid-3">
              {N("gd","GD Score","/100")}
              {N("mock","Mock Interview","/100")}
              {N("confidence","Confidence","/100")}
            </div>

            {/* Discipline */}
            <div className="section-divider">Discipline Component (10%)</div>
            <div className="form-grid-3">
              {N("attendance","Attendance %","%")}
              <div className="form-group">
                <label className="form-label">CC Global Contest</label>
                <select name="contestParticipation" className="form-control" value={form.contestParticipation} onChange={handleChange}>
                  <option value="1">Yes – Participated</option>
                  <option value="0">No – Did not participate</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">University Contest</label>
                <select name="proctoredContest" className="form-control" value={form.proctoredContest} onChange={handleChange}>
                  <option value="1">Yes – Participated</option>
                  <option value="0">No – Did not participate</option>
                </select>
              </div>
            </div>

            {preview && preview.floorFails.length > 0 && (
              <div className="floor-rule-box" style={{marginTop:16}}>
                ⚠ Floor score fails: {preview.floorFails.join(" · ")} → Band downgraded to B
              </div>
            )}

            <div style={{display:"flex",gap:12,marginTop:24}}>
              <button className="btn btn-primary" onClick={handleSave}>💾 Save Score</button>
              <button className="btn btn-ghost" onClick={() => { setSid(""); setForm(DEF); setPreview(null); }}>Clear</button>
            </div>
          </>
        )}
      </div>

      {/* Import Results Preview */}
      {importResults && (
        <div className="card" style={{marginTop:24}}>
          <div className="card-header" style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span>📋 Import Results — {importResults.records.length} records saved for <strong>{activeWeek}</strong></span>
            <button className="btn btn-ghost btn-sm" onClick={() => setImportResults(null)}>✕ Close</button>
          </div>
          {importResults.skipped.length > 0 && (
            <div className="floor-rule-box" style={{margin:"12px 16px 0"}}>
              ⚠ Skipped URNs (not found in roster): {importResults.skipped.join(", ")}
            </div>
          )}
          <div className="table-container" style={{marginTop:8}}>
            <div className="table-scroll">
              <table>
                <thead><tr>
                  <th>#</th><th>URN</th><th>Name</th><th>Dept</th>
                  <th>T</th><th>A</th><th>C</th><th>D</th>
                  <th>WPI</th><th>Band</th>
                </tr></thead>
                <tbody>
                  {importResults.records.map((r, i) => {
                    const c = r.computed;
                    const s = r.student || {};
                    return (
                      <tr key={r.id}>
                        <td>{i+1}</td>
                        <td><strong>{s.urn}</strong></td>
                        <td>{s.name}</td>
                        <td><span className="dept-chip">{s.dept}</span></td>
                        <td className={`score-val ${c.T<50?"floor-fail":""}`}>{c.T?.toFixed(1)}</td>
                        <td className={`score-val ${c.A<50?"floor-fail":""}`}>{c.A?.toFixed(1)}</td>
                        <td className={`score-val ${c.C<30?"floor-fail":""}`}>{c.C?.toFixed(1)}</td>
                        <td className="score-val">{c.D?.toFixed(1)}</td>
                        <td className="score-val"><strong>{c.WPI?.toFixed(1)}</strong></td>
                        <td>
                          <span className={`band-badge band-${c.band}`}>
                            <span className={`dot dot-${c.band}`}></span>Band {c.band}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
