export function BandBadge({ band }) {
  if (!band || band === "—") return <span>—</span>;
  return (
    <span className={`band-badge band-${band}`}>
      <span className={`dot dot-${band}`}></span>
      {band}
    </span>
  );
}

const TREND_META = {
  "↑": { cls: "trend-badge trend-up",    label: "↑ Rising"      },
  "↓": { cls: "trend-badge trend-down",  label: "↓ Declining"   },
  "⚠": { cls: "trend-badge trend-osc",   label: "⚠ Oscillating" },
  "→": { cls: "trend-badge trend-stable",label: "→ Stable"      },
};
export function TrendBadge({ trend }) {
  if (!trend || trend === "—") return <span style={{color:"var(--text-muted)"}}>—</span>;
  const { cls, label } = TREND_META[trend] || TREND_META["→"];
  return <span className={cls}>{label}</span>;
}

export function DeptChip({ dept }) {
  return <span className="chip chip-dept">{dept}</span>;
}

export function ActionChip({ band }) {
  const label = band === "A" ? "Advanced Training" : band === "B" ? "Guided Practice" : "Immediate Intervention";
  return <span className="chip chip-action">{label}</span>;
}
