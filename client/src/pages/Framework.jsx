export default function Framework() {
  return (
    <section className="page active">
      <div className="page-header"><div><div className="page-title">Framework Reference</div><div className="page-subtitle">R24 Batch – Weekly Holistic Performance Tracking</div></div></div>
      <div className="g2 mb20">
        <div className="card">
          <div className="card-header">📐 WPI Formula</div>
          <div style={{padding:"16px 20px"}}>
            <div style={{fontFamily:"monospace",fontSize:15,background:"var(--bg)",padding:12,borderRadius:8,marginBottom:12}}>
              WPI = T×0.40 + A×0.25 + C×0.25 + D×0.10
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {[
                ["Technical (T)","40%","Avg(CCGlobalContest, Vendor, CoreSubject, Skills) + ProblemSolving"],
                ["Aptitude (A)","25%","Quant×50% + Logical×30% + Verbal×20%"],
                ["Communication (C)","25%","GD×20% + MockInterview×60% + Confidence×20%"],
                ["Discipline (D)","10%","Attendance×75% + ContestParticipation×25%"],
              ].map(([c,w,f])=>(
                <div key={c} style={{padding:"10px 12px",border:"1px solid var(--border)",borderRadius:8,background:"var(--bg)"}}>
                  <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:4}}>
                    <span style={{fontWeight:700,fontSize:13,flex:1}}>{c}</span>
                    <span className="band-badge band-A">{w}</span>
                  </div>
                  <div style={{fontSize:12,color:"var(--text-muted)",lineHeight:1.5}}>{f}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-header">🏷️ Band Classification</div>
          <div style={{padding:"16px 20px"}}>
            {[
              {band:"A",color:"var(--green)",range:"WPI ≥ 75",desc:"AND T≥50, A≥50, C≥30 (floor scores)",action:"Advanced Training"},
              {band:"B",color:"var(--amber)",range:"WPI 50–74",desc:"OR fails floor score (band downgraded from A)",action:"Guided Practice"},
              {band:"C",color:"var(--red)",  range:"WPI < 50", desc:"Critical — immediate intervention required",action:"Immediate Intervention"},
            ].map(({band,color,range,desc,action})=>(
              <div key={band} style={{display:"flex",gap:12,padding:"12px 0",borderBottom:"1px solid var(--border)"}}>
                <span className={`band-badge band-${band}`} style={{alignSelf:"flex-start",marginTop:2}}><span className={`dot dot-${band}`}></span>{band}</span>
                <div><div style={{fontWeight:600}}>{range}</div><div style={{fontSize:12,color:"var(--text-muted)",marginTop:2}}>{desc}</div><div style={{fontSize:12,color,fontWeight:600,marginTop:4}}>→ {action}</div></div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-header">📋 Floor Score Rules</div>
        <div style={{padding:"16px 20px",display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:16}}>
          {[
            {title:"Technical Floor",val:"≥ 50 / 100",desc:"Minimum required for Band A eligibility"},
            {title:"Aptitude Floor", val:"≥ 50 / 100",desc:"Minimum required for Band A eligibility"},
            {title:"Communication Floor",val:"≥ 30 / 100",desc:"Minimum required for Band A eligibility"},
          ].map(({title,val,desc})=>(
            <div key={title} style={{background:"var(--bg)",borderRadius:8,padding:16,borderLeft:"3px solid var(--amber)"}}>
              <div style={{fontWeight:700,fontSize:13}}>{title}</div>
              <div style={{fontSize:22,fontWeight:800,color:"var(--amber)",margin:"6px 0"}}>{val}</div>
              <div style={{fontSize:12,color:"var(--text-muted)"}}>{desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Placement Readiness ─────────────────────────── */}
      <div className="card" style={{marginTop:20}}>
        <div className="card-header">🎯 Placement Readiness Approach</div>
        <div style={{padding:"16px 20px"}}>

          {/* Overview */}
          <div style={{background:"var(--bg)",borderRadius:10,padding:"12px 16px",marginBottom:20,borderLeft:"4px solid var(--blue-mid)",fontSize:13,lineHeight:1.7,color:"var(--text)"}}>
            <strong>WPI measures weekly performance.</strong> The Placement Readiness framework aggregates all recorded weeks into a single <strong>Cumulative Performance Index (CPI)</strong> that reflects a student's overall readiness for campus recruitment. CPI rewards both high scores <em>and</em> consistency — a student who scores 70 every week ranks higher than one who alternates 90 and 50.
          </div>

          {/* CPI Formula */}
          <div style={{marginBottom:24}}>
            <div style={{fontSize:12,fontWeight:700,textTransform:"uppercase",letterSpacing:".6px",color:"var(--text-muted)",marginBottom:8}}>Step 1 — Compute the CPI</div>
            <div style={{background:"linear-gradient(135deg,#0A1F0A,#1B5E20,#2E7D32)",borderRadius:10,padding:"12px 18px",color:"#fff",display:"flex",gap:16,flexWrap:"wrap",alignItems:"center",marginBottom:14}}>
              <div style={{fontSize:13,fontWeight:800,letterSpacing:.5,color:"#FFD54F"}}>CPI =</div>
              <div style={{fontSize:12,opacity:.95,lineHeight:1.8}}>
                <strong>AvgWPI × 0.60</strong>
                <span style={{opacity:.6,margin:"0 6px"}}>+</span>
                <strong>Consistency × 0.20</strong>
                <span style={{opacity:.6,margin:"0 6px"}}>+</span>
                <strong>Trend Score × 0.10</strong>
                <span style={{opacity:.6,margin:"0 6px"}}>+</span>
                <strong>Floor Compliance × 0.10</strong>
              </div>
            </div>

            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {/* AvgWPI */}
              <div style={{padding:"12px 14px",border:"1px solid var(--border)",borderRadius:8,background:"var(--bg)"}}>
                <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:6}}>
                  <span style={{fontWeight:700,fontSize:13,flex:1}}>Avg WPI</span>
                  <span className="band-badge band-A">60%</span>
                </div>
                <div style={{fontSize:12,color:"var(--text-muted)",lineHeight:1.6}}>
                  Simple arithmetic mean of the student's WPI across all weeks they have been recorded.
                  This is the dominant factor — overall performance level matters most.
                </div>
                <div style={{fontFamily:"monospace",fontSize:12,background:"#E8F5E9",borderRadius:6,padding:"6px 10px",marginTop:8,color:"#1B5E20"}}>
                  AvgWPI = Σ(WPI per week) ÷ n
                </div>
              </div>

              {/* Consistency */}
              <div style={{padding:"12px 14px",border:"1px solid var(--border)",borderRadius:8,background:"var(--bg)"}}>
                <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:6}}>
                  <span style={{fontWeight:700,fontSize:13,flex:1}}>Consistency</span>
                  <span className="band-badge band-A">20%</span>
                </div>
                <div style={{fontSize:12,color:"var(--text-muted)",lineHeight:1.6}}>
                  Measures how stable the student's WPI is across weeks. Computed from the population standard deviation (σ) of all weekly WPI values — higher variance means lower consistency.
                </div>
                <div style={{fontFamily:"monospace",fontSize:12,background:"#E8F5E9",borderRadius:6,padding:"6px 10px",marginTop:8,color:"#1B5E20"}}>
                  Consistency = max(0, 100 − σ × 3)
                </div>
                <div style={{fontSize:11,color:"var(--text-muted)",marginTop:6,lineHeight:1.6}}>
                  σ = 0 → score 100 (perfectly stable) · σ = 10 → score 70 · σ = 20 → score 40 · σ ≥ 33 → score 0
                </div>
              </div>

              {/* Trend Score */}
              <div style={{padding:"12px 14px",border:"1px solid var(--border)",borderRadius:8,background:"var(--bg)"}}>
                <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:6}}>
                  <span style={{fontWeight:700,fontSize:13,flex:1}}>Trend Score</span>
                  <span className="band-badge band-A">10%</span>
                </div>
                <div style={{fontSize:12,color:"var(--text-muted)",lineHeight:1.6}}>
                  Derived from the student's WPI trajectory — whether they are improving, stable, or declining. Rewards forward momentum even if absolute scores are modest.
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:6,marginTop:8}}>
                  {[["↑ Improving","100","#1B5E20","#E8F5E9"],["→ Stable","60","#BF360C","#FFF8E1"],["⚠ Declining","30","#7F0000","#FFF3F0"],["— No data","0","#424242","#F5F5F5"]].map(([t,s,c,bg])=>(
                    <div key={t} style={{background:bg,borderRadius:6,padding:"6px 10px",textAlign:"center"}}>
                      <div style={{fontSize:13,fontWeight:800,color:c}}>{t}</div>
                      <div style={{fontSize:11,color:"var(--text-muted)"}}>Score: <strong>{s}</strong></div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Floor Compliance */}
              <div style={{padding:"12px 14px",border:"1px solid var(--border)",borderRadius:8,background:"var(--bg)"}}>
                <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:6}}>
                  <span style={{fontWeight:700,fontSize:13,flex:1}}>Floor Compliance</span>
                  <span className="band-badge band-A">10%</span>
                </div>
                <div style={{fontSize:12,color:"var(--text-muted)",lineHeight:1.6}}>
                  Percentage of recorded weeks where the student simultaneously met all three floor score rules. A student who passes floors consistently signals reliable foundational competency.
                </div>
                <div style={{fontFamily:"monospace",fontSize:12,background:"#E8F5E9",borderRadius:6,padding:"6px 10px",marginTop:8,color:"#1B5E20"}}>
                  Floor pass week = T≥50 AND A≥50 AND C≥30
                </div>
                <div style={{fontFamily:"monospace",fontSize:12,background:"#E8F5E9",borderRadius:6,padding:"6px 10px",marginTop:4,color:"#1B5E20"}}>
                  FloorCompliance = (passing weeks ÷ n) × 100
                </div>
              </div>
            </div>
          </div>

          {/* Hard Gates */}
          <div style={{marginBottom:24}}>
            <div style={{fontSize:12,fontWeight:700,textTransform:"uppercase",letterSpacing:".6px",color:"var(--text-muted)",marginBottom:8}}>Step 2 — Check Hard Gates</div>
            <div style={{background:"#FFF3E0",border:"1px solid #FFCC80",borderRadius:10,padding:"12px 16px",marginBottom:12,fontSize:12,lineHeight:1.7,color:"#BF360C"}}>
              <strong>Hard gates are binary pre-conditions.</strong> A student must pass <em>all four</em> gates to receive a CPI-based tier. If even one gate fails, the tier is locked to <strong>🚧 Gate Fail</strong> regardless of how high the CPI is. This ensures no student is recommended for placement if they have a critical foundational gap.
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10}}>
              {[
                {label:"Avg Technical",   req:"≥ 55", why:"Minimum technical depth for industry roles",     color:"#1B5E20"},
                {label:"Avg Aptitude",    req:"≥ 55", why:"Minimum reasoning ability for aptitude rounds",  color:"#0277BD"},
                {label:"Avg Communication",req:"≥ 40",why:"Minimum communication for HR/GD rounds",        color:"#7B1FA2"},
                {label:"Week Coverage",   req:"≥ 60%",why:"Sufficient data to make a reliable assessment",  color:"#E65100"},
              ].map(({label,req,why,color})=>(
                <div key={label} style={{background:"var(--bg)",borderRadius:8,padding:"12px 14px",borderLeft:`3px solid ${color}`}}>
                  <div style={{fontSize:11,color:"var(--text-muted)",fontWeight:600,marginBottom:2}}>{label}</div>
                  <div style={{fontSize:22,fontWeight:900,color,margin:"4px 0"}}>{req}</div>
                  <div style={{fontSize:11,color:"var(--text-muted)",lineHeight:1.4}}>{why}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Tiers */}
          <div>
            <div style={{fontSize:12,fontWeight:700,textTransform:"uppercase",letterSpacing:".6px",color:"var(--text-muted)",marginBottom:8}}>Step 3 — Assign Placement Readiness Tier</div>
            <div style={{fontSize:12,color:"var(--text-muted)",marginBottom:12,lineHeight:1.6}}>
              If all hard gates are passed, the CPI value determines the tier. Tiers guide the type of intervention or support each student needs.
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {[
                {emoji:"✅",label:"Placement Ready",  cpi:"CPI ≥ 80",  color:"#1B5E20", bg:"#E8F5E9", border:"#A5D6A7",
                  rec:"Student is ready for campus drives. Action: submit for company shortlists, focus on resume prep, mock interviews, and company-specific practice.",
                  note:"All gates passed · high scores · stable trend"},
                {emoji:"🟡",label:"Near Ready",        cpi:"CPI 65–79", color:"#33691E", bg:"#F1F8E9", border:"#C5E1A5",
                  rec:"2–4 week targeted sprint on the weakest component. Action: identify the lowest-scoring CPI component and assign focused practice before the next recruitment cycle.",
                  note:"All gates passed · good scores · minor gaps"},
                {emoji:"🟠",label:"In Progress",       cpi:"CPI 50–64", color:"#BF360C", bg:"#FFF8E1", border:"#FFE082",
                  rec:"1–2 months structured training plan. Action: assign component-specific modules, weekly check-ins, and reassess after 4 weeks.",
                  note:"All gates passed · moderate performance"},
                {emoji:"🔴",label:"Not Ready",         cpi:"CPI < 50",  color:"#7F0000", bg:"#FFF3F0", border:"#FFAB91",
                  rec:"Intensive intervention required. Action: address floor score failures first, then work on WPI improvement through targeted technical/aptitude remediation.",
                  note:"All gates passed · low overall performance"},
                {emoji:"🚧",label:"Gate Fail",         cpi:"—",         color:"#424242", bg:"#F5F5F5", border:"#BDBDBD",
                  rec:"One or more hard gates failed. CPI tier is not applicable until gates are cleared. Action: identify which gate failed (T, A, C, or Coverage) and resolve that specific gap first.",
                  note:"Gate failure overrides CPI regardless of score"},
              ].map(({emoji,label,cpi,color,bg,border,rec,note})=>(
                <div key={label} style={{padding:"12px 14px",background:bg,borderRadius:8,border:`1px solid ${border}`}}>
                  <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:6}}>
                    <span style={{fontSize:18}}>{emoji}</span>
                    <span style={{fontWeight:700,fontSize:13,color,flex:1}}>{label}</span>
                    <span style={{fontSize:11,color:"var(--text-muted)",background:"#fff",border:`1px solid ${border}`,borderRadius:4,padding:"1px 8px",whiteSpace:"nowrap"}}>{cpi}</span>
                  </div>
                  <div style={{fontSize:12,color:"var(--text)",lineHeight:1.6,marginBottom:4}}>{rec}</div>
                  <div style={{fontSize:11,color:"var(--text-muted)",fontStyle:"italic"}}>{note}</div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
