/* =========================================================
   R24 Batch – WPI Tracker  |  app.js
   Skill Development Centre
   ========================================================= */

"use strict";

// ── API Configuration ─────────────────────────────────────
const API_BASE = "http://localhost:3001/api";

// ── In-memory DB ──────────────────────────────────────────
const DB = { students:[], weeks:[], records:[], activeWeek:"" };

// Tracks IDs deleted since last sync so the server can remove them
const _deleted = { studentIds: new Set(), recordIds: new Set() };

// ── API Helpers ───────────────────────────────────────────
async function _apiFetch(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${path}: ${text}`);
  }
  return res.json();
}

// ── Load DB from MongoDB ──────────────────────────────────
async function loadDB() {
  try {
    const data = await _apiFetch("/data");
    DB.students   = data.students   || [];
    DB.weeks      = data.weeks      || [];
    DB.records    = data.records    || [];
    DB.activeWeek = data.activeWeek || "";
    console.log(`✅ Loaded from MongoDB: ${DB.students.length} students, ${DB.records.length} records`);
  } catch (err) {
    console.warn("⚠ MongoDB unavailable, falling back to localStorage:", err.message);
    DB.students   = JSON.parse(localStorage.getItem("wpi_students") || "[]");
    DB.weeks      = JSON.parse(localStorage.getItem("wpi_weeks")    || "[]");
    DB.records    = JSON.parse(localStorage.getItem("wpi_records")  || "[]");
    DB.activeWeek = localStorage.getItem("wpi_activeWeek")          || "";
  }
}

// ── Save DB to MongoDB (debounced, fire-and-forget) ───────
let _saveTimer = null;
function saveDB() {
  // Also mirror to localStorage as offline fallback
  localStorage.setItem("wpi_students",   JSON.stringify(DB.students));
  localStorage.setItem("wpi_weeks",      JSON.stringify(DB.weeks));
  localStorage.setItem("wpi_records",    JSON.stringify(DB.records));
  localStorage.setItem("wpi_activeWeek", DB.activeWeek);

  // Debounce cloud sync — wait 400 ms after last change before sending
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => _syncToMongo(), 400);
}

async function _syncToMongo() {
  try {
    await _apiFetch("/sync", {
      method : "POST",
      body   : JSON.stringify({
        students          : DB.students,
        records           : DB.records,
        weeks             : DB.weeks,
        activeWeek        : DB.activeWeek,
        deletedStudentIds : [..._deleted.studentIds],
        deletedRecordIds  : [..._deleted.recordIds],
      }),
    });
    // Clear pending deletions after successful sync
    _deleted.studentIds.clear();
    _deleted.recordIds.clear();
    _showSyncStatus("saved");
  } catch (err) {
    console.error("MongoDB sync failed:", err.message);
    _showSyncStatus("error");
  }
}

// ── Sync status indicator (subtle badge in header) ────────
let _syncStatusTimer = null;
function _showSyncStatus(state) {
  let badge = document.getElementById("syncBadge");
  if (!badge) return;
  clearTimeout(_syncStatusTimer);
  if (state === "saving") {
    badge.textContent = "⟳ Saving…";
    badge.style.color = "var(--amber)";
  } else if (state === "saved") {
    badge.textContent = "✓ Saved to Cloud";
    badge.style.color = "var(--green)";
    _syncStatusTimer = setTimeout(() => { badge.textContent = ""; }, 3000);
  } else {
    badge.textContent = "⚠ Sync failed (local only)";
    badge.style.color = "var(--red)";
  }
}
function uid() { return "id" + Date.now() + Math.random().toString(36).slice(2,7); }

// ── Departments ───────────────────────────────────────────
const DEPTS = ["CSE","IT","ECE","EEE","MECH","CIVIL","AIDS","AIML","CSD","MBA","Other"];

// ── Score Engine ──────────────────────────────────────────
function calcScores(r) {
  // T – Technical (avg of provided values)
  const tv = [r.uniContest, r.vendorScore, r.coreSubject, r.skillActivities]
    .filter(v => v !== null && v !== undefined && v !== "" && !isNaN(v))
    .map(Number);
  let T = tv.length ? tv.reduce((a,b) => a+b, 0) / tv.length : 0;
  if (Number(r.probAttempted) > 0) {
    const ratio = Math.min(Number(r.probSolved) / Number(r.probAttempted), 1) * 100;
    T = tv.length ? T * 0.8 + ratio * 0.2 : ratio;
  }
  T = clamp(round1(T), 0, 100);

  // A – Aptitude
  const A = clamp(round1(
    num(r.quant)   * 0.50 +
    num(r.logical) * 0.30 +
    num(r.verbal)  * 0.20
  ), 0, 100);

  // C – Communication
  const C = clamp(round1(
    num(r.gd)         * 0.20 +
    num(r.mock)       * 0.60 +
    num(r.confidence) * 0.20
  ), 0, 100);

  // D – Discipline
  const att      = clamp(num(r.attendance), 0, 100);
  const contestP = ((num(r.contestParticipation) + num(r.proctoredContest)) / 2) * 100;
  const D = clamp(round1(att * 0.75 + contestP * 0.25), 0, 100);

  // WPI
  const WPI = clamp(round1(T*0.4 + A*0.25 + C*0.25 + D*0.1), 0, 100);

  // Floor score checks
  const floorFails = [];
  if (T < 50) floorFails.push(`Technical (${T} < 50)`);
  if (A < 50) floorFails.push(`Aptitude (${A} < 50)`);
  if (C < 30) floorFails.push(`Communication (${C} < 30)`);

  // Band classification with mandatory floor rule
  let band;
  if (WPI >= 75 && T >= 50 && A >= 50 && C >= 30) band = "A";
  else if (WPI >= 50)                              band = "B";
  else                                             band = "C";

  return { T, A, C, D, WPI, band, floorFails };
}

function calcTrend(studentId) {
  const recs = DB.records
    .filter(r => r.studentId === studentId)
    .sort((a,b) => a.week.localeCompare(b.week));
  if (recs.length < 2) return "→";

  // Oscillation: band shifts every week for 3+ consecutive weeks
  if (recs.length >= 3) {
    const last3 = recs.slice(-3).map(r => r.computed.band);
    if (last3[0] !== last3[1] && last3[1] !== last3[2]) return "⚠";
  }

  const wpis = recs.slice(-4).map(r => r.computed.WPI);
  const diff  = wpis[wpis.length-1] - wpis[0];
  if (diff >  4) return "↑";
  if (diff < -4) return "↓";
  return "→";
}

function actionLabel(band) {
  if (band === "A") return "Advanced Training";
  if (band === "B") return "Guided Practice";
  return "Immediate Intervention";
}

// helpers
const num    = v => (v === null || v === undefined || v === "" || isNaN(v)) ? 0 : Number(v);
const clamp  = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round1 = v => Math.round(v * 10) / 10;
const pct    = (n,d) => d ? Math.round(n/d*100) : 0;

// ── Sort Utilities ────────────────────────────────────────
function applySortState(state, col) {
  if (state.col === col) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
  else { state.col = col; state.dir = 'asc'; }
}
function sortRows(arr, col, dir, valFn) {
  return [...arr].sort((a, b) => {
    const va = valFn(a, col) ?? '', vb = valFn(b, col) ?? '';
    if (typeof va === 'number' && typeof vb === 'number')
      return dir === 'asc' ? va - vb : vb - va;
    return dir === 'asc'
      ? String(va).localeCompare(String(vb))
      : String(vb).localeCompare(String(va));
  });
}
function sortTh(label, col, state, handler) {
  const active = state.col === col;
  const cls = active ? `sort-${state.dir}` : 'sortable';
  return `<th class="${cls}" onclick="${handler}('${col}')">${label}</th>`;
}

// ── Chart Registry ────────────────────────────────────────
const CH = {};
function mkChart(id, cfg) {
  if (CH[id]) { try { CH[id].destroy(); } catch(e){} }
  const el = document.getElementById(id);
  if (!el) return;
  CH[id] = new Chart(el, cfg);
}

// ── Toast ─────────────────────────────────────────────────
let toastTimer;
function toast(msg, type = "info") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "show " + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.className = "", 3000);
}

// ── Modal Helpers ─────────────────────────────────────────
function openModal(id)  { document.getElementById(id).classList.add("open"); }
function closeModal(id) { document.getElementById(id).classList.remove("open"); }

// ── Week Helpers ──────────────────────────────────────────
function isoWeek(d = new Date()) {
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const w    = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(w).padStart(2,"0")}`;
}
function weekLabel(w) {
  // "2025-W20" → compute date range
  const [yr, wn] = w.split("-W").map(Number);
  const jan4 = new Date(yr, 0, 4);
  const start = new Date(jan4);
  start.setDate(jan4.getDate() - jan4.getDay() + 1 + (wn - 1) * 7);
  const end = new Date(start); end.setDate(start.getDate() + 6);
  const fmt = d => d.toLocaleDateString("en-IN", {day:"2-digit", month:"short"});
  return `${w} (${fmt(start)} – ${fmt(end)})`;
}

// ═══════════════════════════════════════════════════════════
//  MAIN APP
// ═══════════════════════════════════════════════════════════
const App = {

  // ── Init (async – loads from MongoDB first) ───────────
  async init() {
    _showLoader(true);
    await loadDB();
    _showLoader(false);
    if (!DB.weeks.length) this._createWeek(true);
    this._populateWeekSelects();
    this._populateDeptFilters();
    this._populateEntryStudentList();
    this.dashboard.render();
  },

  // ── Navigation ────────────────────────────────────────
  nav(page, el) {
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
    document.getElementById("page-" + page).classList.add("active");
    el.classList.add("active");

    const renders = {
      dashboard   : () => this.dashboard.render(),
      students    : () => this.students.render(),
      entry       : () => this.entry.onShow(),
      tracking    : () => this.tracking.render(),
      analytics   : () => this.analytics.render(),
      interventions:() => this.interventions.render(),
      contest     : () => this.contest.render(),
      framework   : () => {},
    };
    (renders[page] || (() => {}))();
  },

  // ── Week management ───────────────────────────────────
  _createWeek(silent) {
    let w = isoWeek();
    while (DB.weeks.includes(w)) {
      const [yr, wn] = w.split("-W").map(Number);
      w = `${yr}-W${String(wn+1).padStart(2,"0")}`;
    }
    DB.weeks.push(w);
    DB.weeks.sort();
    DB.activeWeek = w;
    saveDB();
    this._populateWeekSelects();
    if (!silent) toast(`Week ${w} created and set as active.`, "success");
  },

  addWeek()      { this._createWeek(); },
  setActiveWeek(w) {
    DB.activeWeek = w;
    localStorage.setItem(KEY.active, w);
    document.getElementById("entryWeekBadge").textContent = w || "—";
    document.getElementById("dashWeekSub").textContent = w
      ? `Active Week: ${w}` : "No active week";
  },

  _populateWeekSelects() {
    const opts = DB.weeks
      .slice()
      .reverse()
      .map(w => `<option value="${w}" ${w===DB.activeWeek?"selected":""}>${w}</option>`)
      .join("");
    ["headerWeekSel","trackingWeekSel"].forEach(id => {
      const el = document.getElementById(id);
      if (el) { const v=el.value; el.innerHTML = opts; if(v) el.value=v; }
    });
    document.getElementById("entryWeekBadge").textContent = DB.activeWeek || "—";
    document.getElementById("dashWeekSub").textContent =
      DB.activeWeek ? `Active Week: ${DB.activeWeek}` : "No active week";
  },

  _populateDeptFilters() {
    const depts = [...new Set(DB.students.map(s => s.dept))].sort();
    const base  = `<option value="">All Departments</option>`;
    const opts  = base + depts.map(d => `<option>${d}</option>`).join("");
    ["studentDeptFilter","trackingDeptFilter"].forEach(id => {
      const el = document.getElementById(id);
      if (el) { const v=el.value; el.innerHTML=opts; if(v) el.value=v; }
    });
  },

  _populateEntryStudentList() {
    const sel = document.getElementById("entryStudentSel");
    sel.innerHTML = `<option value="">— Choose a student —</option>` +
      DB.students
        .sort((a,b) => a.name.localeCompare(b.name))
        .map(s => `<option value="${s.id}">${s.name} · ${s.urn} · ${s.dept}</option>`)
        .join("");
    const asel = document.getElementById("analyticsStudentSel");
    if (asel) asel.innerHTML =
      `<option value="">— Select student for history —</option>` +
      DB.students.map(s => `<option value="${s.id}">${s.name} (${s.urn})</option>`).join("");
  },

  // ── Export CSV ────────────────────────────────────────
  exportCSV() {
    if (!DB.records.length) { toast("No data to export.", "error"); return; }
    const hdr = ["Week","URN","Name","Department",
      "Tech(T)","Aptitude(A)","Comm(C)","Discipline(D)","WPI","Band","Trend","Action",
      "FloorFails","UniContest","VendorScore","CoreSubject","SkillActivities",
      "ProbAttempted","ProbSolved","Quant","Logical","Verbal",
      "GD","MockInterview","Confidence","Attendance","ContestParticip","ProctoredContest"];
    const rows = DB.records
      .sort((a,b) => b.week.localeCompare(a.week) || b.computed.WPI - a.computed.WPI)
      .map(r => {
        const s = DB.students.find(s => s.id === r.studentId) || {};
        const tr = calcTrend(r.studentId);
        return [
          r.week, s.urn||"", s.name||"", s.dept||"",
          r.computed.T, r.computed.A, r.computed.C, r.computed.D, r.computed.WPI,
          r.computed.band, tr, actionLabel(r.computed.band),
          (r.computed.floorFails||[]).join("; "),
          r.uniContest||"", r.vendorScore||"", r.coreSubject||"", r.skillActivities||"",
          r.probAttempted||"", r.probSolved||"",
          r.quant||"", r.logical||"", r.verbal||"",
          r.gd||"", r.mock||"", r.confidence||"", r.attendance||"",
          r.contestParticipation||0, r.proctoredContest||0,
        ];
      });
    const csv = [hdr, ...rows].map(row =>
      row.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")
    ).join("\n");
    const a   = document.createElement("a");
    a.href    = URL.createObjectURL(new Blob([csv], { type:"text/csv" }));
    a.download= `R24_WPI_${DB.activeWeek||"export"}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    toast("CSV exported successfully!", "success");
  },

  // ══════════════════════════════════════════════════════
  //  DASHBOARD
  // ══════════════════════════════════════════════════════
  dashboard: {
    render() {
      const w    = DB.activeWeek;
      const recs = DB.records.filter(r => r.week === w);
      const total= DB.students.length;
      const aCount = recs.filter(r => r.computed.band==="A").length;
      const bCount = recs.filter(r => r.computed.band==="B").length;
      const cCount = recs.filter(r => r.computed.band==="C").length;
      const wpis   = recs.map(r => r.computed.WPI);
      const avg    = wpis.length ? round1(wpis.reduce((a,b) => a+b,0)/wpis.length) : 0;
      const above  = wpis.filter(w => w >= avg).length;

      // KPIs
      document.getElementById("kpiTotal").textContent  = total;
      document.getElementById("kpiBandA").textContent  = aCount;
      document.getElementById("kpiPctA").textContent   = `${pct(aCount,total)}% of batch`;
      document.getElementById("kpiBandB").textContent  = bCount;
      document.getElementById("kpiPctB").textContent   = `${pct(bCount,total)}% of batch`;
      document.getElementById("kpiBandC").textContent  = cCount;
      document.getElementById("kpiPctC").textContent   = `${pct(cCount,total)}% of batch`;
      document.getElementById("kpiAvgWPI").textContent = avg;
      document.getElementById("kpiWPISub").textContent = `${above} above · ${recs.length-above} below avg`;

      this._bandChart(aCount, bCount, cCount);
      this._movementStats(recs);
      this._componentRadar(recs);
      this._top10(recs);
      this._bottom20(recs);
      this._deptBars(recs);
      this._riskSummary(recs);
    },

    _bandChart(a,b,c) {
      mkChart("chartBand", {
        type: "doughnut",
        data: {
          labels: ["Band A – Placement Ready","Band B – Moderate","Band C – Critical"],
          datasets: [{ data:[a,b,c], backgroundColor:["#2E7D32","#FF8F00","#C62828"],
            borderWidth: 3, borderColor: "#fff", hoverOffset: 6 }]
        },
        options: {
          responsive:true, maintainAspectRatio:false, cutout:"62%",
          plugins: { legend:{ position:"bottom", labels:{ font:{size:11}, padding:12 } } }
        }
      });
    },

    _movementStats(weekRecs) {
      const prevIdx = DB.weeks.indexOf(DB.activeWeek) - 1;
      const prevW   = prevIdx >= 0 ? DB.weeks[prevIdx] : null;
      let imp=0, dec=0, stb=0, fresh=0;
      weekRecs.forEach(r => {
        const prev = prevW ? DB.records.find(p => p.studentId===r.studentId && p.week===prevW) : null;
        if (!prev) { fresh++; return; }
        const d = r.computed.WPI - prev.computed.WPI;
        if (d >  3) imp++;
        else if (d < -3) dec++;
        else stb++;
      });

      const el = document.getElementById("movementList");
      el.innerHTML = [
        { label:"↑ Improved",   val:imp,   color:"var(--green)" },
        { label:"↓ Declined",   val:dec,   color:"var(--red)" },
        { label:"→ Stable",     val:stb,   color:"var(--gray)" },
        { label:"★ New Entry",  val:fresh, color:"var(--blue)" },
      ].map(x => `
        <div class="movement-row">
          <span class="movement-label" style="color:${x.color}">${x.label}</span>
          <span class="movement-value" style="color:${x.color}">${x.val}</span>
        </div>`).join("");

      mkChart("chartMovement", {
        type: "bar",
        data: {
          labels: ["Improved","Declined","Stable","New"],
          datasets: [{ data:[imp,dec,stb,fresh],
            backgroundColor:["#2E7D32","#C62828","#78909C","#1565C0"],
            borderRadius: 5, borderSkipped: false }]
        },
        options: {
          responsive:true, maintainAspectRatio:false,
          plugins:{ legend:{ display:false } },
          scales:{ y:{ beginAtZero:true, ticks:{ stepSize:1 }, grid:{ color:"#F0F4F8" } },
                   x:{ grid:{ display:false } } }
        }
      });
    },

    _componentRadar(recs) {
      if (!recs.length) { mkChart("chartComponents",{type:"radar",data:{labels:[],datasets:[]}}); return; }
      const avg = k => round1(recs.reduce((a,r) => a+r.computed[k],0)/recs.length);
      mkChart("chartComponents", {
        type: "radar",
        data: {
          labels: ["Technical","Aptitude","Communication","Discipline"],
          datasets: [{
            label: "Batch Average",
            data: [avg("T"), avg("A"), avg("C"), avg("D")],
            borderColor: "#1565C0", backgroundColor: "rgba(21,101,192,0.15)",
            borderWidth: 2, pointBackgroundColor: "#1565C0", pointRadius: 4,
          }]
        },
        options: {
          responsive:true, maintainAspectRatio:false,
          plugins:{ legend:{ display:false } },
          scales:{ r:{ min:0, max:100, ticks:{ stepSize:25, font:{size:10} },
            grid:{ color:"#E0E6ED" }, pointLabels:{ font:{size:12} } } }
        }
      });
    },

    _top10(recs) {
      const sorted = [...recs].sort((a,b) => b.computed.WPI - a.computed.WPI).slice(0,10);
      const ul = document.getElementById("top10List");
      if (!sorted.length) { ul.innerHTML = emptyRow(); return; }
      ul.innerHTML = sorted.map((r,i) => {
        const s = DB.students.find(st => st.id===r.studentId) || {};
        return `<li class="rank-row">
          <div class="rank-num">${i+1}</div>
          <div class="rank-info">
            <div class="rank-name">${esc(s.name)||"—"}</div>
            <div class="rank-dept"><span class="chip chip-dept">${s.dept||""}</span></div>
          </div>
          <span class="band-badge band-${r.computed.band}"><span class="dot dot-${r.computed.band}"></span>${r.computed.band}</span>
          <div class="rank-wpi">${r.computed.WPI.toFixed(1)}</div>
        </li>`;
      }).join("");
    },

    _bottom20(recs) {
      const sorted = [...recs].sort((a,b) => a.computed.WPI - b.computed.WPI).slice(0,20);
      const div = document.getElementById("bottom20List");
      if (!sorted.length) { div.innerHTML = emptyRow(); return; }
      div.innerHTML = `<ul class="rank-list">` + sorted.map((r,i) => {
        const s = DB.students.find(st => st.id===r.studentId) || {};
        return `<li class="rank-row">
          <div class="rank-num bottom">${i+1}</div>
          <div class="rank-info">
            <div class="rank-name">${esc(s.name)||"—"}</div>
            <div class="rank-dept"><span class="chip chip-dept">${s.dept||""}</span></div>
          </div>
          <span class="band-badge band-${r.computed.band}">${r.computed.band}</span>
          <div class="rank-wpi" style="color:var(--red)">${r.computed.WPI.toFixed(1)}</div>
        </li>`;
      }).join("") + `</ul>`;
    },

    _deptBars(recs) {
      const map = {};
      recs.forEach(r => {
        const s = DB.students.find(st => st.id===r.studentId);
        if (!s) return;
        if (!map[s.dept]) map[s.dept] = { sum:0, cnt:0 };
        map[s.dept].sum += r.computed.WPI;
        map[s.dept].cnt++;
      });
      const entries = Object.entries(map).sort((a,b) => (b[1].sum/b[1].cnt) - (a[1].sum/a[1].cnt));
      const maxAvg  = entries.length ? Math.max(...entries.map(([,v]) => v.sum/v.cnt)) : 100;
      const div = document.getElementById("deptBars");
      div.innerHTML = entries.length ? entries.map(([dept,v]) => {
        const avg   = v.sum/v.cnt;
        const color = avg>=75?"var(--green)":avg>=50?"#FF8F00":"var(--red)";
        return `<div class="dept-row">
          <div class="dept-name">${dept}</div>
          <div class="dept-bar">
            <div class="progress-track">
              <div class="progress-fill" style="width:${pct(avg,maxAvg)}%;background:${color}"></div>
            </div>
          </div>
          <div class="dept-count">(${v.cnt})</div>
          <div class="dept-wpi">${avg.toFixed(1)}</div>
        </div>`;
      }).join("") : emptyRow("No dept data");

      mkChart("chartDept", {
        type: "bar",
        data: {
          labels: entries.map(([d]) => d),
          datasets: [{
            label: "Avg WPI",
            data: entries.map(([,v]) => round1(v.sum/v.cnt)),
            backgroundColor: entries.map(([,v]) => {
              const a = v.sum/v.cnt;
              return a>=75?"#2E7D32":a>=50?"#FF8F00":"#C62828";
            }),
            borderRadius: 5, borderSkipped: false,
          }]
        },
        options: {
          responsive:true, maintainAspectRatio:false,
          plugins:{ legend:{ display:false } },
          scales:{
            y:{ beginAtZero:true, max:100, grid:{ color:"#F0F4F8" } },
            x:{ grid:{ display:false } }
          }
        }
      });
    },

    _riskSummary(recs) {
      const crit = recs.filter(r => r.computed.band==="C").length;
      const osc  = DB.students.filter(s => calcTrend(s.id)==="⚠").length;
      const abs  = recs.filter(r => num(r.attendance) < 75).length;
      const flr  = recs.filter(r => (r.computed.floorFails||[]).length > 0).length;
      document.getElementById("riskCrit").textContent = crit;
      document.getElementById("riskOsc").textContent  = osc;
      document.getElementById("riskAbs").textContent  = abs;
      document.getElementById("riskFlr").textContent  = flr;
    },
  },

  // ══════════════════════════════════════════════════════
  //  STUDENTS
  // ══════════════════════════════════════════════════════
  students: {
    _sort: { col: 'name', dir: 'asc' },

    setSort(col) { applySortState(this._sort, col); this.render(); },

    render() {
      const q    = (document.getElementById("studentSearch").value || "").toLowerCase();
      const dept = document.getElementById("studentDeptFilter").value;

      // Filter
      const filtered = DB.students.filter(s => {
        const m = !q || s.name.toLowerCase().includes(q) ||
                  s.urn.toLowerCase().includes(q) || s.dept.toLowerCase().includes(q);
        return m && (!dept || s.dept===dept);
      });

      // Augment with latest WPI/band (needed for sort)
      const augList = filtered.map(s => {
        const recs   = DB.records.filter(r => r.studentId===s.id).sort((a,b) => b.week.localeCompare(a.week));
        const latest = recs[0];
        return { s, latest, _wpi: latest ? latest.computed.WPI : -1, _band: latest ? latest.computed.band : '' };
      });

      // Sort
      const sorted = sortRows(augList, this._sort.col, this._sort.dir, (item, col) => {
        if (col === 'wpi')  return item._wpi;
        if (col === 'band') return item._band;
        return item.s[col] ?? '';
      });

      document.getElementById("studentCountLabel").textContent =
        `${sorted.length} student${sorted.length!==1?"s":""}`;

      // Update thead with sort indicators
      const fn = "App.students.setSort";
      document.getElementById("studentsThead").innerHTML = `<tr>
        <th>#</th>
        ${sortTh("URN No.",    "urn",   this._sort, fn)}
        ${sortTh("Name",       "name",  this._sort, fn)}
        ${sortTh("Department", "dept",  this._sort, fn)}
        ${sortTh("Email",      "email", this._sort, fn)}
        ${sortTh("Latest WPI","wpi",   this._sort, fn)}
        ${sortTh("Band",       "band",  this._sort, fn)}
        <th>Trend</th>
        <th>Actions</th>
      </tr>`;

      const tbody = document.getElementById("studentsTbody");
      if (!sorted.length) {
        tbody.innerHTML = `<tr><td colspan="9">${emptyCell("👥","No students found. Add students to get started.")}</td></tr>`;
        return;
      }
      tbody.innerHTML = sorted.map(({s, latest}, i) => {
        const wpi   = latest ? latest.computed.WPI.toFixed(1) : "—";
        const band  = latest ? latest.computed.band : "—";
        const trend = latest ? calcTrend(s.id) : "—";
        return `<tr>
          <td>${i+1}</td>
          <td><strong>${esc(s.urn)}</strong></td>
          <td><strong>${esc(s.name)}</strong></td>
          <td><span class="chip chip-dept">${s.dept}</span></td>
          <td>${s.email ? esc(s.email) : "—"}</td>
          <td class="score-val">${wpi}</td>
          <td>${band!=="—" ? `<span class="band-badge band-${band}"><span class="dot dot-${band}"></span>${band}</span>` : "—"}</td>
          <td class="${trendCls(trend)}">${trend}</td>
          <td>
            <div style="display:flex;gap:5px">
              <button class="btn btn-outline btn-xs" onclick="App.students.view('${s.id}')">View</button>
              <button class="btn btn-ghost btn-xs"   onclick="App.students.openEdit('${s.id}')">Edit</button>
              <button class="btn btn-danger btn-xs"  onclick="App.students.del('${s.id}')">Del</button>
            </div>
          </td>
        </tr>`;
      }).join("");
    },

    openAdd() {
      document.getElementById("studentModalTitle").textContent = "Add Student";
      document.getElementById("sId").value = "";
      ["sUrn","sName","sEmail"].forEach(id => document.getElementById(id).value = "");
      document.getElementById("sDept").value = "";
      openModal("studentModal");
    },

    openEdit(id) {
      const s = DB.students.find(s => s.id===id);
      if (!s) return;
      document.getElementById("studentModalTitle").textContent = "Edit Student";
      document.getElementById("sId").value   = s.id;
      document.getElementById("sUrn").value  = s.urn;
      document.getElementById("sName").value = s.name;
      document.getElementById("sDept").value = s.dept;
      document.getElementById("sEmail").value= s.email||"";
      openModal("studentModal");
    },

    save() {
      const id   = document.getElementById("sId").value;
      const urn  = document.getElementById("sUrn").value.trim();
      const name = document.getElementById("sName").value.trim();
      const dept = document.getElementById("sDept").value;
      const email= document.getElementById("sEmail").value.trim();
      if (!urn||!name||!dept) { toast("URN, Name, and Department are required.", "error"); return; }
      // Duplicate URN check
      const dup = DB.students.find(s => s.urn===urn && s.id!==id);
      if (dup) { toast("A student with this URN already exists.", "error"); return; }

      if (id) {
        Object.assign(DB.students.find(s => s.id===id), { urn, name, dept, email });
        toast(`${name} updated.`, "success");
      } else {
        DB.students.push({ id:uid(), urn, name, dept, email });
        toast(`${name} added.`, "success");
      }
      saveDB();
      closeModal("studentModal");
      this.render();
      App._populateEntryStudentList();
      App._populateDeptFilters();
    },

    del(id) {
      const s = DB.students.find(s => s.id===id);
      if (!s || !confirm(`Delete "${s.name}" and all their performance records?\n\nThis cannot be undone.`)) return;
      // Track deleted IDs so the sync can remove them from MongoDB
      _deleted.studentIds.add(id);
      DB.records.filter(r => r.studentId===id).forEach(r => _deleted.recordIds.add(r.id));
      DB.students = DB.students.filter(s => s.id!==id);
      DB.records  = DB.records.filter(r => r.studentId!==id);
      saveDB();
      this.render();
      App._populateEntryStudentList();
      App._populateDeptFilters();
      toast(`${s.name} deleted.`, "info");
    },

    view(id) {
      const s    = DB.students.find(s => s.id===id);
      if (!s) return;
      const recs = DB.records.filter(r => r.studentId===s.id).sort((a,b) => b.week.localeCompare(a.week));
      const latest = recs[0];
      const trend  = calcTrend(id);
      const initials = s.name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
      let html = `
        <div class="student-profile-header">
          <div class="student-avatar">${initials}</div>
          <div>
            <div style="font-size:17px;font-weight:700">${esc(s.name)}</div>
            <div style="color:var(--text-muted);font-size:13px">${esc(s.urn)} · ${s.dept}</div>
            ${s.email ? `<div style="font-size:12px;color:var(--blue);margin-top:2px">${esc(s.email)}</div>` : ""}
          </div>
          <div style="margin-left:auto;text-align:right">
            ${latest ? `<span class="band-badge band-${latest.computed.band}" style="font-size:14px">${latest.computed.band}</span>` : ""}
            <div style="font-size:24px;font-weight:800;color:var(--blue);margin-top:4px">${latest ? latest.computed.WPI.toFixed(1) : "—"}</div>
            <div style="font-size:11px;color:var(--text-muted)">Latest WPI</div>
          </div>
        </div>
        <div class="g4 mb16">
          ${[["Technical",latest?latest.computed.T.toFixed(1):"—"],
             ["Aptitude", latest?latest.computed.A.toFixed(1):"—"],
             ["Communication",latest?latest.computed.C.toFixed(1):"—"],
             ["Discipline",latest?latest.computed.D.toFixed(1):"—"]].map(([l,v]) =>
             `<div class="kpi-card kpi-blue"><div class="kpi-label">${l}</div><div class="kpi-value" style="font-size:22px">${v}</div></div>`
           ).join("")}
        </div>
        <div style="font-weight:700;margin-bottom:10px">Weekly History</div>
        <div class="table-container">
        <div class="table-scroll"><table>
          <thead><tr>
            <th>Week</th><th>Tech</th><th>Apt.</th><th>Comm</th><th>Disc</th>
            <th>WPI</th><th>Band</th><th>Floor</th>
          </tr></thead>
          <tbody>
            ${recs.length ? recs.map(r => `<tr>
              <td><span class="week-pill">${r.week}</span></td>
              <td class="score-val ${r.computed.T<50?"floor-fail":""}">${r.computed.T.toFixed(1)}</td>
              <td class="score-val ${r.computed.A<50?"floor-fail":""}">${r.computed.A.toFixed(1)}</td>
              <td class="score-val ${r.computed.C<30?"floor-fail":""}">${r.computed.C.toFixed(1)}</td>
              <td class="score-val">${r.computed.D.toFixed(1)}</td>
              <td class="score-val"><strong>${r.computed.WPI.toFixed(1)}</strong></td>
              <td><span class="band-badge band-${r.computed.band}">${r.computed.band}</span></td>
              <td>${(r.computed.floorFails||[]).length
                ? `<span class="floor-fail" data-tip="${(r.computed.floorFails).join(', ')}">⚠ Fail</span>`
                : `<span class="floor-ok">✓ Pass</span>`}</td>
            </tr>`).join("") :
            `<tr><td colspan="8">${emptyCell("📊","No records for this student yet.")}</td></tr>`}
          </tbody>
        </table></div></div>`;
      document.getElementById("studentDetailTitle").textContent = s.name;
      document.getElementById("studentDetailBody").innerHTML = html;
      openModal("studentDetailModal");
    },
  },

  // ══════════════════════════════════════════════════════
  //  ENTRY FORM
  // ══════════════════════════════════════════════════════
  entry: {
    onShow() {
      const el = document.getElementById("entryWeekBadge");
      el.textContent = DB.activeWeek || "No week selected";
    },

    loadStudent() {
      const sid  = document.getElementById("entryStudentSel").value;
      const wrap = document.getElementById("entryFormWrap");
      if (!sid) { wrap.style.display="none"; return; }
      wrap.style.display = "block";
      // Load existing record if any
      const rec = DB.records.find(r => r.studentId===sid && r.week===DB.activeWeek);
      const fields = [
        ["e_uniContest","uniContest"],["e_vendorScore","vendorScore"],
        ["e_coreSubject","coreSubject"],["e_skillActivities","skillActivities"],
        ["e_probAttempted","probAttempted"],["e_probSolved","probSolved"],
        ["e_quant","quant"],["e_logical","logical"],["e_verbal","verbal"],
        ["e_gd","gd"],["e_mock","mock"],["e_confidence","confidence"],
        ["e_attendance","attendance"],
      ];
      fields.forEach(([elId, key]) => {
        const el = document.getElementById(elId);
        el.value = rec ? (rec[key] ?? "") : "";
      });
      document.getElementById("e_contestParticipation").value = rec ? (rec.contestParticipation ?? 0) : 0;
      document.getElementById("e_proctoredContest").value     = rec ? (rec.proctoredContest ?? 0) : 0;
      this.compute();
    },

    getValues() {
      const g = id => { const v=document.getElementById(id).value; return v===""?null:Number(v); };
      return {
        uniContest      : g("e_uniContest"),
        vendorScore     : g("e_vendorScore"),
        coreSubject     : g("e_coreSubject"),
        skillActivities : g("e_skillActivities"),
        probAttempted   : g("e_probAttempted"),
        probSolved      : g("e_probSolved"),
        quant           : g("e_quant"),
        logical         : g("e_logical"),
        verbal          : g("e_verbal"),
        gd              : g("e_gd"),
        mock            : g("e_mock"),
        confidence      : g("e_confidence"),
        attendance      : g("e_attendance"),
        contestParticipation: Number(document.getElementById("e_contestParticipation").value),
        proctoredContest    : Number(document.getElementById("e_proctoredContest").value),
      };
    },

    compute() {
      const r = this.getValues();
      const c = calcScores(r);
      document.getElementById("res_T").textContent   = c.T.toFixed(1);
      document.getElementById("res_A").textContent   = c.A.toFixed(1);
      document.getElementById("res_C").textContent   = c.C.toFixed(1);
      document.getElementById("res_D").textContent   = c.D.toFixed(1);
      document.getElementById("res_WPI").textContent = c.WPI.toFixed(1);
      document.getElementById("res_Band").innerHTML  =
        `<span class="band-badge band-${c.band}" style="font-size:14px"><span class="dot dot-${c.band}"></span>${c.band}</span>`;

      const warn = document.getElementById("floorWarn");
      if (c.floorFails.length && c.WPI >= 75) {
        warn.innerHTML = `<div class="floor-rule-box">
          ⚠ <strong>Floor Score Rule triggered.</strong>
          WPI is ${c.WPI} (≥75) but band is downgraded to <strong>B</strong> because: ${c.floorFails.join(", ")}.
        </div>`;
      } else if (c.floorFails.length) {
        warn.innerHTML = `<div class="floor-rule-box">
          🚫 Floor minimums not met: <strong>${c.floorFails.join(", ")}</strong>.
          Minimum requirements: Technical ≥ 50, Aptitude ≥ 50, Communication ≥ 30.
        </div>`;
      } else {
        warn.innerHTML = "";
      }
    },

    save() {
      const sid = document.getElementById("entryStudentSel").value;
      if (!sid)            { toast("Please select a student.", "error"); return; }
      if (!DB.activeWeek)  { toast("No active week set. Create or select a week first.", "error"); return; }
      const r        = this.getValues();
      const computed = calcScores(r);
      const existing = DB.records.findIndex(rec => rec.studentId===sid && rec.week===DB.activeWeek);
      const record   = { id:uid(), studentId:sid, week:DB.activeWeek, ...r, computed };
      if (existing >= 0) DB.records[existing] = record;
      else DB.records.push(record);
      saveDB();
      const s = DB.students.find(s => s.id===sid) || {};
      toast(`✓ Saved for ${s.name} — WPI: ${computed.WPI.toFixed(1)} | Band ${computed.band}`, "success");
      document.getElementById("entryStudentSel").value = "";
      document.getElementById("entryFormWrap").style.display = "none";
    },

    clear() {
      document.getElementById("entryStudentSel").value = "";
      document.getElementById("entryFormWrap").style.display = "none";
    }
  },

  // ══════════════════════════════════════════════════════
  //  TRACKING SHEET
  // ══════════════════════════════════════════════════════
  tracking: {
    _sort: { col: 'week', dir: 'desc' },

    setSort(col) { applySortState(this._sort, col); this.render(); },

    render() {
      const wf   = document.getElementById("trackingWeekSel").value;
      const df   = document.getElementById("trackingDeptFilter").value;
      const bf   = document.getElementById("trackingBandFilter").value;
      const srch = (document.getElementById("trackingSearch").value || "").toLowerCase();

      // Filter
      let recs = DB.records.filter(r => {
        const s = DB.students.find(s => s.id===r.studentId);
        if (!s) return false;
        if (wf && r.week !== wf) return false;
        if (df && s.dept !== df)  return false;
        if (bf && r.computed.band !== bf) return false;
        if (srch && !s.name.toLowerCase().includes(srch) && !s.urn.toLowerCase().includes(srch)) return false;
        return true;
      });

      // Sort
      recs = sortRows(recs, this._sort.col, this._sort.dir, (r, col) => {
        const s = DB.students.find(st => st.id===r.studentId) || {};
        switch (col) {
          case 'urn':  return s.urn  || '';
          case 'name': return s.name || '';
          case 'dept': return s.dept || '';
          case 'week': return r.week;
          case 'T':    return r.computed.T;
          case 'A':    return r.computed.A;
          case 'C':    return r.computed.C;
          case 'D':    return r.computed.D;
          case 'wpi':  return r.computed.WPI;
          case 'band': return r.computed.band;
          default:     return '';
        }
      });

      document.getElementById("trackingCount").textContent = `${recs.length} record${recs.length!==1?"s":""}`;

      // Update thead with sort indicators
      const fn = "App.tracking.setSort";
      document.getElementById("trackingThead").innerHTML = `<tr>
        ${sortTh("URN No.", "urn",  this._sort, fn)}
        ${sortTh("Name",    "name", this._sort, fn)}
        ${sortTh("Dept",    "dept", this._sort, fn)}
        ${sortTh("Week",    "week", this._sort, fn)}
        ${sortTh("Tech (T)","T",    this._sort, fn)}
        ${sortTh("Apt. (A)","A",    this._sort, fn)}
        ${sortTh("Comm (C)","C",    this._sort, fn)}
        ${sortTh("Disc. (D)","D",   this._sort, fn)}
        ${sortTh("WPI",     "wpi",  this._sort, fn)}
        ${sortTh("Band",    "band", this._sort, fn)}
        <th>Trend</th>
        <th>Action Plan</th>
      </tr>`;

      const tbody = document.getElementById("trackingTbody");
      if (!recs.length) {
        tbody.innerHTML = `<tr><td colspan="12">${emptyCell("📋","No records found. Enter weekly scores to populate this sheet.")}</td></tr>`;
        return;
      }
      tbody.innerHTML = recs.map(r => {
        const s     = DB.students.find(st => st.id===r.studentId) || {};
        const trend = calcTrend(r.studentId);
        const hasFF = (r.computed.floorFails||[]).length > 0;
        return `<tr>
          <td><strong>${esc(s.urn)||"—"}</strong></td>
          <td><strong>${esc(s.name)||"—"}</strong></td>
          <td><span class="chip chip-dept">${s.dept||"—"}</span></td>
          <td><span class="week-pill">${r.week}</span></td>
          <td class="score-val ${r.computed.T<50?"floor-fail":""}">${r.computed.T.toFixed(1)}</td>
          <td class="score-val ${r.computed.A<50?"floor-fail":""}">${r.computed.A.toFixed(1)}</td>
          <td class="score-val ${r.computed.C<30?"floor-fail":""}">${r.computed.C.toFixed(1)}</td>
          <td class="score-val">${r.computed.D.toFixed(1)}</td>
          <td class="score-val">
            <strong>${r.computed.WPI.toFixed(1)}</strong>
            ${hasFF ? `<span style="color:var(--amber);margin-left:3px" data-tip="Floor score fail: ${(r.computed.floorFails).join(', ')}">⚠</span>` : ""}
          </td>
          <td><span class="band-badge band-${r.computed.band}"><span class="dot dot-${r.computed.band}"></span>${r.computed.band}</span></td>
          <td class="${trendCls(trend)}">${trend}</td>
          <td><span class="chip chip-action">${actionLabel(r.computed.band)}</span></td>
        </tr>`;
      }).join("");
    }
  },

  // ══════════════════════════════════════════════════════
  //  ANALYTICS
  // ══════════════════════════════════════════════════════
  analytics: {
    render() {
      App._populateEntryStudentList();
      this._trendLine();
      this._bandMigration();
      this._distHistogram();
      this._deptGroupedBar();
    },

    _trendLine() {
      const pts = DB.weeks.map(w => {
        const recs = DB.records.filter(r => r.week===w);
        return recs.length ? round1(recs.reduce((a,r) => a+r.computed.WPI,0)/recs.length) : null;
      });
      mkChart("chartTrendLine", {
        type: "line",
        data: {
          labels: DB.weeks,
          datasets: [
            { label:"Avg WPI", data:pts, borderColor:"#1565C0", backgroundColor:"rgba(21,101,192,0.1)",
              fill:true, tension:.35, pointRadius:5, pointBackgroundColor:"#1565C0" },
            { label:"Band A Threshold (75)", data: DB.weeks.map(()=>75),
              borderColor:"rgba(46,125,50,0.5)", borderDash:[6,4], pointRadius:0 },
            { label:"Band B Threshold (50)", data: DB.weeks.map(()=>50),
              borderColor:"rgba(198,40,40,0.4)", borderDash:[6,4], pointRadius:0 },
          ]
        },
        options: {
          responsive:true, maintainAspectRatio:false,
          plugins:{ legend:{ position:"top", labels:{ font:{size:11} } } },
          scales:{ y:{ min:0, max:100, grid:{ color:"#F0F4F8" } }, x:{ grid:{ display:false } } }
        }
      });
    },

    _bandMigration() {
      const data = DB.weeks.map(w => {
        const recs = DB.records.filter(r => r.week===w);
        return { w, A:recs.filter(r=>r.computed.band==="A").length,
                    B:recs.filter(r=>r.computed.band==="B").length,
                    C:recs.filter(r=>r.computed.band==="C").length };
      });
      mkChart("chartBandMig", {
        type: "bar",
        data: {
          labels: data.map(x => x.w),
          datasets: [
            { label:"Band A", data:data.map(x=>x.A), backgroundColor:"#2E7D32", borderRadius:3 },
            { label:"Band B", data:data.map(x=>x.B), backgroundColor:"#FF8F00", borderRadius:3 },
            { label:"Band C", data:data.map(x=>x.C), backgroundColor:"#C62828", borderRadius:3 },
          ]
        },
        options: {
          responsive:true, maintainAspectRatio:false,
          plugins:{ legend:{ position:"top" } },
          scales:{ x:{ stacked:true, grid:{ display:false } }, y:{ stacked:true, beginAtZero:true } }
        }
      });
    },

    _distHistogram() {
      const recs = DB.records.filter(r => r.week===DB.activeWeek);
      const bkts = { "0–20":0,"21–40":0,"41–50":0,"51–60":0,"61–70":0,"71–80":0,"81–90":0,"91–100":0 };
      recs.forEach(r => {
        const w = r.computed.WPI;
        if      (w<=20) bkts["0–20"]++;
        else if (w<=40) bkts["21–40"]++;
        else if (w<=50) bkts["41–50"]++;
        else if (w<=60) bkts["51–60"]++;
        else if (w<=70) bkts["61–70"]++;
        else if (w<=80) bkts["71–80"]++;
        else if (w<=90) bkts["81–90"]++;
        else            bkts["91–100"]++;
      });
      mkChart("chartDist", {
        type: "bar",
        data: {
          labels: Object.keys(bkts),
          datasets: [{ label:"No. of Students", data:Object.values(bkts),
            backgroundColor: Object.keys(bkts).map(k => {
              const mid = k.split("–").map(Number).reduce((a,b)=>a+b)/2;
              return mid>=75?"#2E7D32":mid>=50?"#FF8F00":"#C62828";
            }),
            borderRadius: 5 }]
        },
        options: {
          responsive:true, maintainAspectRatio:false,
          plugins:{ legend:{ display:false } },
          scales:{ y:{ beginAtZero:true, ticks:{stepSize:1}, grid:{color:"#F0F4F8"} }, x:{ grid:{display:false} } }
        }
      });
    },

    _deptGroupedBar() {
      const depts = [...new Set(DB.students.map(s => s.dept))].sort();
      const recs  = DB.records.filter(r => r.week===DB.activeWeek);
      const getAvg = (dept, key) => {
        const dr = recs.filter(r => { const s=DB.students.find(s=>s.id===r.studentId); return s&&s.dept===dept; });
        return dr.length ? round1(dr.reduce((a,r)=>a+r.computed[key],0)/dr.length) : 0;
      };
      mkChart("chartDeptGrouped", {
        type: "bar",
        data: {
          labels: depts,
          datasets: [
            { label:"Technical",      data:depts.map(d=>getAvg(d,"T")), backgroundColor:"#1565C0", borderRadius:3 },
            { label:"Aptitude",       data:depts.map(d=>getAvg(d,"A")), backgroundColor:"#2E7D32", borderRadius:3 },
            { label:"Communication",  data:depts.map(d=>getAvg(d,"C")), backgroundColor:"#FF8F00", borderRadius:3 },
            { label:"Discipline",     data:depts.map(d=>getAvg(d,"D")), backgroundColor:"#6A1B9A", borderRadius:3 },
          ]
        },
        options: {
          responsive:true, maintainAspectRatio:false,
          plugins:{ legend:{ position:"top", labels:{ font:{size:11} } } },
          scales:{ y:{ beginAtZero:true, max:100, grid:{color:"#F0F4F8"} }, x:{ grid:{display:false} } }
        }
      });
    },

    studentHistory() {
      const sid  = document.getElementById("analyticsStudentSel").value;
      const wrap = document.getElementById("studentHistoryWrap");
      if (!sid) { if(CH["chartStudHist"]) { CH["chartStudHist"].destroy(); } return; }
      wrap.style.display = "block";
      const recs = DB.records.filter(r => r.studentId===sid).sort((a,b) => a.week.localeCompare(b.week)).slice(-8);
      mkChart("chartStudHist", {
        type: "line",
        data: {
          labels: recs.map(r => r.week),
          datasets: [
            { label:"WPI",           data:recs.map(r=>r.computed.WPI), borderColor:"#1565C0", backgroundColor:"rgba(21,101,192,0.08)", fill:true, tension:.3, pointRadius:5 },
            { label:"Technical",     data:recs.map(r=>r.computed.T),   borderColor:"#2E7D32", tension:.3, pointRadius:3 },
            { label:"Aptitude",      data:recs.map(r=>r.computed.A),   borderColor:"#FF8F00", tension:.3, pointRadius:3 },
            { label:"Communication", data:recs.map(r=>r.computed.C),   borderColor:"#C62828", tension:.3, pointRadius:3 },
            { label:"Discipline",    data:recs.map(r=>r.computed.D),   borderColor:"#6A1B9A", tension:.3, pointRadius:3 },
          ]
        },
        options: {
          responsive:true, maintainAspectRatio:false,
          plugins:{ legend:{ position:"top", labels:{ font:{size:11} } } },
          scales:{ y:{ min:0, max:100 }, x:{ grid:{display:false} } }
        }
      });
    }
  },

  // ══════════════════════════════════════════════════════
  //  INTERVENTIONS
  // ══════════════════════════════════════════════════════
  interventions: {
    render() {
      const w    = DB.activeWeek;
      const recs = DB.records.filter(r => r.week===w);

      // Band C
      const crit = recs.filter(r => r.computed.band==="C");
      document.getElementById("intCritical").innerHTML = crit.length
        ? crit.map(r => { const s=DB.students.find(st=>st.id===r.studentId)||{};
            return `<div class="alert alert-red">
              <span class="alert-icon">🔴</span>
              <div><strong>${esc(s.name)}</strong> (${esc(s.urn)}) · ${s.dept}
                <br><small>WPI: ${r.computed.WPI.toFixed(1)} · T:${r.computed.T.toFixed(1)} · A:${r.computed.A.toFixed(1)} · C:${r.computed.C.toFixed(1)} · D:${r.computed.D.toFixed(1)}</small>
                <br><small><em>Action: Min 3 extra practice hrs/week · FPC counselling · Weekly reassessment</em></small>
              </div></div>`;}).join("")
        : `<div class="alert alert-green"><span class="alert-icon">✅</span><div>No critical students this week.</div></div>`;

      // Oscillating
      const osc = DB.students.filter(s => calcTrend(s.id)==="⚠");
      document.getElementById("intOscillating").innerHTML = osc.length
        ? osc.map(s => { const r=DB.records.filter(rec=>rec.studentId===s.id).sort((a,b)=>b.week.localeCompare(a.week))[0];
            return `<div class="alert alert-amber">
              <span class="alert-icon">⚠</span>
              <div><strong>${esc(s.name)}</strong> (${s.dept}) · Band oscillating for 3+ weeks
                <br><small>Latest WPI: ${r?r.computed.WPI.toFixed(1):"—"} · Formal intervention plan must be triggered</small>
              </div></div>`;}).join("")
        : `<div class="alert alert-green"><span class="alert-icon">✅</span><div>No oscillating students detected.</div></div>`;

      // Absentees
      const abs = recs.filter(r => r.attendance!==null && r.attendance!==undefined && Number(r.attendance)<75);
      document.getElementById("intAbsentees").innerHTML = abs.length
        ? abs.map(r => { const s=DB.students.find(st=>st.id===r.studentId)||{};
            return `<div class="alert alert-amber">
              <span class="alert-icon">📅</span>
              <div><strong>${esc(s.name)}</strong> · Attendance: <strong>${r.attendance}%</strong>
                <br><small>Minimum required: 75% · Governance compliance action required</small>
              </div></div>`;}).join("")
        : `<div class="alert alert-green"><span class="alert-icon">✅</span><div>No chronic absentees this week.</div></div>`;

      // Floor failures
      const flr = recs.filter(r => (r.computed.floorFails||[]).length > 0);
      document.getElementById("intFloorFail").innerHTML = flr.length
        ? flr.map(r => { const s=DB.students.find(st=>st.id===r.studentId)||{};
            return `<div class="alert alert-red">
              <span class="alert-icon">🚫</span>
              <div><strong>${esc(s.name)}</strong> · WPI: ${r.computed.WPI.toFixed(1)} → Band: <strong>${r.computed.band}</strong>
                <br><small>Floor fails: ${(r.computed.floorFails).join(" · ")}</small>
              </div></div>`;}).join("")
        : `<div class="alert alert-green"><span class="alert-icon">✅</span><div>All students meet floor score benchmarks.</div></div>`;

      // B-band moderate count
      const bBand = recs.filter(r => r.computed.band==="B");
      document.getElementById("intBCount").textContent = bBand.length;
    }
  },
};

// ── DOM Helpers ───────────────────────────────────────────
function emptyRow(msg="No data available") {
  return `<div class="empty-state"><div class="empty-state-icon">📊</div><div class="empty-state-sub">${msg}</div></div>`;
}
function emptyCell(icon, msg) {
  return `<div class="empty-state"><div class="empty-state-icon">${icon}</div><div class="empty-state-title">No data</div><div class="empty-state-sub">${msg}</div></div>`;
}
function trendCls(t) {
  if (t==="↑") return "trend-up";
  if (t==="↓") return "trend-down";
  if (t==="⚠") return "trend-osc";
  return "trend-stable";
}
function esc(s) {
  if (!s) return "";
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// ══════════════════════════════════════════════════════════
//  CONTEST PARTICIPATION
// ══════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════
App.contest = {

  _modes:    { 1: 'absent', 2: 'absent' },   // 'present' | 'absent' per contest
  _sortC1:   { col: 'name', dir: 'asc' },
  _sortC2:   { col: 'name', dir: 'asc' },
  _sortBoth: { col: 'name', dir: 'asc' },

  toggleView(n, mode) { this._modes[n] = mode; this.render(); },
  setSortC1(col)   { applySortState(this._sortC1,   col); this.render(); },
  setSortC2(col)   { applySortState(this._sortC2,   col); this.render(); },
  setSortBoth(col) { applySortState(this._sortBoth, col); this.render(); },

  render() {
    // Populate week & dept selects
    const weekSel = document.getElementById("contestWeekSel");
    const deptSel = document.getElementById("contestDeptSel");

    // Sync week options
    const weekOpts = `<option value="">All Weeks</option>` +
      DB.weeks.slice().reverse().map(w =>
        `<option value="${w}" ${w === DB.activeWeek ? "selected" : ""}>${w}</option>`
      ).join("");
    if (weekSel.innerHTML !== weekOpts) weekSel.innerHTML = weekOpts;

    // Sync dept options
    const depts = [...new Set(DB.students.map(s => s.dept))].sort();
    const deptOpts = `<option value="">All Departments</option>` + depts.map(d => `<option>${d}</option>`).join("");
    if (deptSel.options.length !== depts.length + 1) deptSel.innerHTML = deptOpts;

    const selWeek = weekSel.value || DB.activeWeek;
    const selDept = deptSel.value;
    const c1q     = (document.getElementById("c1Search").value || "").toLowerCase();
    const c2q     = (document.getElementById("c2Search").value || "").toLowerCase();

    document.getElementById("contestWeekSub").textContent =
      selWeek ? `Week: ${selWeek}` : "Showing all weeks";

    // Get records for the selected week
    const weekRecs = DB.records.filter(r => !selWeek || r.week === selWeek);

    // Map studentId → latest record (for multi-week "all weeks" mode, take latest)
    const recByStudent = {};
    weekRecs.forEach(r => {
      if (!recByStudent[r.studentId] || r.week > recByStudent[r.studentId].week)
        recByStudent[r.studentId] = r;
    });

    // Apply dept filter to students
    const students = DB.students.filter(s => !selDept || s.dept === selDept);
    const total    = students.length;

    // Partition
    const participated1  = [];   // participated in University Contest
    const notParticipated1 = []; // did NOT participate
    const participated2  = [];   // participated in Proctored Contest
    const notParticipated2 = []; // did NOT participate
    const noData         = [];   // no record at all

    students.forEach(s => {
      const rec = recByStudent[s.id];
      if (!rec) { noData.push(s); return; }
      if (num(rec.contestParticipation) === 1) participated1.push({s, rec});
      else                                     notParticipated1.push({s, rec});
      if (num(rec.proctoredContest) === 1)     participated2.push({s, rec});
      else                                     notParticipated2.push({s, rec});
    });

    // ── KPI rows (3 rows × 2 cards) ──────────────────────
    const withData = total - noData.length;
    const kpiCard = (label, val, sub, cls) =>
      `<div class="kpi-card ${cls}">
         <div class="kpi-label">${label}</div>
         <div class="kpi-value" style="font-size:28px">${val}</div>
         <div class="kpi-sub">${sub}</div>
       </div>`;
    const bothAbsentCount = students.filter(s => {
      const rec = recByStudent[s.id];
      return rec && num(rec.contestParticipation) !== 1 && num(rec.proctoredContest) !== 1;
    }).length;
    document.getElementById("contestKPIs").innerHTML =
      `<div class="g2" style="margin-bottom:12px">
         ${kpiCard("Total Students",          total,                    "in selection",                                     "kpi-blue")}
         ${kpiCard("🚫 Missed Both Contests", bothAbsentCount,          `${pct(bothAbsentCount,withData)}% missed both`,     "kpi-red")}
       </div>
       <div class="g2" style="margin-bottom:12px">
         ${kpiCard("University Contest ✅",   participated1.length,    `${pct(participated1.length,withData)}% participated`, "kpi-green")}
         ${kpiCard("University Contest ❌",   notParticipated1.length, `${pct(notParticipated1.length,withData)}% absent`,    "kpi-red")}
       </div>
       <div class="g2" style="margin-bottom:0">
         ${kpiCard("Proctored Contest ✅",    participated2.length,    `${pct(participated2.length,withData)}% participated`, "kpi-green")}
         ${kpiCard("Proctored Contest ❌",    notParticipated2.length, `${pct(notParticipated2.length,withData)}% absent`,    "kpi-red")}
       </div>`;

    // ── Contest 1 bar + toggle ─────────────────────────
    const p1 = withData > 0 ? pct(participated1.length, withData) : 0;
    const m1 = this._modes[1];
    document.getElementById("c1NotCount").textContent  = m1 === 'present' ? participated1.length    : notParticipated1.length;
    document.getElementById("c1CountLabel").textContent= m1 === 'present' ? "Participated"           : "Not Participated";
    document.getElementById("c1YesPct").textContent    = `${participated1.length} participated`;
    document.getElementById("c1NoPct").textContent     = `${notParticipated1.length} absent`;
    document.getElementById("c1Bar").style.width       = p1 + "%";
    document.getElementById("c1BtnPresent").className  = "contest-toggle-btn" + (m1 === 'present' ? " active-present" : "");
    document.getElementById("c1BtnAbsent").className   = "contest-toggle-btn" + (m1 === 'absent'  ? " active-absent"  : "");

    // ── Contest 2 bar + toggle ─────────────────────────
    const p2 = withData > 0 ? pct(participated2.length, withData) : 0;
    const m2 = this._modes[2];
    document.getElementById("c2NotCount").textContent  = m2 === 'present' ? participated2.length    : notParticipated2.length;
    document.getElementById("c2CountLabel").textContent= m2 === 'present' ? "Participated"           : "Not Participated";
    document.getElementById("c2YesPct").textContent    = `${participated2.length} participated`;
    document.getElementById("c2NoPct").textContent     = `${notParticipated2.length} absent`;
    document.getElementById("c2Bar").style.width       = p2 + "%";
    document.getElementById("c2BtnPresent").className  = "contest-toggle-btn" + (m2 === 'present' ? " active-present" : "");
    document.getElementById("c2BtnAbsent").className   = "contest-toggle-btn" + (m2 === 'absent'  ? " active-absent"  : "");

    // ── Render tables (respect toggle mode + sort) ────
    this._renderTable("c1Thead", "c1Tbody", m1==='present'?participated1:notParticipated1, c1q, this._sortC1,  "App.contest.setSortC1");
    this._renderTable("c2Thead", "c2Tbody", m2==='present'?participated2:notParticipated2, c2q, this._sortC2,  "App.contest.setSortC2");

    // ── Both absent ────────────────────────────────────
    let bothAbsent = students
      .filter(s => {
        const rec = recByStudent[s.id];
        return rec && num(rec.contestParticipation) !== 1 && num(rec.proctoredContest) !== 1;
      })
      .map(s => ({ s, rec: recByStudent[s.id] }));

    // Sort bothAbsent
    bothAbsent = sortRows(bothAbsent, this._sortBoth.col, this._sortBoth.dir, (item, col) => {
      if (col === 'urn')  return item.s.urn;
      if (col === 'name') return item.s.name;
      if (col === 'dept') return item.s.dept;
      if (col === 'wpi')  return item.rec ? item.rec.computed.WPI : -1;
      if (col === 'band') return item.rec ? item.rec.computed.band : '';
      if (col === 'att')  return item.rec ? Number(item.rec.attendance) || 0 : 0;
      return '';
    });

    document.getElementById("bothAbsentCount").textContent = bothAbsent.length;
    const bothEl = document.getElementById("bothAbsentList");
    if (!bothAbsent.length) {
      bothEl.innerHTML = `<div class="alert alert-green"><span class="alert-icon">✅</span><div>No students missed both contests this week.</div></div>`;
    } else {
      const fn = "App.contest.setSortBoth";
      const st = this._sortBoth;
      bothEl.innerHTML = `
        <div class="table-container">
        <div class="table-scroll"><table>
          <thead><tr>
            <th>#</th>
            ${sortTh("URN No.",     "urn",  st, fn)}
            ${sortTh("Name",        "name", st, fn)}
            ${sortTh("Dept",        "dept", st, fn)}
            ${sortTh("WPI",         "wpi",  st, fn)}
            <th>Band</th>
            ${sortTh("Attendance",  "att",  st, fn)}
            <th>Action</th>
          </tr></thead>
          <tbody>
          ${bothAbsent.map(({s, rec}, i) => `<tr>
            <td>${i+1}</td>
            <td><strong>${esc(s.urn)}</strong></td>
            <td>${esc(s.name)}</td>
            <td><span class="chip chip-dept">${s.dept}</span></td>
            <td class="score-val">${rec ? rec.computed.WPI.toFixed(1) : "—"}</td>
            <td>${rec ? `<span class="band-badge band-${rec.computed.band}">${rec.computed.band}</span>` : "—"}</td>
            <td>${rec ? `${rec.attendance}%` : "—"}</td>
            <td><span class="chip chip-action">Immediate Follow-up</span></td>
          </tr>`).join("")}
          </tbody>
        </table></div></div>`;
    }

    // ── No Data this week ──────────────────────────────
    const noDataEl = document.getElementById("noDataList");
    document.getElementById("noDataCount").textContent = noData.length;
    if (!noData.length) {
      noDataEl.innerHTML = `<div style="padding:12px;font-size:13px;color:var(--text-muted);text-align:center">All students have data entries for this week ✓</div>`;
    } else {
      noDataEl.innerHTML = noData.map(s => `
        <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border)">
          <div style="flex:1">
            <div style="font-weight:600;font-size:13px">${esc(s.name)}</div>
            <div style="font-size:11px;color:var(--text-muted)">${esc(s.urn)} · <span class="chip chip-dept" style="font-size:10px">${s.dept}</span></div>
          </div>
          <span class="chip" style="background:var(--amber-bg);color:var(--amber);border-color:#FFE082">No record</span>
        </div>`).join("").replace(/<div style="display:flex[^>]+>(.|\n)*?<\/div>\s*$/, match => match.replace('border-bottom:1px solid var(--border)', 'border-bottom:none'));
    }

    // ── Dept-wise chart ────────────────────────────────
    this._renderDeptChart(students, recByStudent);
  },

  _renderTable(theadId, tbodyId, list, query, sortState, handler) {
    // Sort
    const sorted = sortRows(list, sortState.col, sortState.dir, (item, col) => {
      if (col === 'urn')  return item.s.urn;
      if (col === 'name') return item.s.name;
      if (col === 'dept') return item.s.dept;
      if (col === 'wpi')  return item.rec ? item.rec.computed.WPI : -1;
      if (col === 'band') return item.rec ? item.rec.computed.band : '';
      if (col === 'att')  return item.rec ? Number(item.rec.attendance) || 0 : 0;
      return '';
    });

    // Filter by search query
    const filtered = sorted.filter(({s}) =>
      !query || s.name.toLowerCase().includes(query) || s.urn.toLowerCase().includes(query)
    );

    // Update thead
    document.getElementById(theadId).innerHTML = `<tr>
      <th>#</th>
      ${sortTh("URN No.",    "urn",  sortState, handler)}
      ${sortTh("Name",       "name", sortState, handler)}
      ${sortTh("Dept",       "dept", sortState, handler)}
      ${sortTh("WPI",        "wpi",  sortState, handler)}
      ${sortTh("Band",       "band", sortState, handler)}
      ${sortTh("Attendance", "att",  sortState, handler)}
    </tr>`;

    const tbody = document.getElementById(tbodyId);
    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="7">
        <div class="empty-state" style="padding:24px">
          <div class="empty-state-icon" style="font-size:32px">✅</div>
          <div class="empty-state-title" style="font-size:13px">
            ${list.length === 0
              ? "All students participated!"
              : `No results for "${query}"`}
          </div>
        </div>
      </td></tr>`;
      return;
    }
    tbody.innerHTML = filtered.map(({s, rec}, i) => `
      <tr>
        <td>${i+1}</td>
        <td><strong>${esc(s.urn)}</strong></td>
        <td>${esc(s.name)}</td>
        <td><span class="chip chip-dept">${s.dept}</span></td>
        <td class="score-val">${rec.computed.WPI.toFixed(1)}</td>
        <td><span class="band-badge band-${rec.computed.band}">${rec.computed.band}</span></td>
        <td>
          <span style="color:${num(rec.attendance)<75?"var(--red)":"var(--text)"};font-weight:${num(rec.attendance)<75?700:400}">
            ${rec.attendance !== null && rec.attendance !== undefined ? rec.attendance + "%" : "—"}
          </span>
        </td>
      </tr>`).join("");
  },

  _renderDeptChart(students, recByStudent) {
    const depts = [...new Set(students.map(s => s.dept))].sort();
    const c1Rate = depts.map(d => {
      const ds  = students.filter(s => s.dept === d);
      const with_data = ds.filter(s => recByStudent[s.id]);
      const yes = with_data.filter(s => num(recByStudent[s.id]?.contestParticipation) === 1).length;
      return with_data.length ? round1(yes / with_data.length * 100) : 0;
    });
    const c2Rate = depts.map(d => {
      const ds  = students.filter(s => s.dept === d);
      const with_data = ds.filter(s => recByStudent[s.id]);
      const yes = with_data.filter(s => num(recByStudent[s.id]?.proctoredContest) === 1).length;
      return with_data.length ? round1(yes / with_data.length * 100) : 0;
    });

    mkChart("chartContestDept", {
      type: "bar",
      data: {
        labels: depts,
        datasets: [
          { label: "University Contest (%)", data: c1Rate, backgroundColor: "#1565C0", borderRadius: 4 },
          { label: "Proctored Contest (%)",  data: c2Rate, backgroundColor: "#6A1B9A", borderRadius: 4 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: "top", labels: { font: { size: 11 } } } },
        scales: {
          y: { beginAtZero: true, max: 100, ticks: { callback: v => v + "%" }, grid: { color: "#F0F4F8" } },
          x: { grid: { display: false } },
        },
      },
    });
  },

  exportNonParticipants() {
    const week = document.getElementById("contestWeekSel").value || DB.activeWeek;
    const recs = DB.records.filter(r => !week || r.week === week);
    const recByStudent = {};
    recs.forEach(r => { if (!recByStudent[r.studentId] || r.week > recByStudent[r.studentId].week) recByStudent[r.studentId] = r; });

    const rows = DB.students.map(s => {
      const rec = recByStudent[s.id];
      return [
        s.urn, s.name, s.dept,
        week,
        rec ? (num(rec.contestParticipation) === 1 ? "Yes" : "No") : "No Data",
        rec ? (num(rec.proctoredContest)      === 1 ? "Yes" : "No") : "No Data",
        rec ? rec.computed.WPI.toFixed(1) : "—",
        rec ? rec.computed.band : "—",
        rec ? (rec.attendance ?? "—") : "—",
      ];
    });

    const hdr = ["URN_No","Name","Department","Week","University_Contest","Proctored_Contest","WPI","Band","Attendance_Pct"];
    const csv = [hdr, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const a   = document.createElement("a");
    a.href    = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download= `Contest_Participation_${week || "all"}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    toast("Contest participation data exported!", "success");
  },
};

// ══════════════════════════════════════════════════════════
//  STUDENT ONBOARDING IMPORTER
// ══════════════════════════════════════════════════════════
App.studentImporter = {

  _parsed: [],   // rows from uploaded file

  // ── Normalise header ───────────────────────────────────
  _norm(h) {
    return String(h).toLowerCase().trim().replace(/[\s\-\/\(\)]+/g, "_").replace(/_+/g, "_");
  },

  _matchCol(h) {
    const n = this._norm(h);
    if (["urn_no","urn","roll_no","rollno","reg_no","regno","id","student_id"].some(a => n===a || n.includes(a))) return "urn";
    if (["name","student_name","full_name","fullname"].some(a => n===a || n.includes(a))) return "name";
    if (["department","dept","branch","stream"].some(a => n===a || n.includes(a)))        return "dept";
    if (["email","email_id","mail","emailaddress"].some(a => n===a || n.includes(a)))     return "email";
    return null;
  },

  // ── Step navigation ────────────────────────────────────
  close() {
    closeModal("studentImportModal");
    setTimeout(() => this.goToStep1(), 300);
  },

  goToStep1() {
    this._parsed = [];
    document.getElementById("si_fileInput").value = "";
    document.getElementById("si_uploadInfo").style.display  = "none";
    document.getElementById("si_uploadError").style.display = "none";
    document.getElementById("si_previewBtn").style.display  = "none";
    this._setStep(1);
    document.getElementById("siCurrentCount").textContent = DB.students.length;
  },

  goToStep2() { this._setStep(2); },

  goToStep3() {
    if (!this._parsed.length) { toast("No data to preview.", "error"); return; }
    this._setStep(3);
    this._renderPreview();
  },

  _setStep(n) {
    [1,2,3].forEach(i => {
      document.getElementById("si_step"+i).style.display = (i===n) ? "block" : "none";
      const ind = document.getElementById("si_step"+i+"Ind");
      ind.className = "import-step" +
        (i < n ? " import-step-done" : i===n ? " import-step-active" : "");
      ind.querySelector(".import-step-num").textContent = (i < n) ? "✓" : String(i);
    });
  },

  // ── Download blank template ────────────────────────────
  downloadTemplate() {
    if (!window.XLSX) { toast("Excel library not loaded yet.", "error"); return; }

    const headers = ["URN_No", "Name", "Department", "Email"];
    const examples = [
      ["21R24A0101", "Aarav Sharma",   "CSE",  "aarav.sharma@college.edu"],
      ["21R24A0102", "Priya Nair",     "IT",   "priya.nair@college.edu"],
      ["21R24A0103", "Karthik Rajan",  "ECE",  "karthik.rajan@college.edu"],
    ];

    // If roster already has students, pre-fill them so admin can manage the list
    const dataRows = DB.students.length
      ? DB.students
          .sort((a,b) => a.dept.localeCompare(b.dept) || a.name.localeCompare(b.name))
          .map(s => [s.urn, s.name, s.dept, s.email || ""])
      : examples;

    const wb  = XLSX.utils.book_new();

    // ── Sheet 1: Roster ────────────────────────────────
    const wsData = [headers, ...dataRows];
    const ws     = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"]  = [{wch:18},{wch:26},{wch:14},{wch:34}];
    XLSX.utils.book_append_sheet(wb, ws, "Student_Roster");

    // ── Sheet 2: Instructions ──────────────────────────
    const infoRows = [
      ["R24 Batch – WPI Tracker | Student Onboarding Template"],
      [""],
      ["INSTRUCTIONS"],
      ["1. Fill student details in the 'Student_Roster' sheet."],
      ["2. URN_No is the unique identifier — do not repeat URNs."],
      ["3. Name and Department are required. Email is optional."],
      ["4. Valid departments: CSE, IT, ECE, EEE, MECH, CIVIL, AIDS, AIML, CSD, MBA, Other"],
      ["5. If a URN already exists in the app, you can choose to skip or update it during import."],
      ["6. Save the file and upload it in the WPI Tracker → Students → Import Students from Excel."],
      [""],
      ["DEPARTMENT CODES"],
      ["CSE  → Computer Science & Engineering"],
      ["IT   → Information Technology"],
      ["ECE  → Electronics & Communication Engineering"],
      ["EEE  → Electrical & Electronics Engineering"],
      ["MECH → Mechanical Engineering"],
      ["CIVIL→ Civil Engineering"],
      ["AIDS → Artificial Intelligence & Data Science"],
      ["AIML → Artificial Intelligence & Machine Learning"],
      ["CSD  → Computer Science & Design"],
      ["MBA  → Master of Business Administration"],
    ];
    const wsInfo = XLSX.utils.aoa_to_sheet(infoRows);
    wsInfo["!cols"] = [{wch:70}];
    XLSX.utils.book_append_sheet(wb, wsInfo, "Instructions");

    XLSX.writeFile(wb, `Student_Roster_Template_${new Date().toISOString().slice(0,10)}.xlsx`);
    toast("Student template downloaded!", "success");
  },

  // ── Drag-and-drop ──────────────────────────────────────
  onDragOver(e)  { e.preventDefault(); document.getElementById("si_dropZone").classList.add("drop-active"); },
  onDragLeave()  { document.getElementById("si_dropZone").classList.remove("drop-active"); },
  onDrop(e)      { e.preventDefault(); document.getElementById("si_dropZone").classList.remove("drop-active"); const f=e.dataTransfer.files[0]; if(f) this._readFile(f); },
  onFileSelect(e){ const f=e.target.files[0]; if(f) this._readFile(f); },

  // ── Parse file ─────────────────────────────────────────
  _readFile(file) {
    const errEl  = document.getElementById("si_uploadError");
    const infoEl = document.getElementById("si_uploadInfo");
    errEl.style.display  = "none";
    infoEl.style.display = "none";

    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      errEl.innerHTML = `<div class="alert alert-red"><span class="alert-icon">✗</span><div>Invalid file type. Please upload a .xlsx or .xls file.</div></div>`;
      errEl.style.display = "block"; return;
    }

    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const wb  = XLSX.read(new Uint8Array(ev.target.result), { type:"array" });
        // Use first sheet that isn't "Instructions"
        const wsName = wb.SheetNames.find(n => !n.toLowerCase().includes("instruction")) || wb.SheetNames[0];
        const ws     = wb.Sheets[wsName];
        const raw    = XLSX.utils.sheet_to_json(ws, { header:1, defval:"" });
        if (raw.length < 2) throw new Error("File has no data rows.");

        // Find header row
        let headerIdx = -1;
        for (let i = 0; i < Math.min(raw.length, 5); i++) {
          if (raw[i].some(c => this._norm(String(c)).includes("urn") || this._norm(String(c)).includes("name"))) {
            headerIdx = i; break;
          }
        }
        if (headerIdx < 0) throw new Error("Could not find a header row with URN_No or Name columns.");

        const headers   = raw[headerIdx].map(h => String(h));
        const colIdx    = {};
        headers.forEach((h, i) => { const f = this._matchCol(h); if (f) colIdx[f] = i; });

        if (!("urn" in colIdx))  throw new Error("'URN_No' column not found.");
        if (!("name" in colIdx)) throw new Error("'Name' column not found.");
        if (!("dept" in colIdx)) throw new Error("'Department' column not found.");

        const rows = [];
        for (let i = headerIdx + 1; i < raw.length; i++) {
          const row = raw[i];
          const urn  = String(row[colIdx.urn]  ?? "").trim();
          const name = String(row[colIdx.name] ?? "").trim();
          const dept = String(row[colIdx.dept] ?? "").trim();
          if (!urn && !name) continue;           // blank row
          rows.push({
            urn,
            name,
            dept,
            email: colIdx.email !== undefined ? String(row[colIdx.email] ?? "").trim() : "",
          });
        }
        if (!rows.length) throw new Error("No data rows found after the header.");

        this._parsed = rows;
        const newCount  = rows.filter(r => !DB.students.find(s => s.urn === r.urn)).length;
        const dupCount  = rows.length - newCount;
        const invalids  = rows.filter(r => !r.urn || !r.name || !r.dept).length;

        infoEl.innerHTML = `
          <div class="alert alert-green">
            <span class="alert-icon">✓</span>
            <div>
              <strong>File parsed!</strong> ${rows.length} rows found —
              <span style="color:var(--green);font-weight:600">${newCount} new</span>,
              <span style="color:var(--blue);font-weight:600">${dupCount} already exist</span>
              ${invalids ? `, <span style="color:var(--red);font-weight:600">${invalids} invalid (missing fields)</span>` : ""}.
              <br><small>Sheet: "${wsName}" · ${file.name}</small>
            </div>
          </div>`;
        infoEl.style.display = "block";
        document.getElementById("si_previewBtn").style.display = "inline-flex";

      } catch(err) {
        errEl.innerHTML = `<div class="alert alert-red"><span class="alert-icon">✗</span><div><strong>Parse error:</strong> ${esc(err.message)}</div></div>`;
        errEl.style.display = "block";
        document.getElementById("si_previewBtn").style.display = "none";
      }
    };
    reader.readAsArrayBuffer(file);
  },

  // ── Render preview ─────────────────────────────────────
  _renderPreview() {
    const dupAction = (document.querySelector('input[name="dupAction"]:checked') || {}).value || "skip";
    const VALID_DEPTS = ["CSE","IT","ECE","EEE","MECH","CIVIL","AIDS","AIML","CSD","MBA","OTHER"];

    let newCount=0, updateCount=0, skipCount=0, invalidCount=0;
    const dupOptionEl = document.getElementById("si_dupOption");

    const hasDups = this._parsed.some(r => DB.students.find(s => s.urn === r.urn));
    dupOptionEl.style.display = hasDups ? "block" : "none";

    const rows = this._parsed.map((r, idx) => {
      const existing   = DB.students.find(s => s.urn === r.urn);
      const missingUrn = !r.urn;
      const missingName= !r.name;
      const missingDept= !r.dept;
      const badDept    = r.dept && !VALID_DEPTS.includes(r.dept.toUpperCase());
      const isInvalid  = missingUrn || missingName || missingDept;

      let status, rowClass, statusBadge;

      if (isInvalid) {
        invalidCount++;
        const missing = [missingUrn&&"URN", missingName&&"Name", missingDept&&"Dept"].filter(Boolean);
        status     = "invalid";
        rowClass   = "row-unmatched";
        statusBadge= `<span style="color:var(--red);font-size:12px">✗ Missing: ${missing.join(", ")}</span>`;
      } else if (existing) {
        if (dupAction === "skip") {
          skipCount++;
          status     = "skip";
          rowClass   = "";
          statusBadge= `<span style="color:var(--text-muted);font-size:12px">⏭ Skip (already exists)</span>`;
        } else {
          updateCount++;
          status     = "update";
          rowClass   = "row-floor";
          statusBadge= `<span style="color:var(--blue);font-size:12px">🔄 Update existing</span>`;
        }
      } else {
        newCount++;
        status     = "new";
        rowClass   = "row-matched";
        statusBadge= `<span style="color:var(--green);font-size:12px">🆕 New student</span>`;
      }

      const deptDisplay = r.dept
        ? `<span class="chip chip-dept${badDept?" is-warning":""}">${esc(r.dept)}${badDept?" ⚠":""}</span>`
        : `<span style="color:var(--red)">—</span>`;

      return `<tr class="${rowClass}" data-status="${status}">
        <td>${idx+1}</td>
        <td><strong>${esc(r.urn)||'<span style="color:var(--red)">MISSING</span>'}</strong></td>
        <td>${esc(r.name)||'<span style="color:var(--red)">MISSING</span>'}</td>
        <td>${deptDisplay}</td>
        <td style="color:var(--text-muted)">${esc(r.email)||"—"}</td>
        <td>${statusBadge}</td>
      </tr>`;
    });

    document.getElementById("si_previewTbody").innerHTML = rows.join("");
    document.getElementById("si_previewCount").textContent = this._parsed.length;

    const actionable = newCount + updateCount;
    document.getElementById("si_confirmBtn").disabled = actionable === 0;
    document.getElementById("si_actionSummary").innerHTML =
      `<span style="color:var(--green);font-weight:600">${newCount} new</span>` +
      (updateCount ? ` · <span style="color:var(--blue);font-weight:600">${updateCount} update</span>` : "") +
      (skipCount   ? ` · <span style="color:var(--text-muted)">${skipCount} skip</span>` : "") +
      (invalidCount? ` · <span style="color:var(--red)">${invalidCount} invalid</span>` : "");

    document.getElementById("si_summaryBanner").innerHTML = `
      <div class="alert ${actionable>0?"alert-blue":"alert-red"}">
        <span class="alert-icon">${actionable>0?"👥":"⚠"}</span>
        <div>
          <strong>${actionable} student${actionable!==1?"s":""} will be onboarded.</strong>
          ${newCount    ? ` ${newCount} new student${newCount!==1?"s":""} added.` : ""}
          ${updateCount ? ` ${updateCount} existing record${updateCount!==1?"s":""} updated.` : ""}
          ${skipCount   ? ` ${skipCount} skipped.` : ""}
          ${invalidCount? `<br><small style="color:var(--red)">${invalidCount} rows skipped due to missing required fields.</small>` : ""}
        </div>
      </div>`;
  },

  // ── Confirm import ─────────────────────────────────────
  confirmImport() {
    const dupAction = (document.querySelector('input[name="dupAction"]:checked') || {}).value || "skip";
    const VALID_DEPTS = ["CSE","IT","ECE","EEE","MECH","CIVIL","AIDS","AIML","CSD","MBA","OTHER"];
    let added=0, updated=0, skipped=0;

    this._parsed.forEach(r => {
      if (!r.urn || !r.name || !r.dept) return;   // skip invalid
      const dept     = VALID_DEPTS.includes(r.dept.toUpperCase()) ? r.dept.toUpperCase() : r.dept;
      const existing = DB.students.find(s => s.urn === r.urn);

      if (existing) {
        if (dupAction === "update") {
          Object.assign(existing, { name:r.name, dept, email:r.email||existing.email||"" });
          updated++;
        } else {
          skipped++;
        }
      } else {
        DB.students.push({ id:uid(), urn:r.urn, name:r.name, dept, email:r.email||"" });
        added++;
      }
    });

    saveDB();
    App.students.render();
    App._populateEntryStudentList();
    App._populateDeptFilters();
    this.close();

    const parts = [];
    if (added)   parts.push(`${added} student${added!==1?"s":""} added`);
    if (updated) parts.push(`${updated} updated`);
    if (skipped) parts.push(`${skipped} skipped`);
    toast(`✓ ${parts.join(" · ")}!`, "success");
  },
};

// ══════════════════════════════════════════════════════════
//  EXCEL IMPORTER
// ══════════════════════════════════════════════════════════
App.importer = {

  _parsed: [],   // rows parsed from uploaded file
  _step: 1,

  // ── Column name aliases (case-insensitive) ──────────────
  COL_MAP: {
    urn            : ["urn_no","urn","urno","roll_no","rollno","id"],
    uniContest     : ["university_contest_score","university_contest","uni_contest","contest_score","codechef_score","coding_score"],
    vendorScore    : ["vendor_assessment_score","vendor_score","vendor_assessment","vendor"],
    coreSubject    : ["core_subject_score","core_subject","core_subject_performance","core"],
    skillActivities: ["skill_activities_score","skill_activities","skill_activity","skill"],
    probAttempted  : ["problems_attempted","prob_attempted","attempted"],
    probSolved     : ["problems_solved","prob_solved","solved"],
    quant          : ["quant_score","quant","quantitative"],
    logical        : ["logical_score","logical","reasoning"],
    verbal         : ["verbal_score","verbal","english"],
    gd             : ["gd_score","gd","group_discussion"],
    mock           : ["mock_interview_score","mock_interview","mock"],
    confidence     : ["confidence_level","confidence"],
    attendance     : ["training_attendance_pct","training_attendance","attendance_pct","attendance"],
    contestParticipation: ["contest_participation","contest_part","contest"],
    proctoredContest    : ["proctored_contest","proctored","proctored_participation"],
  },

  // ── Normalize header string ─────────────────────────────
  _normHeader(h) {
    return String(h).toLowerCase().trim().replace(/[\s\-\/\(\)%]+/g, "_").replace(/_+/g,"_");
  },

  // ── Match a header to a field key ──────────────────────
  _matchHeader(h) {
    const n = this._normHeader(h);
    for (const [field, aliases] of Object.entries(this.COL_MAP)) {
      if (aliases.some(a => n === a || n.startsWith(a) || a.startsWith(n))) return field;
    }
    return null;
  },

  // ── Parse Yes/No → 0/1 ─────────────────────────────────
  _parseYN(v) {
    if (v === null || v === undefined || v === "") return 0;
    const s = String(v).trim().toLowerCase();
    return (s === "yes" || s === "y" || s === "1" || s === "true") ? 1 : 0;
  },

  // ── Open modal helpers ──────────────────────────────────
  close() {
    closeModal("importModal");
    // Reset to step 1 after a brief delay
    setTimeout(() => this.goToStep1(), 300);
  },

  goToStep1() {
    this._step = 1;
    this._parsed = [];
    document.getElementById("fileInput").value = "";
    document.getElementById("uploadInfo").style.display  = "none";
    document.getElementById("uploadError").style.display = "none";
    document.getElementById("previewBtn").style.display  = "none";
    this._setStep(1);
    const w = DB.activeWeek || "—";
    document.getElementById("importActiveWeekLabel").textContent = w;
    document.getElementById("importTemplatWeek").textContent     = w;
    document.getElementById("importStudentCount").textContent    = DB.students.length;
  },

  goToStep2() {
    this._step = 2;
    this._setStep(2);
    const w = DB.activeWeek || "—";
    document.getElementById("importUploadWeekLabel").textContent = w;
  },

  goToStep3() {
    if (!this._parsed.length) { toast("No data parsed. Please upload a valid file.", "error"); return; }
    this._step = 3;
    this._setStep(3);
    this._renderPreview();
  },

  _setStep(n) {
    [1,2,3].forEach(i => {
      document.getElementById("importStep"+i).style.display = (i===n) ? "block" : "none";
      const ind = document.getElementById("step"+i+"Ind");
      ind.className = "import-step" +
        (i < n ? " import-step-done" : i === n ? " import-step-active" : "");
      if (i < n) ind.querySelector(".import-step-num").textContent = "✓";
      else       ind.querySelector(".import-step-num").textContent = String(i);
    });
  },

  // ── Template Download ───────────────────────────────────
  downloadTemplate() {
    if (!window.XLSX) { toast("Excel library not loaded yet. Please wait a moment.", "error"); return; }
    if (!DB.students.length) { toast("No students in the roster. Add students first.", "error"); return; }

    const w = DB.activeWeek || "current_week";

    // Build header row
    const headers = [
      "URN_No","Name","Department",
      "University_Contest_Score","Vendor_Assessment_Score","Core_Subject_Score",
      "Skill_Activities_Score","Problems_Attempted","Problems_Solved",
      "Quant_Score","Logical_Score","Verbal_Score",
      "GD_Score","Mock_Interview_Score","Confidence_Level",
      "Training_Attendance_Pct","Contest_Participation","Proctored_Contest"
    ];

    // Instructions row
    const instructions = [
      "← DO NOT EDIT","← DO NOT EDIT","← DO NOT EDIT",
      "0–100","0–100","0–100","0–100","Count","Count",
      "0–100","0–100","0–100",
      "0–100","0–100","0–100",
      "0–100 (%)","Yes / No","Yes / No"
    ];

    // Pre-fill students; check if existing record for active week
    const dataRows = DB.students
      .sort((a,b) => a.dept.localeCompare(b.dept) || a.name.localeCompare(b.name))
      .map(s => {
        const rec = DB.records.find(r => r.studentId === s.id && r.week === w);
        return [
          s.urn, s.name, s.dept,
          rec ? rec.uniContest ?? "" : "",
          rec ? rec.vendorScore ?? "" : "",
          rec ? rec.coreSubject ?? "" : "",
          rec ? rec.skillActivities ?? "" : "",
          rec ? rec.probAttempted ?? "" : "",
          rec ? rec.probSolved ?? "" : "",
          rec ? rec.quant ?? "" : "",
          rec ? rec.logical ?? "" : "",
          rec ? rec.verbal ?? "" : "",
          rec ? rec.gd ?? "" : "",
          rec ? rec.mock ?? "" : "",
          rec ? rec.confidence ?? "" : "",
          rec ? rec.attendance ?? "" : "",
          rec ? (rec.contestParticipation ? "Yes" : "No") : "",
          rec ? (rec.proctoredContest     ? "Yes" : "No") : "",
        ];
      });

    const wb = XLSX.utils.book_new();
    const wsData = [headers, instructions, ...dataRows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Column widths
    ws["!cols"] = [
      {wch:16},{wch:24},{wch:10},
      {wch:26},{wch:26},{wch:24},{wch:26},{wch:20},{wch:16},
      {wch:14},{wch:14},{wch:14},
      {wch:14},{wch:22},{wch:18},
      {wch:24},{wch:24},{wch:18}
    ];

    // Style header row cells bold (basic)
    const range = XLSX.utils.decode_range(ws["!ref"]);
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({r:0, c});
      if (!ws[addr]) continue;
      ws[addr].s = { font:{bold:true}, fill:{fgColor:{rgb:"1565C0"}}, alignment:{horizontal:"center"} };
    }

    // Add a second sheet with instructions
    const infoData = [
      ["R24 Batch – WPI Tracker | Weekly Data Import Template"],
      [""],
      ["Active Week", w],
      ["Generated On", new Date().toLocaleString("en-IN")],
      ["Total Students", DB.students.length],
      [""],
      ["INSTRUCTIONS"],
      ["1. Do NOT edit the URN_No, Name, or Department columns."],
      ["2. Fill in scores for each student in the score columns."],
      ["3. All score columns accept values from 0 to 100."],
      ["4. Training_Attendance_Pct: enter percentage (e.g. 85 for 85%)."],
      ["5. Contest_Participation and Proctored_Contest: enter Yes or No."],
      ["6. Leave a cell blank if data is not available (it will be treated as 0)."],
      ["7. Save the file and upload it in the WPI Tracker app."],
      [""],
      ["WPI FORMULA"],
      ["WPI = (T × 0.40) + (A × 0.25) + (C × 0.25) + (D × 0.10)"],
      ["T = avg(University Contest, Vendor, Core Subject, Skill Activities)"],
      ["A = Quant×0.50 + Logical×0.30 + Verbal×0.20"],
      ["C = GD×0.20 + MockInterview×0.60 + Confidence×0.20"],
      ["D = Attendance×0.75 + ContestParticipation×0.25"],
      [""],
      ["BAND CLASSIFICATION"],
      ["Band A (Placement Ready): WPI ≥ 75 AND Tech ≥ 50 AND Aptitude ≥ 50 AND Comm ≥ 30"],
      ["Band B (Moderate):        WPI 50–74  (or WPI ≥ 75 but fails floor score rule)"],
      ["Band C (Critical):        WPI < 50"],
    ];
    const wsInfo = XLSX.utils.aoa_to_sheet(infoData);
    wsInfo["!cols"] = [{wch:40},{wch:40}];

    XLSX.utils.book_append_sheet(wb, ws,     "WPI_Data_" + w);
    XLSX.utils.book_append_sheet(wb, wsInfo, "Instructions");

    XLSX.writeFile(wb, `WPI_Template_${w}_${new Date().toISOString().slice(0,10)}.xlsx`);
    toast("Template downloaded! Fill the scores and upload it back.", "success");
  },

  // ── Drag-and-drop handlers ──────────────────────────────
  onDragOver(e) {
    e.preventDefault();
    document.getElementById("dropZone").classList.add("drop-active");
  },
  onDragLeave(e) {
    document.getElementById("dropZone").classList.remove("drop-active");
  },
  onDrop(e) {
    e.preventDefault();
    document.getElementById("dropZone").classList.remove("drop-active");
    const file = e.dataTransfer.files[0];
    if (file) this._readFile(file);
  },
  onFileSelect(e) {
    const file = e.target.files[0];
    if (file) this._readFile(file);
  },

  // ── Read and parse Excel file ───────────────────────────
  _readFile(file) {
    const errEl  = document.getElementById("uploadError");
    const infoEl = document.getElementById("uploadInfo");
    errEl.style.display  = "none";
    infoEl.style.display = "none";

    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      errEl.innerHTML = `<div class="alert alert-red"><span class="alert-icon">✗</span><div>Invalid file type. Please upload a .xlsx or .xls file.</div></div>`;
      errEl.style.display = "block";
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target.result);
        const wb   = XLSX.read(data, { type:"array" });

        // Use first sheet
        const wsName = wb.SheetNames[0];
        const ws     = wb.Sheets[wsName];
        const raw    = XLSX.utils.sheet_to_json(ws, { header:1, defval:"" });

        if (raw.length < 2) throw new Error("File has no data rows.");

        // Find header row (first row with URN)
        let headerIdx = -1;
        for (let i = 0; i < Math.min(raw.length, 5); i++) {
          if (raw[i].some(c => this._normHeader(String(c)).includes("urn"))) {
            headerIdx = i; break;
          }
        }
        if (headerIdx < 0) throw new Error("Could not find the header row. Make sure the file contains a 'URN_No' column.");

        const headers    = raw[headerIdx].map(h => String(h));
        const colIndices = {};
        headers.forEach((h, idx) => {
          const field = this._matchHeader(h);
          if (field) colIndices[field] = idx;
        });

        if (!("urn" in colIndices)) throw new Error("'URN_No' column not found. Please use the downloaded template.");

        // Parse data rows (skip header + any instruction rows)
        const rows = [];
        for (let i = headerIdx + 1; i < raw.length; i++) {
          const row = raw[i];
          // Skip blank rows and instruction rows
          const urnVal = String(row[colIndices.urn] ?? "").trim();
          if (!urnVal || urnVal.toLowerCase().includes("do not")) continue;

          const get  = field => (colIndices[field] !== undefined) ? row[colIndices[field]] : null;
          const getN = field => { const v = get(field); return (v === "" || v === null || v === undefined) ? null : Number(v); };

          rows.push({
            urn             : urnVal,
            uniContest      : getN("uniContest"),
            vendorScore     : getN("vendorScore"),
            coreSubject     : getN("coreSubject"),
            skillActivities : getN("skillActivities"),
            probAttempted   : getN("probAttempted"),
            probSolved      : getN("probSolved"),
            quant           : getN("quant"),
            logical         : getN("logical"),
            verbal          : getN("verbal"),
            gd              : getN("gd"),
            mock            : getN("mock"),
            confidence      : getN("confidence"),
            attendance      : getN("attendance"),
            contestParticipation: this._parseYN(get("contestParticipation")),
            proctoredContest    : this._parseYN(get("proctoredContest")),
          });
        }

        if (!rows.length) throw new Error("No data rows found in the file.");

        this._parsed = rows;
        const matched = rows.filter(r => DB.students.find(s => s.urn === r.urn)).length;

        infoEl.innerHTML = `
          <div class="alert alert-green">
            <span class="alert-icon">✓</span>
            <div>
              <strong>File parsed successfully!</strong> Found <strong>${rows.length} rows</strong>
              — <strong>${matched} match</strong> students in the roster,
              ${rows.length - matched} unmatched URNs (will be skipped).
              <br><small>Sheet: "${wsName}" · File: ${file.name}</small>
            </div>
          </div>`;
        infoEl.style.display = "block";
        document.getElementById("previewBtn").style.display = "inline-flex";

      } catch(err) {
        errEl.innerHTML = `<div class="alert alert-red"><span class="alert-icon">✗</span><div><strong>Parse error:</strong> ${esc(err.message)}</div></div>`;
        errEl.style.display = "block";
        document.getElementById("previewBtn").style.display = "none";
      }
    };
    reader.readAsArrayBuffer(file);
  },

  // ── Render preview table ────────────────────────────────
  _renderPreview() {
    let matched = 0, unmatched = 0, floorFails = 0;
    const tbody = document.getElementById("previewTbody");

    tbody.innerHTML = this._parsed.map(row => {
      const student = DB.students.find(s => s.urn === row.urn);
      const isMatch = !!student;
      if (!isMatch) { unmatched++; }

      const computed = isMatch ? calcScores(row) : null;
      const hasFF = computed && computed.floorFails.length > 0;
      if (isMatch) { matched++; if (hasFF) floorFails++; }

      const rowClass = !isMatch ? "row-unmatched" : hasFF ? "row-floor" : "row-matched";

      return `<tr class="${rowClass}">
        <td><strong>${esc(row.urn)}</strong></td>
        <td>${student ? esc(student.name) : '<span style="color:var(--red)">✗ Not found</span>'}</td>
        <td>${student ? `<span class="chip chip-dept">${student.dept}</span>` : "—"}</td>
        <td class="${computed && computed.T < 50 ? "floor-fail" : ""}">${computed ? computed.T.toFixed(1) : "—"}</td>
        <td class="${computed && computed.A < 50 ? "floor-fail" : ""}">${computed ? computed.A.toFixed(1) : "—"}</td>
        <td class="${computed && computed.C < 30 ? "floor-fail" : ""}">${computed ? computed.C.toFixed(1) : "—"}</td>
        <td>${computed ? computed.D.toFixed(1) : "—"}</td>
        <td>${computed ? `<strong>${computed.WPI.toFixed(1)}</strong>` : "—"}</td>
        <td>${computed ? `<span class="band-badge band-${computed.band}">${computed.band}</span>` : "—"}</td>
        <td>${!isMatch
          ? `<span style="color:var(--red);font-size:12px">✗ URN not in roster</span>`
          : hasFF
            ? `<span style="color:var(--amber);font-size:12px">⚠ Floor fail</span>`
            : `<span style="color:var(--green);font-size:12px">✓ Ready</span>`}
        </td>
      </tr>`;
    }).join("");

    document.getElementById("previewCount").textContent     = this._parsed.length;
    document.getElementById("importMatchCount").textContent = matched;
    document.getElementById("confirmImportBtn").disabled    = matched === 0;

    const warn = floorFails > 0
      ? `<span style="color:var(--amber)"> · ${floorFails} will have floor score warnings</span>` : "";
    document.getElementById("importSummaryBanner").innerHTML = `
      <div class="alert ${matched > 0 ? "alert-blue" : "alert-red"}">
        <span class="alert-icon">${matched > 0 ? "📊" : "⚠"}</span>
        <div>
          <strong>${matched} students</strong> will be imported for week <strong>${DB.activeWeek}</strong>.
          ${unmatched ? `<span style="color:var(--red)">${unmatched} rows skipped (URN not found).</span>` : ""}
          ${warn}
          ${matched > 0 && DB.records.some(r => r.week === DB.activeWeek && this._parsed.some(p => DB.students.find(s => s.urn===p.urn)?.id === r.studentId))
            ? `<br><small>⚠ Existing records for this week will be overwritten.</small>` : ""}
        </div>
      </div>`;
  },

  // ── Confirm and save import ─────────────────────────────
  confirmImport() {
    if (!DB.activeWeek) { toast("No active week selected.", "error"); return; }
    let count = 0;

    this._parsed.forEach(row => {
      const student = DB.students.find(s => s.urn === row.urn);
      if (!student) return;

      const computed = calcScores(row);
      const record   = { id: uid(), studentId: student.id, week: DB.activeWeek, ...row, computed };

      const idx = DB.records.findIndex(r => r.studentId === student.id && r.week === DB.activeWeek);
      if (idx >= 0) DB.records[idx] = record;
      else DB.records.push(record);
      count++;
    });

    saveDB();
    this.close();
    toast(`✓ Imported ${count} student records for ${DB.activeWeek}!`, "success");

    // Refresh active page
    App.dashboard.render();
  },
};

// ── Sample Data ───────────────────────────────────────────
function loadSampleData() {
  if (DB.students.length) return;

  const names=[
    ["Aarav Sharma","CSE"],["Priya Nair","CSE"],["Karthik Rajan","IT"],["Divya Menon","IT"],
    ["Rohit Verma","ECE"],["Sneha Pillai","ECE"],["Arjun Patel","AIDS"],["Lakshmi Iyer","AIDS"],
    ["Vikram Reddy","AIML"],["Ananya Krishnan","AIML"],["Suresh Kumar","CSE"],["Kavitha Mohan","IT"],
    ["Naveen Babu","ECE"],["Pooja Rao","AIDS"],["Deepak Joshi","CSE"],["Shalini Das","AIML"],
    ["Murugan T","IT"],["Harini S","CSE"],["Ravi Shankar","ECE"],["Meena Devi","AIDS"],
    ["Aditya Singh","AIML"],["Preethi Kumar","CSE"],["Gopal Nair","IT"],["Swathi M","ECE"],
    ["Balaji R","CSE"]
  ];

  names.forEach(([name,dept],i) => {
    DB.students.push({
      id:"s"+i, urn:`21R24A${String(i+1).padStart(4,"0")}`,
      name, dept, email:`${name.toLowerCase().replace(/\s+/,".")}@college.edu`
    });
  });

  // 4 weeks of sample data
  const weeks = ["2025-W18","2025-W19","2025-W20","2025-W21"];
  weeks.forEach(w => { if (!DB.weeks.includes(w)) DB.weeks.push(w); });
  DB.weeks.sort();
  DB.activeWeek = "2025-W21";

  const rnd  = (lo,hi) => Math.round(Math.random()*(hi-lo)+lo);
  const rndF = (lo,hi) => Math.round((Math.random()*(hi-lo)+lo)*10)/10;

  DB.students.forEach((s,si) => {
    const base = 35 + si * 2.4;           // students vary in performance
    weeks.forEach((w,wi) => {
      const drift = (wi-1.5) * rnd(0,7);  // slight trend over weeks
      const b     = v => clamp(Math.round(v + drift + rnd(-8,8)), 0, 100);
      const r     = {
        uniContest      : b(base+15), vendorScore     : b(base+10),
        coreSubject     : b(base+12), skillActivities : b(base+8),
        probAttempted   : rnd(3,12),  probSolved      : null,
        quant           : b(base+10), logical         : b(base+8),
        verbal          : b(base+15), gd              : b(base-5),
        mock            : b(base),    confidence      : b(base+10),
        attendance      : clamp(rnd(70,100),60,100),
        contestParticipation : Math.random()>0.3?1:0,
        proctoredContest     : Math.random()>0.4?1:0,
      };
      r.probSolved = clamp(rnd(1, r.probAttempted), 0, r.probAttempted);
      const computed = calcScores(r);
      DB.records.push({ id:"r"+si+"_"+wi, studentId:s.id, week:w, ...r, computed });
    });
  });

  saveDB();
}

// ── Loader overlay helper ─────────────────────────────────
function _showLoader(show) {
  const el = document.getElementById("appLoader");
  if (el) el.style.display = show ? "flex" : "none";
}

// ── Boot ──────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  // Init is async (loads from MongoDB)
  await App.init();

  // Seed sample data only if the DB is empty (first-ever run)
  if (DB.students.length === 0) {
    loadSampleData();   // populates DB.* in memory + triggers saveDB() → MongoDB sync
  }

  // Close modals on overlay click
  document.querySelectorAll(".modal-overlay").forEach(el => {
    el.addEventListener("click", e => { if (e.target===el) el.classList.remove("open"); });
  });
});
