export default function KPICard({ label, value, sub, cls = "kpi-blue" }) {
  return (
    <div className={`kpi-card ${cls}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-sub">{sub}</div>
    </div>
  );
}
