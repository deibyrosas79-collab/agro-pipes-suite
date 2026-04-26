// KpiCard kept for backwards compatibility - main card is now inline in App.jsx
export default function KpiCard({ label, value, helper, icon }) {
  return (
    <div className="kpi-card">
      {icon && <div className="kpi-icon">{icon}</div>}
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {helper && <div className="kpi-helper">{helper}</div>}
    </div>
  );
}
