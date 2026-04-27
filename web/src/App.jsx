import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiRequest } from "./lib/api";

// ─── Context ──────────────────────────────────────────────────────────────────
const AuthContext = createContext(null);
const useAuth = () => useContext(AuthContext);

const TOKEN_KEY = "agro-pipes-token";
const USER_KEY = "agro-pipes-user";
const today = () => new Date().toISOString().slice(0, 10);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(d) { return d || "—"; }
function fmtNum(n, dec = 1) { return n == null ? "—" : Number(n).toFixed(dec); }
function fmtCurrency(n) { return n == null ? "—" : `$${Number(n).toLocaleString("es-CO")}`; }

const ROLES_ES = { admin: "Administrador", supervisor: "Supervisor", machinist: "Maquinista", operator: "Operario" };
const roleBadge = (role) => {
  const cls = { admin: "badge-red", supervisor: "badge-amber", machinist: "badge-blue", operator: "badge-green" }[role] || "badge-gray";
  return <span className={`badge ${cls}`}>{ROLES_ES[role] || role}</span>;
};
const statusBadge = (status) => {
  const map = {
    active: ["badge-green", "Activo"], preparacion: ["badge-amber", "Preparación"],
    monitoring: ["badge-blue", "Monitoreo"], inactive: ["badge-gray", "Inactivo"],
    maintenance: ["badge-amber", "Mantenimiento"], cosecha: ["badge-green", "Cosecha"],
  };
  const [cls, label] = map[status] || ["badge-gray", status];
  return <span className={`badge ${cls}`}>{label}</span>;
};

function Alert({ type, msg, onClose }) {
  if (!msg) return null;
  return (
    <div className={`alert alert-${type}`}>
      <span>{type === "error" ? "✕" : "✓"}</span>
      <span style={{ flex: 1 }}>{msg}</span>
      {onClose && <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", opacity: .6, fontSize: "1rem" }}>✕</button>}
    </div>
  );
}

function KpiCard({ icon, label, value, helper, accent }) {
  return (
    <div className="kpi-card">
      {icon && <div className="kpi-icon">{icon}</div>}
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={accent ? { color: accent } : {}}>{value}</div>
      {helper && <div className="kpi-helper">{helper}</div>}
    </div>
  );
}

function DataTable({ columns, rows, emptyMsg = "Sin registros en este período." }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{columns.map(c => <th key={c.key}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="td-empty">{emptyMsg}</td></tr>
          ) : rows.map((row, i) => (
            <tr key={row.id ?? i}>
              {columns.map(c => (
                <td key={c.key}>{c.render ? c.render(row) : row[c.key] ?? "—"}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Card({ title, subtitle, actions, children }) {
  return (
    <div className="card">
      {(title || actions) && (
        <div className="card-header">
          <div>
            <div className="card-title">{title}</div>
            {subtitle && <div className="card-sub">{subtitle}</div>}
          </div>
          {actions && <div style={{ display: "flex", gap: 8 }}>{actions}</div>}
        </div>
      )}
      <div className="card-body">{children}</div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
const NAV = [
  { section: "Principal" },
  { id: "dashboard", label: "Panel principal", icon: "🏠" },
  { section: "Operaciones" },
  { id: "worklogs", label: "Registro diario", icon: "📋" },
  { id: "activities", label: "Actividades de lote", icon: "🌾" },
  { id: "harvest", label: "Cosecha", icon: "🚜" },
  { section: "Recursos" },
  { id: "fuel", label: "Combustible / ACPPM", icon: "⛽" },
  { id: "machinery", label: "Maquinaria", icon: "⚙️" },
  { section: "Administración" },
  { id: "payroll", label: "Nómina quincena", icon: "💰", role: ["admin", "supervisor"] },
  { id: "employees", label: "Empleados", icon: "👥", role: ["admin"] },
  { id: "lots", label: "Lotes", icon: "🗺️", role: ["admin", "supervisor"] },
];

function Sidebar({ page, setPage }) {
  const { user, logout } = useAuth();
  const initials = (user?.name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <img src="/agro-pipes-logo.jpeg" alt="Logo" className="sidebar-logo" />
        <div className="sidebar-brand-text">
          <span className="brand-name">AGRO PIPES</span>
          <span className="brand-sub">Gestión Agrícola</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV.map((item, i) => {
          if (item.section) return <div key={i} className="nav-section-label">{item.section}</div>;
          if (item.role && !item.role.includes(user?.role)) return null;
          return (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? "active" : ""}`}
              onClick={() => setPage(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="sidebar-user">
        <div className="user-badge">
          <div className="user-avatar">{initials}</div>
          <div className="user-info">
            <span className="user-name">{user?.name}</span>
            <span className="user-role">{ROLES_ES[user?.role] || user?.role}</span>
          </div>
        </div>
        <button className="btn-logout" onClick={logout}>
          <span>⎋</span> Cerrar sesión
        </button>
      </div>
    </aside>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ data, loading, onRefresh }) {
  const m = data?.metrics || {};
  const period = data?.period;
  const productivity = m.hoursThisFortnight ? (Number(m.hoppersThisFortnight || 0) / Number(m.hoursThisFortnight || 1)).toFixed(2) : "0.00";
  const periodLabel = period ? `${period.start} → ${period.end}` : "Cargando…";

  return (
    <div>
      <div className="page-header">
        <div className="page-header-text">
          <h2>Panel Principal</h2>
          <p>Resumen de la quincena actual • {periodLabel}</p>
        </div>
        <button className="btn-ghost" onClick={onRefresh} disabled={loading}>
          {loading ? <span className="spinner" /> : "↻"} Actualizar
        </button>
      </div>

      <div className="executive-strip">
        <div className="executive-hero">
          <span className="executive-eyebrow">Centro operativo</span>
          <h3>Operacion agricola con trazabilidad diaria y control quincenal.</h3>
          <p>Supervisa personal, lotes, maquinaria y cosecha desde una vista mas ejecutiva del negocio.</p>
          <div className="executive-tags">
            <span className="executive-tag">Periodo: {periodLabel}</span>
            <span className="executive-tag">Equipo activo: {m.activeEmployees ?? 0}</span>
            <span className="executive-tag">Maquinaria activa: {m.activeMachinery ?? 0}</span>
          </div>
        </div>
        <div className="executive-side">
          <div className="ops-card">
            <span className="ops-label">Productividad de cosecha</span>
            <strong>{productivity} tolvas/hora</strong>
            <small>Relacion entre tolvas registradas y horas reportadas.</small>
          </div>
          <div className="ops-card">
            <span className="ops-label">Cobertura de gestion</span>
            <strong>{m.activeLots ?? 0} lotes en control</strong>
            <small>Seguimiento sincronizado de labores, recursos y rendimiento.</small>
          </div>
        </div>
      </div>

      <div className="kpi-grid">
        <KpiCard icon="⏱️" label="Horas quincena" value={`${fmtNum(m.hoursThisFortnight, 1)} h`} helper={periodLabel} />
        <KpiCard icon="🌾" label="Tolvas cosechadas" value={m.hoppersThisFortnight ?? 0} helper="Arroz cosechado" accent="var(--amber-600)" />
        <KpiCard icon="⛽" label="Combustible (L)" value={`${fmtNum(m.fuelLitersFortnight, 0)} L`} helper="ACPPM y otros" />
        <KpiCard icon="🗺️" label="Lotes activos" value={m.activeLots ?? 0} helper="En producción" />
        <KpiCard icon="👥" label="Empleados" value={m.activeEmployees ?? 0} helper="Personal activo" />
        <KpiCard icon="⚙️" label="Maquinaria" value={m.activeMachinery ?? 0} helper="Equipos operativos" />
      </div>

      <div className="col-stack">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          <Card title="🌾 Jornales recientes" subtitle="Últimos registros de trabajo">
            <DataTable
              columns={[
                { key: "workDate", label: "Fecha", render: r => fmtDate(r.workDate) },
                { key: "employeeName", label: "Empleado" },
                { key: "lotCode", label: "Lote" },
                { key: "functionName", label: "Función" },
                { key: "hoursWorked", label: "Horas", render: r => `${r.hoursWorked} h` },
              ]}
              rows={data?.recentWorkLogs || []}
            />
          </Card>
          <Card title="🚜 Cosecha reciente" subtitle="Tolvas por jornada">
            <DataTable
              columns={[
                { key: "harvestDate", label: "Fecha", render: r => fmtDate(r.harvestDate) },
                { key: "employeeName", label: "Maquinista" },
                { key: "lotCode", label: "Lote" },
                { key: "hoppersHarvested", label: "Tolvas" },
                { key: "hoursOperated", label: "Horas", render: r => `${r.hoursOperated} h` },
              ]}
              rows={data?.recentHarvestLogs || []}
            />
          </Card>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          <Card title="🌿 Actividades de lote" subtitle="Abonos, fumigaciones y más">
            <DataTable
              columns={[
                { key: "performedOn", label: "Fecha", render: r => fmtDate(r.performedOn) },
                { key: "lotCode", label: "Lote" },
                { key: "activityType", label: "Tipo" },
                { key: "inputName", label: "Insumo" },
                { key: "quantity", label: "Cant.", render: r => r.quantity ? `${r.quantity} ${r.unit || ""}` : "—" },
              ]}
              rows={data?.recentActivities || []}
            />
          </Card>
          <Card title="⛽ Combustible reciente" subtitle="Últimas compras de ACPPM">
            <DataTable
              columns={[
                { key: "purchaseDate", label: "Fecha", render: r => fmtDate(r.purchaseDate) },
                { key: "fuelType", label: "Tipo" },
                { key: "machineName", label: "Máquina" },
                { key: "quantityLiters", label: "Litros", render: r => `${r.quantityLiters} L` },
                { key: "totalCost", label: "Costo", render: r => fmtCurrency(r.totalCost) },
              ]}
              rows={data?.recentFuelPurchases || []}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── WorkLogs Page ────────────────────────────────────────────────────────────
function WorkLogsPage({ employees, lots, machinery, token, onSave, role }) {
  const [form, setForm] = useState({ employeeId: "", lotId: "", workDate: today(), functionName: "", hoursWorked: "8", machineId: "", notes: "" });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ type: "", text: "" });

  const load = useCallback(async () => {
    try {
      const data = await apiRequest("/work-logs", { token });
      setRows(data.items || []);
    } catch {}
  }, [token]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (employees.length && !form.employeeId) setForm(f => ({ ...f, employeeId: String(employees[0].id) }));
    if (lots.length && !form.lotId) setForm(f => ({ ...f, lotId: String(lots[0].id) }));
  }, [employees, lots]);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setMsg({ type: "", text: "" });
    try {
      await apiRequest("/work-logs", {
        method: "POST", token,
        body: { ...form, employeeId: +form.employeeId, lotId: +form.lotId, hoursWorked: +form.hoursWorked, machineId: form.machineId ? +form.machineId : null },
      });
      setMsg({ type: "success", text: "Jornada registrada correctamente." });
      setForm(f => ({ ...f, functionName: "", notes: "", machineId: "" }));
      await load(); onSave();
    } catch (err) { setMsg({ type: "error", text: err.message }); }
    setLoading(false);
  }

  async function handleDelete(id) {
    if (!confirm("¿Eliminar este registro?")) return;
    try { await apiRequest(`/work-logs/${id}`, { method: "DELETE", token }); await load(); onSave(); }
    catch (err) { setMsg({ type: "error", text: err.message }); }
  }

  const canDelete = ["admin", "supervisor"].includes(role);

  return (
    <div>
      <div className="page-header">
        <div className="page-header-text">
          <h2>📋 Registro Diario</h2>
          <p>Registra la función, lote y horas trabajadas por cada empleado.</p>
        </div>
      </div>
      <Alert type={msg.type} msg={msg.text} onClose={() => setMsg({ type: "", text: "" })} />
      <div className="content-cols">
        <div>
          <Card title="Nueva jornada">
            <form className="data-form" onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Empleado</label>
                <select value={form.employeeId} onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))} required>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Lote</label>
                <select value={form.lotId} onChange={e => setForm(f => ({ ...f, lotId: e.target.value }))} required>
                  {lots.map(l => <option key={l.id} value={l.id}>{l.code} – {l.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Fecha</label>
                <input type="date" value={form.workDate} onChange={e => setForm(f => ({ ...f, workDate: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label>Horas trabajadas</label>
                <input type="number" min="0.5" max="24" step="0.5" value={form.hoursWorked} onChange={e => setForm(f => ({ ...f, hoursWorked: e.target.value }))} required />
              </div>
              <div className="form-group full">
                <label>Función / Labor realizada</label>
                <input value={form.functionName} onChange={e => setForm(f => ({ ...f, functionName: e.target.value }))} placeholder="Ej: Siembra, riego, preparación de suelo..." required />
              </div>
              <div className="form-group full">
                <label>Maquinaria utilizada (opcional)</label>
                <select value={form.machineId} onChange={e => setForm(f => ({ ...f, machineId: e.target.value }))}>
                  <option value="">— Sin maquinaria —</option>
                  {machinery.map(m => <option key={m.id} value={m.id}>{m.code} – {m.name}</option>)}
                </select>
              </div>
              <div className="form-group full">
                <label>Observaciones</label>
                <textarea rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Detalles adicionales..." />
              </div>
              <div className="submit-row">
                <button type="submit" className="btn-success" disabled={loading}>
                  {loading ? <span className="spinner" /> : "✓"} Guardar jornada
                </button>
              </div>
            </form>
          </Card>
        </div>
        <Card title="Historial de jornales" subtitle={`${rows.length} registros`}>
          <DataTable
            columns={[
              { key: "workDate", label: "Fecha" },
              { key: "employeeName", label: "Empleado" },
              { key: "lotCode", label: "Lote" },
              { key: "functionName", label: "Función" },
              { key: "hoursWorked", label: "Horas", render: r => `${r.hoursWorked} h` },
              { key: "machineName", label: "Máquina", render: r => r.machineName || "—" },
              ...(canDelete ? [{ key: "_del", label: "", render: r => <button className="btn-danger" onClick={() => handleDelete(r.id)}>✕</button> }] : []),
            ]}
            rows={rows}
          />
        </Card>
      </div>
    </div>
  );
}

// ─── LotActivities Page ───────────────────────────────────────────────────────
function LotActivitiesPage({ lots, machinery, token, onSave, role }) {
  const [form, setForm] = useState({
    lotId: "", activityType: "Abono", performedOn: today(),
    inputName: "", dose: "", quantity: "", unit: "bultos", areaCovered: "", machineId: "", notes: "",
  });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ type: "", text: "" });
  const [filterLot, setFilterLot] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await apiRequest("/lot-activities", { token, params: filterLot ? { lotId: filterLot } : {} });
      setRows(data.items || []);
    } catch {}
  }, [token, filterLot]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (lots.length && !form.lotId) setForm(f => ({ ...f, lotId: String(lots[0].id) })); }, [lots]);

  const ACTIVITY_UNITS = {
    Abono: "bultos", Fumigacion: "litros", Riego: "m³", Siembra: "kg",
    "Control maleza": "litros", "Preparacion suelo": "horas", Monitoreo: "ha",
  };

  function handleTypeChange(e) {
    const t = e.target.value;
    setForm(f => ({ ...f, activityType: t, unit: ACTIVITY_UNITS[t] || "unidades" }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setMsg({ type: "", text: "" });
    try {
      await apiRequest("/lot-activities", {
        method: "POST", token,
        body: {
          ...form, lotId: +form.lotId,
          quantity: form.quantity ? +form.quantity : null,
          areaCovered: form.areaCovered ? +form.areaCovered : null,
          machineId: form.machineId ? +form.machineId : null,
        },
      });
      setMsg({ type: "success", text: "Actividad registrada correctamente." });
      setForm(f => ({ ...f, inputName: "", dose: "", quantity: "", areaCovered: "", notes: "", machineId: "" }));
      await load(); onSave();
    } catch (err) { setMsg({ type: "error", text: err.message }); }
    setLoading(false);
  }

  async function handleDelete(id) {
    if (!confirm("¿Eliminar este registro?")) return;
    try { await apiRequest(`/lot-activities/${id}`, { method: "DELETE", token }); await load(); onSave(); }
    catch (err) { setMsg({ type: "error", text: err.message }); }
  }

  const canDelete = ["admin", "supervisor"].includes(role);

  return (
    <div>
      <div className="page-header">
        <div className="page-header-text">
          <h2>🌾 Actividades de Lote</h2>
          <p>Registro de abonos, fumigaciones, riego, siembra y labores agronómicas.</p>
        </div>
      </div>
      <Alert type={msg.type} msg={msg.text} onClose={() => setMsg({ type: "", text: "" })} />
      <div className="content-cols">
        <div>
          <Card title="Nueva actividad">
            <form className="data-form" onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Lote</label>
                <select value={form.lotId} onChange={e => setForm(f => ({ ...f, lotId: e.target.value }))} required>
                  {lots.map(l => <option key={l.id} value={l.id}>{l.code} – {l.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Tipo de actividad</label>
                <select value={form.activityType} onChange={handleTypeChange} required>
                  {["Abono", "Fumigacion", "Riego", "Siembra", "Control maleza", "Preparacion suelo", "Monitoreo", "Otro"].map(t =>
                    <option key={t}>{t}</option>
                  )}
                </select>
              </div>
              <div className="form-group full">
                <label>Fecha de aplicación</label>
                <input type="date" value={form.performedOn} onChange={e => setForm(f => ({ ...f, performedOn: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label>Insumo / Producto</label>
                <input value={form.inputName} onChange={e => setForm(f => ({ ...f, inputName: e.target.value }))} placeholder="Ej: Urea 46%, Lambda-cialotrina..." />
              </div>
              <div className="form-group">
                <label>Dosis</label>
                <input value={form.dose} onChange={e => setForm(f => ({ ...f, dose: e.target.value }))} placeholder="Ej: 120 kg/ha, 1.5 L/ha" />
              </div>
              <div className="form-group">
                <label>Cantidad total</label>
                <input type="number" min="0" step="0.01" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} placeholder="0" />
              </div>
              <div className="form-group">
                <label>Unidad</label>
                <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
                  {["bultos", "litros", "kg", "galones", "m³", "ha", "unidades"].map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Área cubierta (ha)</label>
                <input type="number" min="0" step="0.1" value={form.areaCovered} onChange={e => setForm(f => ({ ...f, areaCovered: e.target.value }))} placeholder="0.0" />
              </div>
              <div className="form-group">
                <label>Maquinaria (opcional)</label>
                <select value={form.machineId} onChange={e => setForm(f => ({ ...f, machineId: e.target.value }))}>
                  <option value="">— Sin máquina —</option>
                  {machinery.map(m => <option key={m.id} value={m.id}>{m.code} – {m.name}</option>)}
                </select>
              </div>
              <div className="form-group full">
                <label>Observaciones</label>
                <textarea rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Detalles, condiciones, observaciones..." />
              </div>
              <div className="submit-row">
                <button type="submit" className="btn-success" disabled={loading}>
                  {loading ? <span className="spinner" /> : "✓"} Registrar actividad
                </button>
              </div>
            </form>
          </Card>
        </div>
        <div className="col-stack">
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 4 }}>
            <label style={{ fontSize: ".8rem", fontWeight: 600, color: "var(--gray-700)" }}>Filtrar por lote:</label>
            <select value={filterLot} onChange={e => setFilterLot(e.target.value)} style={{ border: "1.5px solid var(--gray-200)", borderRadius: 6, padding: "5px 10px", fontSize: ".82rem" }}>
              <option value="">— Todos —</option>
              {lots.map(l => <option key={l.id} value={l.id}>{l.code} – {l.name}</option>)}
            </select>
          </div>
          <Card title="Historial de actividades" subtitle={`${rows.length} registros`}>
            <DataTable
              columns={[
                { key: "performedOn", label: "Fecha" },
                { key: "lotCode", label: "Lote" },
                { key: "activityType", label: "Tipo" },
                { key: "inputName", label: "Insumo" },
                { key: "quantity", label: "Cant.", render: r => r.quantity ? `${r.quantity} ${r.unit || ""}` : "—" },
                { key: "areaCovered", label: "Área", render: r => r.areaCovered ? `${r.areaCovered} ha` : "—" },
                { key: "createdBy", label: "Registró" },
                ...(canDelete ? [{ key: "_del", label: "", render: r => <button className="btn-danger" onClick={() => handleDelete(r.id)}>✕</button> }] : []),
              ]}
              rows={rows}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── HarvestLogs Page ─────────────────────────────────────────────────────────
function HarvestPage({ employees, lots, machinery, token, onSave, role }) {
  const [form, setForm] = useState({ employeeId: "", lotId: "", harvestDate: today(), machineId: "", machineName: "", hoppersHarvested: "0", hoursOperated: "8", notes: "" });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ type: "", text: "" });

  const load = useCallback(async () => {
    try { const d = await apiRequest("/harvest-logs", { token }); setRows(d.items || []); } catch {}
  }, [token]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const mach = employees.find(e => e.role === "machinist");
    if (employees.length && !form.employeeId) setForm(f => ({ ...f, employeeId: String((mach || employees[0]).id) }));
    if (lots.length && !form.lotId) setForm(f => ({ ...f, lotId: String(lots[0].id) }));
  }, [employees, lots]);

  function handleMachineSelect(e) {
    const id = e.target.value;
    const mach = machinery.find(m => String(m.id) === id);
    setForm(f => ({ ...f, machineId: id, machineName: mach ? mach.name : f.machineName }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setMsg({ type: "", text: "" });
    try {
      await apiRequest("/harvest-logs", {
        method: "POST", token,
        body: { ...form, employeeId: +form.employeeId, lotId: +form.lotId, machineId: form.machineId ? +form.machineId : null, hoppersHarvested: +form.hoppersHarvested, hoursOperated: +form.hoursOperated },
      });
      setMsg({ type: "success", text: "Registro de cosecha guardado." });
      setForm(f => ({ ...f, hoppersHarvested: "0", notes: "" }));
      await load(); onSave();
    } catch (err) { setMsg({ type: "error", text: err.message }); }
    setLoading(false);
  }

  async function handleDelete(id) {
    if (!confirm("¿Eliminar este registro?")) return;
    try { await apiRequest(`/harvest-logs/${id}`, { method: "DELETE", token }); await load(); onSave(); }
    catch (err) { setMsg({ type: "error", text: err.message }); }
  }

  const canAccess = ["admin", "supervisor", "machinist"].includes(role);
  const canDelete = ["admin", "supervisor"].includes(role);

  if (!canAccess) return <div className="page-body"><p className="text-muted">No tienes permiso para registrar cosecha.</p></div>;

  return (
    <div>
      <div className="page-header">
        <div className="page-header-text">
          <h2>🚜 Cosecha</h2>
          <p>Registro diario de tolvas cosechadas por maquinista.</p>
        </div>
      </div>
      <Alert type={msg.type} msg={msg.text} onClose={() => setMsg({ type: "", text: "" })} />
      <div className="content-cols">
        <div>
          <Card title="Nuevo registro de cosecha">
            <form className="data-form" onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Maquinista</label>
                <select value={form.employeeId} onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))} required>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name} ({ROLES_ES[emp.role] || emp.role})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Lote</label>
                <select value={form.lotId} onChange={e => setForm(f => ({ ...f, lotId: e.target.value }))} required>
                  {lots.map(l => <option key={l.id} value={l.id}>{l.code} – {l.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Fecha</label>
                <input type="date" value={form.harvestDate} onChange={e => setForm(f => ({ ...f, harvestDate: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label>Tolvas cosechadas</label>
                <input type="number" min="0" value={form.hoppersHarvested} onChange={e => setForm(f => ({ ...f, hoppersHarvested: e.target.value }))} required />
              </div>
              <div className="form-group full">
                <label>Cosechadora / Máquina</label>
                <select value={form.machineId} onChange={handleMachineSelect}>
                  <option value="">— Ingresar nombre manual —</option>
                  {machinery.filter(m => m.type === "cosechadora").map(m => <option key={m.id} value={m.id}>{m.code} – {m.name}</option>)}
                </select>
              </div>
              {!form.machineId && (
                <div className="form-group full">
                  <label>Nombre de la máquina</label>
                  <input value={form.machineName} onChange={e => setForm(f => ({ ...f, machineName: e.target.value }))} placeholder="Ej: Cosechadora CAT-01" required={!form.machineId} />
                </div>
              )}
              <div className="form-group">
                <label>Horas de operación</label>
                <input type="number" min="0.5" max="24" step="0.5" value={form.hoursOperated} onChange={e => setForm(f => ({ ...f, hoursOperated: e.target.value }))} required />
              </div>
              <div className="form-group full">
                <label>Observaciones</label>
                <textarea rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Condiciones, humedad del grano, incidentes..." />
              </div>
              <div className="submit-row">
                <button type="submit" className="btn-success" disabled={loading}>
                  {loading ? <span className="spinner" /> : "✓"} Guardar cosecha
                </button>
              </div>
            </form>
          </Card>
        </div>
        <Card title="Historial de cosecha" subtitle={`${rows.length} registros`}>
          <DataTable
            columns={[
              { key: "harvestDate", label: "Fecha" },
              { key: "employeeName", label: "Maquinista" },
              { key: "lotCode", label: "Lote" },
              { key: "machineName", label: "Máquina" },
              { key: "hoppersHarvested", label: "Tolvas" },
              { key: "hoursOperated", label: "Horas", render: r => `${r.hoursOperated} h` },
              ...(canDelete ? [{ key: "_del", label: "", render: r => <button className="btn-danger" onClick={() => handleDelete(r.id)}>✕</button> }] : []),
            ]}
            rows={rows}
          />
        </Card>
      </div>
    </div>
  );
}

// ─── FuelPurchases Page ───────────────────────────────────────────────────────
function FuelPage({ employees, machinery, token, onSave, role }) {
  const [form, setForm] = useState({ purchaseDate: today(), fuelType: "ACPPM", quantityLiters: "", pricePerLiter: "", supplier: "", machineId: "", invoiceNumber: "", notes: "" });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ type: "", text: "" });

  const load = useCallback(async () => {
    try { const d = await apiRequest("/fuel-purchases", { token }); setRows(d.items || []); } catch {}
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const totalLiters = useMemo(() => rows.reduce((s, r) => s + (r.quantityLiters || 0), 0), [rows]);
  const totalCost = useMemo(() => rows.reduce((s, r) => s + (r.totalCost || 0), 0), [rows]);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setMsg({ type: "", text: "" });
    try {
      await apiRequest("/fuel-purchases", {
        method: "POST", token,
        body: {
          ...form,
          quantityLiters: +form.quantityLiters,
          pricePerLiter: form.pricePerLiter ? +form.pricePerLiter : null,
          machineId: form.machineId ? +form.machineId : null,
        },
      });
      setMsg({ type: "success", text: "Compra de combustible registrada." });
      setForm(f => ({ ...f, quantityLiters: "", pricePerLiter: "", invoiceNumber: "", notes: "", supplier: "" }));
      await load(); onSave();
    } catch (err) { setMsg({ type: "error", text: err.message }); }
    setLoading(false);
  }

  async function handleDelete(id) {
    if (!confirm("¿Eliminar este registro?")) return;
    try { await apiRequest(`/fuel-purchases/${id}`, { method: "DELETE", token }); await load(); onSave(); }
    catch (err) { setMsg({ type: "error", text: err.message }); }
  }

  const canDelete = ["admin", "supervisor"].includes(role);

  return (
    <div>
      <div className="page-header">
        <div className="page-header-text">
          <h2>⛽ Combustible / ACPPM</h2>
          <p>Control de compras de ACPPM, diesel y gasolina para maquinaria.</p>
        </div>
      </div>
      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(3,1fr)", marginBottom: 18 }}>
        <KpiCard icon="🛢️" label="Total litros" value={`${fmtNum(totalLiters, 0)} L`} helper="Período cargado" />
        <KpiCard icon="💵" label="Costo total" value={fmtCurrency(totalCost)} helper="Todas las compras" accent="var(--amber-600)" />
        <KpiCard icon="📋" label="N° compras" value={rows.length} helper="Registros" />
      </div>
      <Alert type={msg.type} msg={msg.text} onClose={() => setMsg({ type: "", text: "" })} />
      <div className="content-cols">
        <div>
          <Card title="Registrar compra de combustible">
            <form className="data-form" onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Fecha</label>
                <input type="date" value={form.purchaseDate} onChange={e => setForm(f => ({ ...f, purchaseDate: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label>Tipo de combustible</label>
                <select value={form.fuelType} onChange={e => setForm(f => ({ ...f, fuelType: e.target.value }))}>
                  <option>ACPPM</option>
                  <option>diesel</option>
                  <option>gasolina</option>
                  <option>aceite hidráulico</option>
                </select>
              </div>
              <div className="form-group">
                <label>Litros</label>
                <input type="number" min="1" step="0.1" value={form.quantityLiters} onChange={e => setForm(f => ({ ...f, quantityLiters: e.target.value }))} placeholder="0.0" required />
              </div>
              <div className="form-group">
                <label>Precio por litro ($)</label>
                <input type="number" min="0" step="1" value={form.pricePerLiter} onChange={e => setForm(f => ({ ...f, pricePerLiter: e.target.value }))} placeholder="0" />
              </div>
              <div className="form-group full">
                <label>Máquina asignada</label>
                <select value={form.machineId} onChange={e => setForm(f => ({ ...f, machineId: e.target.value }))}>
                  <option value="">— Sin máquina específica —</option>
                  {machinery.map(m => <option key={m.id} value={m.id}>{m.code} – {m.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Proveedor / Estación</label>
                <input value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} placeholder="Nombre estación..." />
              </div>
              <div className="form-group">
                <label>N° Factura</label>
                <input value={form.invoiceNumber} onChange={e => setForm(f => ({ ...f, invoiceNumber: e.target.value }))} placeholder="FE-0000000" />
              </div>
              <div className="form-group full">
                <label>Notas</label>
                <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Observaciones..." />
              </div>
              <div className="submit-row">
                <button type="submit" className="btn-success" disabled={loading}>
                  {loading ? <span className="spinner" /> : "✓"} Registrar compra
                </button>
              </div>
            </form>
          </Card>
        </div>
        <Card title="Historial de combustible" subtitle={`${rows.length} compras`}>
          <DataTable
            columns={[
              { key: "purchaseDate", label: "Fecha" },
              { key: "fuelType", label: "Tipo" },
              { key: "quantityLiters", label: "Litros", render: r => `${r.quantityLiters} L` },
              { key: "pricePerLiter", label: "$/L", render: r => r.pricePerLiter ? `$${Number(r.pricePerLiter).toLocaleString("es-CO")}` : "—" },
              { key: "totalCost", label: "Total", render: r => fmtCurrency(r.totalCost) },
              { key: "machineName", label: "Máquina", render: r => r.machineName || "—" },
              { key: "supplier", label: "Proveedor" },
              { key: "invoiceNumber", label: "Factura" },
              ...(canDelete ? [{ key: "_del", label: "", render: r => <button className="btn-danger" onClick={() => handleDelete(r.id)}>✕</button> }] : []),
            ]}
            rows={rows}
          />
        </Card>
      </div>
    </div>
  );
}

// ─── Machinery Page ───────────────────────────────────────────────────────────
function MachineryPage({ token, onSave, role }) {
  const [form, setForm] = useState({ code: "", name: "", type: "cosechadora", brand: "", modelYear: "", licensePlate: "", fuelType: "ACPPM", currentHours: "0", notes: "" });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ type: "", text: "" });
  const canManage = ["admin", "supervisor"].includes(role);

  const load = useCallback(async () => {
    try { const d = await apiRequest("/machinery", { token }); setRows(d.items || []); } catch {}
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setMsg({ type: "", text: "" });
    try {
      await apiRequest("/machinery", {
        method: "POST", token,
        body: { ...form, modelYear: form.modelYear ? +form.modelYear : null, currentHours: +form.currentHours },
      });
      setMsg({ type: "success", text: "Maquinaria registrada." });
      setForm({ code: "", name: "", type: "cosechadora", brand: "", modelYear: "", licensePlate: "", fuelType: "ACPPM", currentHours: "0", notes: "" });
      await load(); onSave();
    } catch (err) { setMsg({ type: "error", text: err.message }); }
    setLoading(false);
  }

  async function handleDeactivate(id) {
    if (!confirm("¿Desactivar esta máquina?")) return;
    try { await apiRequest(`/machinery/${id}`, { method: "DELETE", token }); await load(); }
    catch (err) { setMsg({ type: "error", text: err.message }); }
  }

  const machineTypeBadge = (type) => {
    const map = { cosechadora: "badge-amber", tractor: "badge-green", fumigadora: "badge-blue", vehiculo: "badge-gray" };
    return <span className={`badge ${map[type] || "badge-gray"}`}>{type}</span>;
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-header-text">
          <h2>⚙️ Maquinaria Agrícola</h2>
          <p>Gestión de cosechadoras, tractores, fumigadoras y vehículos de la finca.</p>
        </div>
      </div>
      <Alert type={msg.type} msg={msg.text} onClose={() => setMsg({ type: "", text: "" })} />
      <div className="content-cols">
        {canManage && (
          <div>
            <Card title="Agregar maquinaria">
              <form className="data-form" onSubmit={handleSubmit}>
                <div className="form-group">
                  <label>Código</label>
                  <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="COS-01, TRA-02…" required />
                </div>
                <div className="form-group">
                  <label>Tipo</label>
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                    <option value="cosechadora">Cosechadora</option>
                    <option value="tractor">Tractor</option>
                    <option value="fumigadora">Fumigadora</option>
                    <option value="vehiculo">Vehículo</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
                <div className="form-group full">
                  <label>Nombre / Descripción</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej: Cosechadora Case IH AFS" required />
                </div>
                <div className="form-group">
                  <label>Marca</label>
                  <input value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} placeholder="John Deere, Case, New Holland…" />
                </div>
                <div className="form-group">
                  <label>Año</label>
                  <input type="number" min="1990" max="2030" value={form.modelYear} onChange={e => setForm(f => ({ ...f, modelYear: e.target.value }))} placeholder="2020" />
                </div>
                <div className="form-group">
                  <label>Placa</label>
                  <input value={form.licensePlate} onChange={e => setForm(f => ({ ...f, licensePlate: e.target.value }))} placeholder="ABC-123" />
                </div>
                <div className="form-group">
                  <label>Combustible</label>
                  <select value={form.fuelType} onChange={e => setForm(f => ({ ...f, fuelType: e.target.value }))}>
                    <option>ACPPM</option>
                    <option>diesel</option>
                    <option>gasolina</option>
                    <option>eléctrico</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Horómetro actual (h)</label>
                  <input type="number" min="0" step="0.1" value={form.currentHours} onChange={e => setForm(f => ({ ...f, currentHours: e.target.value }))} />
                </div>
                <div className="form-group full">
                  <label>Notas</label>
                  <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Estado, observaciones…" />
                </div>
                <div className="submit-row">
                  <button type="submit" className="btn-success" disabled={loading}>
                    {loading ? <span className="spinner" /> : "✓"} Registrar máquina
                  </button>
                </div>
              </form>
            </Card>
          </div>
        )}
        <Card title="Inventario de maquinaria" subtitle={`${rows.length} equipos`}>
          <DataTable
            columns={[
              { key: "code", label: "Código" },
              { key: "type", label: "Tipo", render: r => machineTypeBadge(r.type) },
              { key: "name", label: "Nombre" },
              { key: "brand", label: "Marca" },
              { key: "modelYear", label: "Año" },
              { key: "licensePlate", label: "Placa" },
              { key: "fuelType", label: "Combustible" },
              { key: "currentHours", label: "Horómetro", render: r => `${r.currentHours} h` },
              { key: "status", label: "Estado", render: r => statusBadge(r.status) },
              ...(canManage ? [{ key: "_del", label: "", render: r => r.status === "active" ? <button className="btn-danger" onClick={() => handleDeactivate(r.id)}>Desact.</button> : null }] : []),
            ]}
            rows={rows}
          />
        </Card>
      </div>
    </div>
  );
}

// ─── Payroll Page ─────────────────────────────────────────────────────────────
function PayrollPage({ token, role }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const canAccess = ["admin", "supervisor"].includes(role);

  const load = useCallback(async () => {
    if (!canAccess) return;
    setLoading(true);
    try {
      const params = startDate && endDate ? { start: startDate, end: endDate } : {};
      const d = await apiRequest("/payroll/fortnight", { token, params });
      setData(d);
    } catch {}
    setLoading(false);
  }, [token, canAccess, startDate, endDate]);

  useEffect(() => { load(); }, [load]);

  if (!canAccess) return (
    <div className="page-body">
      <p className="text-muted">Solo administradores y supervisores pueden consultar la nómina.</p>
    </div>
  );

  const items = data?.items || [];
  const total = items.reduce((s, r) => s + (r.totalHours || 0), 0);

  return (
    <div>
      <div className="page-header">
        <div className="page-header-text">
          <h2>💰 Nómina Quincena</h2>
          <p>Consolidado de horas trabajadas por empleado en el período.</p>
        </div>
        <button className="btn-ghost" onClick={load} disabled={loading}>
          {loading ? <span className="spinner" style={{ borderTopColor: "var(--gray-700)" }} /> : "↻"} Actualizar
        </button>
      </div>
      <div style={{ background: "var(--white)", border: "1px solid var(--gray-200)", borderRadius: "var(--radius)", padding: "12px 16px", marginBottom: 18, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: ".8rem", fontWeight: 700, color: "var(--gray-700)" }}>Período personalizado:</span>
        <div className="form-group" style={{ flexDirection: "row", alignItems: "center", gap: 8, margin: 0 }}>
          <label style={{ fontSize: ".78rem", fontWeight: 600, color: "var(--gray-500)" }}>Desde</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ border: "1.5px solid var(--gray-200)", borderRadius: 6, padding: "5px 8px", fontSize: ".82rem" }} />
        </div>
        <div className="form-group" style={{ flexDirection: "row", alignItems: "center", gap: 8, margin: 0 }}>
          <label style={{ fontSize: ".78rem", fontWeight: 600, color: "var(--gray-500)" }}>Hasta</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ border: "1.5px solid var(--gray-200)", borderRadius: 6, padding: "5px 8px", fontSize: ".82rem" }} />
        </div>
        <button className="btn-success" onClick={load} disabled={loading} style={{ padding: "6px 14px" }}>Consultar</button>
        <button className="btn-ghost" onClick={() => { setStartDate(""); setEndDate(""); }}>Limpiar</button>
      </div>
      {data && (
        <div>
          <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(3,1fr)", marginBottom: 18 }}>
            <KpiCard icon="📅" label="Período" value={data.period?.start} helper={`al ${data.period?.end}`} />
            <KpiCard icon="⏱️" label="Total horas" value={`${fmtNum(total, 1)} h`} helper="Todos los empleados" />
            <KpiCard icon="👥" label="Empleados" value={items.length} helper="Con actividad" />
          </div>
          <Card title="Consolidado de horas por empleado">
            <DataTable
              columns={[
                { key: "employeeName", label: "Empleado" },
                { key: "role", label: "Rol", render: r => roleBadge(r.role) },
                { key: "totalHours", label: "Horas acumuladas", render: r => <strong>{fmtNum(r.totalHours, 1)} h</strong> },
              ]}
              rows={items}
              emptyMsg="No hay horas registradas en este período."
            />
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── Employees Page ───────────────────────────────────────────────────────────
function EmployeesPage({ token, role }) {
  const [form, setForm] = useState({ name: "", email: "", role: "operator", password: "", phone: "", idNumber: "" });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ type: "", text: "" });
  const canManage = role === "admin";

  const load = useCallback(async () => {
    try { const d = await apiRequest("/employees", { token, params: { all: "true" } }); setRows(d.items || []); } catch {}
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setMsg({ type: "", text: "" });
    try {
      await apiRequest("/employees", { method: "POST", token, body: form });
      setMsg({ type: "success", text: "Empleado registrado." });
      setForm({ name: "", email: "", role: "operator", password: "", phone: "", idNumber: "" });
      await load();
    } catch (err) { setMsg({ type: "error", text: err.message }); }
    setLoading(false);
  }

  async function handleToggle(emp) {
    try {
      await apiRequest(`/employees/${emp.id}`, { method: "PUT", token, body: { isActive: !emp.isActive } });
      await load();
    } catch (err) { setMsg({ type: "error", text: err.message }); }
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-text">
          <h2>👥 Empleados</h2>
          <p>Gestión del personal de la finca. Solo administradores pueden modificar.</p>
        </div>
      </div>
      <Alert type={msg.type} msg={msg.text} onClose={() => setMsg({ type: "", text: "" })} />
      <div className="content-cols">
        {canManage && (
          <div>
            <Card title="Nuevo empleado">
              <form className="data-form" onSubmit={handleSubmit}>
                <div className="form-group full">
                  <label>Nombre completo</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="Nombre del empleado" />
                </div>
                <div className="form-group full">
                  <label>Correo electrónico</label>
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required placeholder="correo@ejemplo.com" />
                </div>
                <div className="form-group">
                  <label>Rol</label>
                  <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                    <option value="operator">Operario</option>
                    <option value="machinist">Maquinista</option>
                    <option value="supervisor">Supervisor</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Contraseña</label>
                  <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required placeholder="Mínimo 8 caracteres" />
                </div>
                <div className="form-group">
                  <label>Teléfono</label>
                  <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="3001234567" />
                </div>
                <div className="form-group">
                  <label>Cédula / ID</label>
                  <input value={form.idNumber} onChange={e => setForm(f => ({ ...f, idNumber: e.target.value }))} placeholder="12345678" />
                </div>
                <div className="submit-row">
                  <button type="submit" className="btn-success" disabled={loading}>
                    {loading ? <span className="spinner" /> : "✓"} Agregar empleado
                  </button>
                </div>
              </form>
            </Card>
          </div>
        )}
        <Card title="Lista de empleados" subtitle={`${rows.length} empleados`}>
          <DataTable
            columns={[
              { key: "name", label: "Nombre" },
              { key: "email", label: "Correo" },
              { key: "role", label: "Rol", render: r => roleBadge(r.role) },
              { key: "phone", label: "Teléfono" },
              { key: "isActive", label: "Estado", render: r => statusBadge(r.isActive ? "active" : "inactive") },
              ...(canManage ? [{ key: "_toggle", label: "", render: r => (
                <button className={r.isActive ? "btn-danger" : "btn-success"} style={{ padding: "4px 10px", fontSize: ".75rem" }} onClick={() => handleToggle(r)}>
                  {r.isActive ? "Desactivar" : "Activar"}
                </button>
              )}] : []),
            ]}
            rows={rows}
          />
        </Card>
      </div>
    </div>
  );
}

// ─── Lots Page ────────────────────────────────────────────────────────────────
function LotsPage({ token, role }) {
  const [form, setForm] = useState({ code: "", name: "", cropType: "Arroz", riceVariety: "", hectares: "", status: "active", sowingDate: "", expectedHarvestDate: "", notes: "" });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ type: "", text: "" });
  const canManage = ["admin", "supervisor"].includes(role);

  const load = useCallback(async () => {
    try { const d = await apiRequest("/lots", { token }); setRows(d.items || []); } catch {}
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setMsg({ type: "", text: "" });
    try {
      await apiRequest("/lots", { method: "POST", token, body: form });
      setMsg({ type: "success", text: "Lote registrado." });
      setForm({ code: "", name: "", cropType: "Arroz", riceVariety: "", hectares: "", status: "active", sowingDate: "", expectedHarvestDate: "", notes: "" });
      await load();
    } catch (err) { setMsg({ type: "error", text: err.message }); }
    setLoading(false);
  }

  async function handleStatusChange(lot, status) {
    try {
      await apiRequest(`/lots/${lot.id}`, { method: "PUT", token, body: { status } });
      await load();
    } catch (err) { setMsg({ type: "error", text: err.message }); }
  }

  const totalHa = useMemo(() => rows.reduce((s, l) => s + (l.hectares || 0), 0), [rows]);

  return (
    <div>
      <div className="page-header">
        <div className="page-header-text">
          <h2>🗺️ Lotes</h2>
          <p>Gestión de lotes arroceros de la finca.</p>
        </div>
      </div>
      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(3,1fr)", marginBottom: 18 }}>
        <KpiCard icon="🗺️" label="Total lotes" value={rows.length} />
        <KpiCard icon="📐" label="Total hectáreas" value={`${fmtNum(totalHa, 1)} ha`} />
        <KpiCard icon="✅" label="Activos" value={rows.filter(l => l.status === "active").length} />
      </div>
      <Alert type={msg.type} msg={msg.text} onClose={() => setMsg({ type: "", text: "" })} />
      <div className="content-cols">
        {canManage && (
          <div>
            <Card title="Nuevo lote">
              <form className="data-form" onSubmit={handleSubmit}>
                <div className="form-group">
                  <label>Código</label>
                  <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="L-01, L-02…" required />
                </div>
                <div className="form-group">
                  <label>Hectáreas</label>
                  <input type="number" min="0" step="0.1" value={form.hectares} onChange={e => setForm(f => ({ ...f, hectares: e.target.value }))} required placeholder="0.0" />
                </div>
                <div className="form-group full">
                  <label>Nombre del lote</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej: Lote La Palma" required />
                </div>
                <div className="form-group">
                  <label>Variedad de arroz</label>
                  <input value={form.riceVariety} onChange={e => setForm(f => ({ ...f, riceVariety: e.target.value }))} placeholder="IR-42, Fedearroz 473…" />
                </div>
                <div className="form-group">
                  <label>Estado</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                    <option value="active">Activo</option>
                    <option value="preparacion">Preparación</option>
                    <option value="cosecha">Cosecha</option>
                    <option value="monitoring">Monitoreo</option>
                    <option value="inactive">Inactivo</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Fecha de siembra</label>
                  <input type="date" value={form.sowingDate} onChange={e => setForm(f => ({ ...f, sowingDate: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Cosecha estimada</label>
                  <input type="date" value={form.expectedHarvestDate} onChange={e => setForm(f => ({ ...f, expectedHarvestDate: e.target.value }))} />
                </div>
                <div className="form-group full">
                  <label>Notas</label>
                  <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Características del lote..." />
                </div>
                <div className="submit-row">
                  <button type="submit" className="btn-success" disabled={loading}>
                    {loading ? <span className="spinner" /> : "✓"} Crear lote
                  </button>
                </div>
              </form>
            </Card>
          </div>
        )}
        <Card title="Inventario de lotes" subtitle={`${rows.length} lotes • ${fmtNum(totalHa, 1)} ha totales`}>
          <DataTable
            columns={[
              { key: "code", label: "Código", render: r => <strong>{r.code}</strong> },
              { key: "name", label: "Nombre" },
              { key: "riceVariety", label: "Variedad", render: r => r.riceVariety || "—" },
              { key: "hectares", label: "Ha", render: r => `${r.hectares} ha` },
              { key: "sowingDate", label: "Siembra", render: r => r.sowingDate || "—" },
              { key: "expectedHarvestDate", label: "Cosecha est.", render: r => r.expectedHarvestDate || "—" },
              { key: "status", label: "Estado", render: r => statusBadge(r.status) },
              ...(canManage ? [{ key: "_actions", label: "", render: r => (
                <select value={r.status} onChange={e => handleStatusChange(r, e.target.value)} style={{ fontSize: ".75rem", border: "1px solid var(--gray-200)", borderRadius: 4, padding: "3px 6px" }}>
                  <option value="active">Activo</option>
                  <option value="preparacion">Preparación</option>
                  <option value="cosecha">Cosecha</option>
                  <option value="monitoring">Monitoreo</option>
                  <option value="inactive">Inactivo</option>
                </select>
              )}] : []),
            ]}
            rows={rows}
          />
        </Card>
      </div>
    </div>
  );
}

// ─── Login ────────────────────────────────────────────────────────────────────
function Login({ onLogin }) {
  const [form, setForm] = useState({ email: "admin@agropipes.com", password: "AgroPipes2026!" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest("/auth/login", { method: "POST", body: form });
      onLogin(data.token, data.user);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <img src="/agro-pipes-logo.jpeg" alt="Logo AGRO PIPES" className="brand-logo" />
          <div>
            <h1>Sistema de Gestión Agrícola</h1>
            <p>Control integral para fincas arroceras: jornales, maquinaria, cosecha y mucho más.</p>
          </div>
          <div className="feature-pills">
            {[
              ["🌾", "Registro diario de jornales por lote"],
              ["🚜", "Control de cosecha y tolvas"],
              ["⛽", "Seguimiento de ACPPM y combustible"],
              ["⚙️", "Gestión de maquinaria agrícola"],
              ["🌿", "Historial de abonos y fumigaciones"],
              ["💰", "Nómina quincenal automática"],
            ].map(([icon, text]) => (
              <div key={text} className="feature-pill">
                <span className="pill-icon">{icon}</span> {text}
              </div>
            ))}
          </div>
        </div>
        <div className="login-form-area">
          <h2>Iniciar sesión</h2>
          <p className="subtitle">Ingresa tus credenciales para acceder al panel.</p>
          {error && <Alert type="error" msg={error} onClose={() => setError("")} />}
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="form-group">
              <label>Correo electrónico</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required autoComplete="email" />
            </div>
            <div className="form-group">
              <label>Contraseña</label>
              <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required autoComplete="current-password" />
            </div>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? <><span className="spinner" /> Verificando...</> : "Entrar al panel"}
            </button>
          </form>
          <div className="demo-box">
            <strong>Credenciales de demostración</strong>
            <code>admin@agropipes.com</code><br />
            <code>AgroPipes2026!</code>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || "");
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); } catch { return null; }
  });
  const [page, setPage] = useState("dashboard");
  const [pageKey, setPageKey] = useState(0);
  const [dashboard, setDashboard] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [lots, setLots] = useState([]);
  const [machinery, setMachinery] = useState([]);
  const [dashLoading, setDashLoading] = useState(false);

  const loadDashboard = useCallback(async (tk = token) => {
    if (!tk) return;
    setDashLoading(true);
    try { const d = await apiRequest("/dashboard/summary", { token: tk }); setDashboard(d); } catch {}
    setDashLoading(false);
  }, [token]);

  const loadCatalogs = useCallback(async (tk = token) => {
    if (!tk) return;
    try {
      const [emp, lt, mach] = await Promise.all([
        apiRequest("/employees", { token: tk }),
        apiRequest("/lots", { token: tk }),
        apiRequest("/machinery", { token: tk }),
      ]);
      setEmployees(emp.items || []);
      setLots(lt.items || []);
      setMachinery(mach.items || []);
    } catch {}
  }, [token]);

  useEffect(() => {
    if (token && user) { loadDashboard(token); loadCatalogs(token); }
  }, [token, user]);

  function login(tk, usr) {
    localStorage.setItem(TOKEN_KEY, tk);
    localStorage.setItem(USER_KEY, JSON.stringify(usr));
    setToken(tk); setUser(usr);
    loadDashboard(tk); loadCatalogs(tk);
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY);
    setToken(""); setUser(null); setDashboard(null);
    setEmployees([]); setLots([]); setMachinery([]);
  }

  function onSave() { loadDashboard(); loadCatalogs(); }

  const authValue = useMemo(() => ({ user, token, logout }), [user, token]);

  if (!token || !user) return <Login onLogin={login} />;

  const PAGE_TITLES = {
    dashboard: "Panel principal", worklogs: "Registro diario", activities: "Actividades de lote",
    harvest: "Cosecha", fuel: "Combustible", machinery: "Maquinaria",
    payroll: "Nómina quincena", employees: "Empleados", lots: "Lotes",
  };

  function renderPage() {
    const props = { employees, lots, machinery, token, role: user.role, onSave };
    switch (page) {
      case "dashboard": return <Dashboard data={dashboard} loading={dashLoading} onRefresh={() => { loadDashboard(); loadCatalogs(); }} />;
      case "worklogs": return <WorkLogsPage {...props} />;
      case "activities": return <LotActivitiesPage {...props} />;
      case "harvest": return <HarvestPage {...props} />;
      case "fuel": return <FuelPage {...props} />;
      case "machinery": return <MachineryPage token={token} role={user.role} onSave={onSave} />;
      case "payroll": return <PayrollPage token={token} role={user.role} />;
      case "employees": return <EmployeesPage token={token} role={user.role} />;
      case "lots": return <LotsPage token={token} role={user.role} />;
      default: return <Dashboard data={dashboard} loading={dashLoading} onRefresh={loadDashboard} />;
    }
  }

  return (
    <AuthContext.Provider value={authValue}>
      <div className="app-shell">
        <Sidebar page={page} setPage={setPage} />
        <div className="main-content">
          <div className="topbar">
            <div>
              <div className="topbar-title">{PAGE_TITLES[page] || "Panel"}</div>
              <div className="topbar-sub">AGRO PIPES · Sistema de Gestión Agrícola</div>
            </div>
            <div className="topbar-actions">
              <button className="btn-ghost" onClick={() => { setPageKey(k => k + 1); loadDashboard(); loadCatalogs(); }} disabled={dashLoading}>
                {dashLoading ? <span className="spinner" style={{ borderTopColor: "var(--gray-700)" }} /> : "↻"} Actualizar
              </button>
            </div>
          </div>
          <div className="page-body" key={pageKey}>{renderPage()}</div>
        </div>
      </div>
    </AuthContext.Provider>
  );
}
