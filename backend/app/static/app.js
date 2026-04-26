const state = {
  token: localStorage.getItem("agro-pipes-token") || "",
  user: JSON.parse(localStorage.getItem("agro-pipes-user") || "null"),
  loading: false,
  error: "",
  success: "",
  dashboard: null,
  employees: [],
  lots: [],
  workLogs: [],
  activities: [],
  harvestLogs: [],
  payroll: { period: null, items: [] },
};

const today = new Date().toISOString().slice(0, 10);

const forms = {
  login: {
    email: "admin@agropipes.com",
    password: "AgroPipes2026!",
  },
  work: {
    employeeId: "",
    lotId: "",
    workDate: today,
    functionName: "",
    hoursWorked: "8",
    notes: "",
  },
  activity: {
    lotId: "",
    performedOn: today,
    activityType: "Abono",
    inputName: "",
    dose: "",
    notes: "",
  },
  harvest: {
    employeeId: "",
    lotId: "",
    harvestDate: today,
    machineName: "",
    hoppersHarvested: "0",
    hoursOperated: "8",
    notes: "",
  },
};

function api(path, options = {}) {
  return fetch(`/api${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  }).then(async (response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "No fue posible completar la solicitud.");
    return data;
  });
}

function formatHours(value) {
  return `${Number(value || 0).toFixed(1)} h`;
}

function formatPeriod(period) {
  if (!period?.start || !period?.end) return "Sin periodo cargado";
  return `${period.start} a ${period.end}`;
}

function canSeePayroll() {
  return ["admin", "supervisor"].includes(state.user?.role);
}

function setMessage(type, message) {
  state.error = type === "error" ? message : "";
  state.success = type === "success" ? message : "";
}

function setLoading(value) {
  state.loading = value;
  render();
}

function updateDefaultSelections() {
  if (!state.employees.length || !state.lots.length) return;
  if (!forms.work.employeeId) forms.work.employeeId = String(state.employees[0].id);
  if (!forms.work.lotId) forms.work.lotId = String(state.lots[0].id);
  if (!forms.activity.lotId) forms.activity.lotId = String(state.lots[0].id);
  if (!forms.harvest.employeeId) {
    const machinist = state.employees.find((employee) => employee.role === "machinist") || state.employees[0];
    forms.harvest.employeeId = String(machinist.id);
  }
  if (!forms.harvest.lotId) forms.harvest.lotId = String(state.lots[0].id);
}

async function loadData() {
  if (!state.token) return;
  setLoading(true);
  setMessage("", "");

  const requests = [
    api("/dashboard/summary"),
    api("/employees"),
    api("/lots"),
    api("/work-logs"),
    api("/lot-activities"),
    api("/harvest-logs"),
  ];

  if (canSeePayroll()) requests.push(api("/payroll/fortnight"));

  const results = await Promise.allSettled(requests);
  const [summaryResult, employeeResult, lotResult, workResult, activityResult, harvestResult, payrollResult] = results;

  if (summaryResult.status === "fulfilled") state.dashboard = summaryResult.value;
  if (employeeResult.status === "fulfilled") state.employees = employeeResult.value.items || [];
  if (lotResult.status === "fulfilled") state.lots = lotResult.value.items || [];
  if (workResult.status === "fulfilled") state.workLogs = workResult.value.items || [];
  if (activityResult.status === "fulfilled") state.activities = activityResult.value.items || [];
  if (harvestResult.status === "fulfilled") state.harvestLogs = harvestResult.value.items || [];
  state.payroll = payrollResult?.status === "fulfilled" ? payrollResult.value : { period: state.dashboard?.period || null, items: [] };

  const failed = results.find((result) => result.status === "rejected");
  if (failed?.reason) {
    state.error = failed.reason.message;
  }

  updateDefaultSelections();
  setLoading(false);
}

async function handleLogin(event) {
  event.preventDefault();
  setLoading(true);
  setMessage("", "");
  try {
    const result = await api("/auth/login", {
      method: "POST",
      body: forms.login,
    });
    state.token = result.token;
    state.user = result.user;
    localStorage.setItem("agro-pipes-token", result.token);
    localStorage.setItem("agro-pipes-user", JSON.stringify(result.user));
    state.success = `Sesion iniciada para ${result.user.name}.`;
    await loadData();
  } catch (error) {
    state.error = error.message;
    setLoading(false);
  }
}

function handleLogout() {
  localStorage.removeItem("agro-pipes-token");
  localStorage.removeItem("agro-pipes-user");
  state.token = "";
  state.user = null;
  state.dashboard = null;
  state.employees = [];
  state.lots = [];
  state.workLogs = [];
  state.activities = [];
  state.harvestLogs = [];
  state.payroll = { period: null, items: [] };
  state.success = "La sesion se cerro correctamente.";
  render();
}

async function submitRecord(path, payload, reset) {
  setLoading(true);
  setMessage("", "");
  try {
    await api(path, {
      method: "POST",
      body: payload,
    });
    reset();
    state.success = "Registro guardado correctamente.";
    await loadData();
  } catch (error) {
    state.error = error.message;
    setLoading(false);
  }
}

function bindLandingEvents(container) {
  container.querySelector("#login-form")?.addEventListener("submit", handleLogin);
  container.querySelector("#login-email")?.addEventListener("input", (event) => {
    forms.login.email = event.target.value;
  });
  container.querySelector("#login-password")?.addEventListener("input", (event) => {
    forms.login.password = event.target.value;
  });
}

function bindDashboardEvents(container) {
  container.querySelector("#logout-button")?.addEventListener("click", handleLogout);
  container.querySelector("#refresh-button")?.addEventListener("click", () => loadData());

  const fieldMap = [
    ["work", ["employeeId", "lotId", "workDate", "functionName", "hoursWorked", "notes"]],
    ["activity", ["lotId", "performedOn", "activityType", "inputName", "dose", "notes"]],
    ["harvest", ["employeeId", "lotId", "harvestDate", "machineName", "hoppersHarvested", "hoursOperated", "notes"]],
  ];

  fieldMap.forEach(([group, fields]) => {
    fields.forEach((field) => {
      container.querySelector(`[data-form="${group}"][data-field="${field}"]`)?.addEventListener("input", (event) => {
        forms[group][field] = event.target.value;
      });
    });
  });

  container.querySelector("#work-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    submitRecord(
      "/work-logs",
      {
        ...forms.work,
        employeeId: Number(forms.work.employeeId),
        lotId: Number(forms.work.lotId),
        hoursWorked: Number(forms.work.hoursWorked),
      },
      () => {
        forms.work = { ...forms.work, workDate: today, functionName: "", hoursWorked: "8", notes: "" };
      },
    );
  });

  container.querySelector("#activity-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    submitRecord(
      "/lot-activities",
      {
        ...forms.activity,
        lotId: Number(forms.activity.lotId),
      },
      () => {
        forms.activity = { ...forms.activity, performedOn: today, inputName: "", dose: "", notes: "" };
      },
    );
  });

  container.querySelector("#harvest-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    submitRecord(
      "/harvest-logs",
      {
        ...forms.harvest,
        employeeId: Number(forms.harvest.employeeId),
        lotId: Number(forms.harvest.lotId),
        hoppersHarvested: Number(forms.harvest.hoppersHarvested),
        hoursOperated: Number(forms.harvest.hoursOperated),
      },
      () => {
        forms.harvest = { ...forms.harvest, harvestDate: today, machineName: "", hoppersHarvested: "0", hoursOperated: "8", notes: "" };
      },
    );
  });
}

function optionsForEmployees() {
  return state.employees.map((employee) => `<option value="${employee.id}">${employee.name} (${employee.role})</option>`).join("");
}

function optionsForLots() {
  return state.lots.map((lot) => `<option value="${lot.id}">${lot.code} - ${lot.name}</option>`).join("");
}

function messageMarkup() {
  return `
    ${state.error ? `<div class="status-box error">${state.error}</div>` : ""}
    ${state.success ? `<div class="status-box success">${state.success}</div>` : ""}
  `;
}

function tableMarkup(columns, rows, keyField, emptyLabel) {
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>${columns.map((column) => `<th>${column.label}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${
            rows.length
              ? rows
                  .map(
                    (row) =>
                      `<tr data-key="${row[keyField] ?? ""}">
                        ${columns.map((column) => `<td>${row[column.key] ?? "-"}</td>`).join("")}
                      </tr>`,
                  )
                  .join("")
              : `<tr><td class="empty-cell" colspan="${columns.length}">${emptyLabel}</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;
}

function renderLanding() {
  return `
    <main class="landing">
      <section class="hero">
        <article class="hero-card hero-copy">
          <span class="eyebrow">Operacion agricola centralizada</span>
          <h1>AGRO PIPES controla jornadas, lotes y cosecha en una sola pantalla.</h1>
          <p>
            Esta version ya se abre directo desde el backend. Puedes registrar funciones diarias,
            historial tecnico por lote, tolvas de cosecha y acumulados quincenales.
          </p>
          <ul class="hero-list">
            <li>Registro diario por trabajador y lote.</li>
            <li>Bitacora de abonos, fumigaciones, riego y monitoreo.</li>
            <li>Consolidado de horas trabajadas para la quincena.</li>
            <li>Ingreso rapido desde navegador sin instalaciones extra.</li>
          </ul>
          <div class="hint-box">
            <strong>Acceso demo:</strong>
            <div>admin@agropipes.com / AgroPipes2026!</div>
          </div>
        </article>
        <aside class="hero-card login-card">
          <img class="brand-logo" src="/static/agro-pipes-logo.jpeg" alt="Logo AGRO PIPES" />
          <form id="login-form" class="login-form">
            <div class="field">
              <label for="login-email">Correo</label>
              <input id="login-email" type="email" value="${forms.login.email}" required />
            </div>
            <div class="field">
              <label for="login-password">Contrasena</label>
              <input id="login-password" type="password" value="${forms.login.password}" required />
            </div>
            <button class="primary-button" type="submit" ${state.loading ? "disabled" : ""}>
              ${state.loading ? "Ingresando..." : "Entrar al sistema"}
            </button>
          </form>
          ${messageMarkup()}
        </aside>
      </section>
    </main>
  `;
}

function renderDashboard() {
  const period = formatPeriod(state.dashboard?.period);
  const payrollBlock = canSeePayroll()
    ? tableMarkup(
        [
          { key: "employeeName", label: "Empleado" },
          { key: "role", label: "Rol" },
          { key: "totalHours", label: "Horas acumuladas" },
        ],
        state.payroll.items,
        "employeeId",
        "No hay horas acumuladas en el periodo.",
      )
    : `<p class="helper">Tu perfil puede registrar informacion operativa, pero no consultar nomina.</p>`;

  return `
    <main class="dashboard">
      <header class="topbar">
        <div class="topbar-main">
          <img class="topbar-logo" src="/static/agro-pipes-logo.jpeg" alt="Logo AGRO PIPES" />
          <div>
            <span class="eyebrow">AGRO PIPES</span>
            <h1>Centro Operativo</h1>
            <p>${state.user.name} | ${state.user.role}</p>
          </div>
        </div>
        <div class="topbar-actions">
          <button id="refresh-button" class="secondary-button" type="button" ${state.loading ? "disabled" : ""}>Actualizar</button>
          <button id="logout-button" class="secondary-button" type="button">Cerrar sesion</button>
        </div>
      </header>

      ${messageMarkup()}

      <section class="metrics">
        <article class="metric-card">
          <span>Horas de quincena</span>
          <strong class="metric-value">${formatHours(state.dashboard?.metrics?.hoursThisFortnight)}</strong>
          <small class="stat-note">${period}</small>
        </article>
        <article class="metric-card">
          <span>Tolvas registradas</span>
          <strong class="metric-value">${state.dashboard?.metrics?.hoppersThisFortnight ?? 0}</strong>
          <small class="stat-note">Productividad de cosecha</small>
        </article>
        <article class="metric-card">
          <span>Lotes activos</span>
          <strong class="metric-value">${state.dashboard?.metrics?.activeLots ?? 0}</strong>
          <small class="stat-note">Seguimiento agronomico</small>
        </article>
        <article class="metric-card">
          <span>Empleados activos</span>
          <strong class="metric-value">${state.dashboard?.metrics?.activeEmployees ?? 0}</strong>
          <small class="stat-note">Personal operativo</small>
        </article>
      </section>

      <section class="content">
        <div class="stack">
          <section class="panel">
            <div class="panel-header">
              <div>
                <h2>Registro diario</h2>
                <p>Funcion, lote, fecha y horas trabajadas.</p>
              </div>
            </div>
            <form id="work-form" class="data-form">
              <div class="field">
                <label>Empleado</label>
                <select data-form="work" data-field="employeeId">${optionsForEmployees()}</select>
              </div>
              <div class="field">
                <label>Lote</label>
                <select data-form="work" data-field="lotId">${optionsForLots()}</select>
              </div>
              <div class="field">
                <label>Fecha</label>
                <input data-form="work" data-field="workDate" type="date" value="${forms.work.workDate}" />
              </div>
              <div class="field">
                <label>Funcion</label>
                <input data-form="work" data-field="functionName" value="${forms.work.functionName}" placeholder="Ej. Siembra o riego" />
              </div>
              <div class="field">
                <label>Horas</label>
                <input data-form="work" data-field="hoursWorked" type="number" min="1" max="24" step="0.5" value="${forms.work.hoursWorked}" />
              </div>
              <div class="full">
                <label>Observaciones</label>
                <textarea data-form="work" data-field="notes">${forms.work.notes}</textarea>
              </div>
              <button class="primary-button" type="submit" ${state.loading ? "disabled" : ""}>Guardar jornada</button>
            </form>
          </section>

          <section class="panel">
            <div class="panel-header">
              <div>
                <h2>Actividad por lote</h2>
                <p>Bitacora tecnica de abonos, fumigaciones y seguimiento.</p>
              </div>
            </div>
            <form id="activity-form" class="data-form">
              <div class="field">
                <label>Lote</label>
                <select data-form="activity" data-field="lotId">${optionsForLots()}</select>
              </div>
              <div class="field">
                <label>Actividad</label>
                <select data-form="activity" data-field="activityType">
                  ${["Abono", "Fumigacion", "Monitoreo", "Riego", "Control maleza"].map((item) => `<option ${forms.activity.activityType === item ? "selected" : ""}>${item}</option>`).join("")}
                </select>
              </div>
              <div class="field">
                <label>Fecha</label>
                <input data-form="activity" data-field="performedOn" type="date" value="${forms.activity.performedOn}" />
              </div>
              <div class="field">
                <label>Insumo</label>
                <input data-form="activity" data-field="inputName" value="${forms.activity.inputName}" placeholder="Nombre comercial o N/A" />
              </div>
              <div class="field">
                <label>Dosis</label>
                <input data-form="activity" data-field="dose" value="${forms.activity.dose}" placeholder="Ej. 120 kg/ha" />
              </div>
              <div class="full">
                <label>Notas</label>
                <textarea data-form="activity" data-field="notes">${forms.activity.notes}</textarea>
              </div>
              <button class="primary-button" type="submit" ${state.loading ? "disabled" : ""}>Guardar actividad</button>
            </form>
          </section>

          <section class="panel">
            <div class="panel-header">
              <div>
                <h2>Registro de cosecha</h2>
                <p>Uso para maquinistas y supervisores.</p>
              </div>
            </div>
            <form id="harvest-form" class="data-form">
              <div class="field">
                <label>Maquinista</label>
                <select data-form="harvest" data-field="employeeId">${optionsForEmployees()}</select>
              </div>
              <div class="field">
                <label>Lote</label>
                <select data-form="harvest" data-field="lotId">${optionsForLots()}</select>
              </div>
              <div class="field">
                <label>Fecha</label>
                <input data-form="harvest" data-field="harvestDate" type="date" value="${forms.harvest.harvestDate}" />
              </div>
              <div class="field">
                <label>Maquina</label>
                <input data-form="harvest" data-field="machineName" value="${forms.harvest.machineName}" placeholder="Ej. Cosechadora CAT-01" />
              </div>
              <div class="field">
                <label>Tolvas</label>
                <input data-form="harvest" data-field="hoppersHarvested" type="number" min="0" value="${forms.harvest.hoppersHarvested}" />
              </div>
              <div class="field">
                <label>Horas operadas</label>
                <input data-form="harvest" data-field="hoursOperated" type="number" min="1" max="24" step="0.5" value="${forms.harvest.hoursOperated}" />
              </div>
              <div class="full">
                <label>Notas</label>
                <textarea data-form="harvest" data-field="notes">${forms.harvest.notes}</textarea>
              </div>
              <button class="primary-button" type="submit" ${state.loading ? "disabled" : ""}>Guardar cosecha</button>
            </form>
          </section>
        </div>

        <div class="stack">
          <section class="panel">
            <div class="panel-header">
              <div>
                <h2>Jornales recientes</h2>
                <p>Ultimos registros operativos.</p>
              </div>
            </div>
            ${tableMarkup(
              [
                { key: "workDate", label: "Fecha" },
                { key: "employeeName", label: "Empleado" },
                { key: "lotCode", label: "Lote" },
                { key: "functionName", label: "Funcion" },
                { key: "hoursWorked", label: "Horas" },
              ],
              state.workLogs.slice(0, 8),
              "id",
              "Sin registros de jornada.",
            )}
          </section>

          <section class="panel">
            <div class="panel-header">
              <div>
                <h2>Historial por lote</h2>
                <p>Seguimiento de abonos, fumigaciones y control.</p>
              </div>
            </div>
            ${tableMarkup(
              [
                { key: "performedOn", label: "Fecha" },
                { key: "lotCode", label: "Lote" },
                { key: "activityType", label: "Actividad" },
                { key: "inputName", label: "Insumo" },
                { key: "dose", label: "Dosis" },
              ],
              state.activities.slice(0, 8),
              "id",
              "Sin actividades registradas.",
            )}
          </section>

          <section class="panel">
            <div class="panel-header">
              <div>
                <h2>Cosecha diaria</h2>
                <p>Tolvas procesadas por jornada.</p>
              </div>
            </div>
            ${tableMarkup(
              [
                { key: "harvestDate", label: "Fecha" },
                { key: "employeeName", label: "Maquinista" },
                { key: "lotCode", label: "Lote" },
                { key: "hoppersHarvested", label: "Tolvas" },
                { key: "machineName", label: "Maquina" },
              ],
              state.harvestLogs.slice(0, 8),
              "id",
              "Sin registros de cosecha.",
            )}
          </section>

          <section class="panel">
            <div class="panel-header">
              <div>
                <h2>Consolidado quincenal</h2>
                <p>${canSeePayroll() ? formatPeriod(state.payroll.period) : "Visible solo para administracion y supervision."}</p>
              </div>
            </div>
            ${payrollBlock}
          </section>
        </div>
      </section>
    </main>
  `;
}

function applySelectValues(container) {
  [
    ["work", "employeeId", forms.work.employeeId],
    ["work", "lotId", forms.work.lotId],
    ["activity", "lotId", forms.activity.lotId],
    ["harvest", "employeeId", forms.harvest.employeeId],
    ["harvest", "lotId", forms.harvest.lotId],
  ].forEach(([group, field, value]) => {
    const element = container.querySelector(`[data-form="${group}"][data-field="${field}"]`);
    if (element && value) element.value = value;
  });
}

function render() {
  const app = document.querySelector("#app");
  app.innerHTML = state.user && state.token ? renderDashboard() : renderLanding();
  if (state.user && state.token) {
    applySelectValues(app);
    bindDashboardEvents(app);
  } else {
    bindLandingEvents(app);
  }
}

Promise.resolve(loadData()).finally(render);
