import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { apiRequest } from "./src/lib/api";

const TOKEN_KEY = "agro-pipes-token";
const USER_KEY = "agro-pipes-user";
const API_URL_KEY = "agro-pipes-api-url";

// Production API URL — update after deploying to Render
const DEFAULT_API_URL = process.env.EXPO_PUBLIC_API_URL || "https://agro-pipes-api.onrender.com/api";

const today = () => new Date().toISOString().slice(0, 10);

const ROLES_ES = { admin: "Administrador", supervisor: "Supervisor", machinist: "Maquinista", operator: "Operario" };

// ─── Components ───────────────────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function Input({ label, ...props }) {
  return (
    <Field label={label}>
      <TextInput placeholderTextColor="#9aab9e" style={s.input} {...props} />
    </Field>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={s.sectionSub}>{subtitle}</Text> : null}
      <View style={s.sectionBody}>{children}</View>
    </View>
  );
}

function PrimaryBtn({ label, onPress, loading, icon }) {
  return (
    <Pressable style={[s.btn, loading && s.btnDisabled]} onPress={onPress} disabled={loading}>
      <Text style={s.btnText}>{loading ? "Cargando…" : `${icon ? icon + " " : ""}${label}`}</Text>
    </Pressable>
  );
}

function GhostBtn({ label, onPress, icon }) {
  return (
    <Pressable style={s.ghostBtn} onPress={onPress}>
      <Text style={s.ghostBtnText}>{icon ? `${icon} ` : ""}{label}</Text>
    </Pressable>
  );
}

function KpiRow({ items }) {
  return (
    <View style={s.kpiRow}>
      {items.map(({ label, value, icon }) => (
        <View key={label} style={s.kpiCard}>
          <Text style={s.kpiIcon}>{icon}</Text>
          <Text style={s.kpiValue}>{value ?? "—"}</Text>
          <Text style={s.kpiLabel}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

function FeedbackBox({ error, success, onClear }) {
  if (!error && !success) return null;
  return (
    <Pressable onPress={onClear} style={[s.feedbackBox, error ? s.feedbackError : s.feedbackSuccess]}>
      <Text style={error ? s.errorText : s.successText}>{error || success}</Text>
      <Text style={{ fontSize: 11, opacity: 0.7, color: error ? "#9b2424" : "#1a5c35" }}>Toca para cerrar</Text>
    </Pressable>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [token, setToken] = useState("");
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");

  // Data state
  const [dashboard, setDashboard] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [lots, setLots] = useState([]);
  const [machinery, setMachinery] = useState([]);
  const [workLogs, setWorkLogs] = useState([]);
  const [activities, setActivities] = useState([]);
  const [harvestLogs, setHarvestLogs] = useState([]);
  const [fuelPurchases, setFuelPurchases] = useState([]);
  const [payroll, setPayroll] = useState({ period: null, items: [] });

  // Login form
  const [loginForm, setLoginForm] = useState({ email: "admin@agropipes.com", password: "AgroPipes2026!" });

  // Work log form
  const [workForm, setWorkForm] = useState({ employeeId: "", lotId: "", workDate: today(), functionName: "", hoursWorked: "8", notes: "" });

  // Activity form
  const [activityForm, setActivityForm] = useState({ lotId: "", performedOn: today(), activityType: "Abono", inputName: "", dose: "", quantity: "", unit: "bultos", notes: "" });

  // Harvest form
  const [harvestForm, setHarvestForm] = useState({ employeeId: "", lotId: "", harvestDate: today(), machineName: "", hoppersHarvested: "0", hoursOperated: "8", notes: "" });

  // Fuel form
  const [fuelForm, setFuelForm] = useState({ purchaseDate: today(), fuelType: "ACPPM", quantityLiters: "", pricePerLiter: "", supplier: "", invoiceNumber: "", notes: "" });

  const canSeePayroll = useMemo(() => ["admin", "supervisor"].includes(user?.role), [user]);

  // ─── Init ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const [savedUrl, savedToken, savedUser] = await Promise.all([
        AsyncStorage.getItem(API_URL_KEY),
        AsyncStorage.getItem(TOKEN_KEY),
        AsyncStorage.getItem(USER_KEY),
      ]);
      if (savedUrl) setApiUrl(savedUrl);
      if (savedToken && savedUser) {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
      }

      // Check biometric support
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setBiometricAvailable(compatible && enrolled);
    })();
  }, []);

  useEffect(() => {
    if (token) loadData(token);
  }, [token, apiUrl]);

  useEffect(() => {
    if (!employees.length || !lots.length) return;
    const mach = employees.find(e => e.role === "machinist");
    setWorkForm(f => ({ ...f, employeeId: f.employeeId || String(employees[0].id), lotId: f.lotId || String(lots[0].id) }));
    setActivityForm(f => ({ ...f, lotId: f.lotId || String(lots[0].id) }));
    setHarvestForm(f => ({ ...f, employeeId: f.employeeId || String((mach || employees[0]).id), lotId: f.lotId || String(lots[0].id) }));
  }, [employees, lots]);

  // ─── Data ─────────────────────────────────────────────────────────────────────
  const loadData = useCallback(async (tk = token) => {
    if (!tk) return;
    setLoading(true);
    setError("");

    const reqs = await Promise.allSettled([
      apiRequest(apiUrl, "/dashboard/summary", { token: tk }),
      apiRequest(apiUrl, "/employees", { token: tk }),
      apiRequest(apiUrl, "/lots", { token: tk }),
      apiRequest(apiUrl, "/machinery", { token: tk }),
      apiRequest(apiUrl, "/work-logs", { token: tk }),
      apiRequest(apiUrl, "/lot-activities", { token: tk }),
      apiRequest(apiUrl, "/harvest-logs", { token: tk }),
      apiRequest(apiUrl, "/fuel-purchases", { token: tk }),
      ...(canSeePayroll ? [apiRequest(apiUrl, "/payroll/fortnight", { token: tk })] : []),
    ]);

    const [dash, emp, lt, mach, work, act, harv, fuel, pay] = reqs;
    if (dash.status === "fulfilled") setDashboard(dash.value);
    if (emp.status === "fulfilled") setEmployees(emp.value.items || []);
    if (lt.status === "fulfilled") setLots(lt.value.items || []);
    if (mach.status === "fulfilled") setMachinery(mach.value.items || []);
    if (work.status === "fulfilled") setWorkLogs(work.value.items || []);
    if (act.status === "fulfilled") setActivities(act.value.items || []);
    if (harv.status === "fulfilled") setHarvestLogs(harv.value.items || []);
    if (fuel.status === "fulfilled") setFuelPurchases(fuel.value.items || []);
    if (pay?.status === "fulfilled") setPayroll(pay.value);

    const failed = reqs.find(r => r.status === "rejected");
    if (failed?.reason) setError(failed.reason.message);
    setLoading(false);
  }, [token, apiUrl, canSeePayroll]);

  // ─── Auth ─────────────────────────────────────────────────────────────────────
  async function handleLogin() {
    setLoading(true);
    setError("");
    try {
      await AsyncStorage.setItem(API_URL_KEY, apiUrl);
      const result = await apiRequest(apiUrl, "/auth/login", { method: "POST", body: loginForm });
      await AsyncStorage.multiSet([
        [TOKEN_KEY, result.token],
        [USER_KEY, JSON.stringify(result.user)],
      ]);
      setToken(result.token);
      setUser(result.user);
      setSuccess(`Bienvenido, ${result.user.name}.`);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  async function handleBiometricLogin() {
    const saved = await AsyncStorage.getItem(TOKEN_KEY);
    if (!saved) {
      setError("Primero debes iniciar sesión con correo y contraseña.");
      return;
    }
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Desbloquea AGRO PIPES",
      cancelLabel: "Cancelar",
      fallbackLabel: "Usar contraseña",
    });
    if (result.success) {
      const savedUser = await AsyncStorage.getItem(USER_KEY);
      if (savedUser) {
        setToken(saved);
        setUser(JSON.parse(savedUser));
        setSuccess("Sesión iniciada con huella digital.");
      }
    } else {
      setError("Autenticación biométrica fallida.");
    }
  }

  async function handleLogout() {
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
    setToken(""); setUser(null); setDashboard(null);
    setEmployees([]); setLots([]); setMachinery([]);
    setWorkLogs([]); setActivities([]); setHarvestLogs([]);
    setFuelPurchases([]); setPayroll({ period: null, items: [] });
  }

  // ─── Submit ───────────────────────────────────────────────────────────────────
  async function submit(path, body, resetter) {
    setLoading(true);
    setError(""); setSuccess("");
    try {
      await apiRequest(apiUrl, path, { method: "POST", token, body });
      resetter();
      setSuccess("Registro guardado correctamente.");
      await loadData();
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  // ─── Login Screen ─────────────────────────────────────────────────────────────
  if (!user || !token) {
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar style="light" />
        <ScrollView contentContainerStyle={s.loginContainer}>
          <View style={s.loginCard}>
            <Image source={require("./assets/agro-pipes-logo.jpeg")} style={s.logo} />
            <Text style={s.appTitle}>AGRO PIPES</Text>
            <Text style={s.appSubtitle}>Sistema de Gestión Agrícola</Text>

            <FeedbackBox error={error} success={success} onClear={() => { setError(""); setSuccess(""); }} />

            <Input
              label="URL del servidor"
              value={apiUrl}
              onChangeText={setApiUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <Input
              label="Correo electrónico"
              value={loginForm.email}
              onChangeText={v => setLoginForm(f => ({ ...f, email: v }))}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <Input
              label="Contraseña"
              value={loginForm.password}
              onChangeText={v => setLoginForm(f => ({ ...f, password: v }))}
              secureTextEntry
            />

            <PrimaryBtn label="Iniciar sesión" onPress={handleLogin} loading={loading} icon="🔑" />

            {biometricAvailable && (
              <GhostBtn label="Entrar con huella digital" onPress={handleBiometricLogin} icon="👆" />
            )}

            <View style={s.demoBox}>
              <Text style={s.demoTitle}>Credenciales de demostración</Text>
              <Text style={s.demoText}>admin@agropipes.com</Text>
              <Text style={s.demoText}>AgroPipes2026!</Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─── Tab Navigation ───────────────────────────────────────────────────────────
  const TABS = [
    { id: "dashboard", label: "Inicio", icon: "🏠" },
    { id: "work", label: "Jornales", icon: "📋" },
    { id: "activities", label: "Lote", icon: "🌾" },
    { id: "harvest", label: "Cosecha", icon: "🚜" },
    { id: "fuel", label: "Combustible", icon: "⛽" },
  ];

  const m = dashboard?.metrics || {};
  const period = dashboard?.period;

  // ─── Main App Screen ──────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>AGRO PIPES</Text>
          <Text style={s.headerSub}>{user.name} · {ROLES_ES[user.role] || user.role}</Text>
        </View>
        <GhostBtn label="Salir" onPress={handleLogout} icon="⎋" />
      </View>

      {/* Tab bar */}
      <View style={s.tabBar}>
        {TABS.map(tab => (
          <Pressable
            key={tab.id}
            style={[s.tab, activeTab === tab.id && s.tabActive]}
            onPress={() => setActiveTab(tab.id)}
          >
            <Text style={s.tabIcon}>{tab.icon}</Text>
            <Text style={[s.tabLabel, activeTab === tab.id && s.tabLabelActive]}>{tab.label}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={s.screen}>
        <FeedbackBox error={error} success={success} onClear={() => { setError(""); setSuccess(""); }} />

        {/* ── Dashboard ── */}
        {activeTab === "dashboard" && (
          <View style={s.tabContent}>
            <Section title="📊 Resumen de quincena" subtitle={period ? `${period.start} → ${period.end}` : "Cargando…"}>
              <KpiRow items={[
                { icon: "⏱️", label: "Horas", value: m.hoursThisFortnight?.toFixed(1) },
                { icon: "🌾", label: "Tolvas", value: m.hoppersThisFortnight },
                { icon: "⛽", label: "Litros", value: m.fuelLitersFortnight?.toFixed(0) },
                { icon: "🗺️", label: "Lotes", value: m.activeLots },
                { icon: "👥", label: "Empleados", value: m.activeEmployees },
                { icon: "⚙️", label: "Máquinas", value: m.activeMachinery },
              ]} />
            </Section>

            <PrimaryBtn label="Actualizar datos" onPress={() => loadData()} loading={loading} icon="↻" />

            <Section title="📋 Últimas jornadas">
              {workLogs.slice(0, 5).map(item => (
                <View key={`w-${item.id}`} style={s.listRow}>
                  <Text style={s.listDate}>{item.workDate}</Text>
                  <Text style={s.listMain}>{item.employeeName} · {item.functionName}</Text>
                  <Text style={s.listSub}>{item.lotCode} · {item.hoursWorked} h</Text>
                </View>
              ))}
            </Section>

            <Section title="🚜 Últimas cosechas">
              {harvestLogs.slice(0, 5).map(item => (
                <View key={`h-${item.id}`} style={s.listRow}>
                  <Text style={s.listDate}>{item.harvestDate}</Text>
                  <Text style={s.listMain}>{item.employeeName} · {item.machineName}</Text>
                  <Text style={s.listSub}>{item.lotCode} · {item.hoppersHarvested} tolvas · {item.hoursOperated} h</Text>
                </View>
              ))}
            </Section>

            {canSeePayroll && (
              <Section title="💰 Consolidado quincenal">
                {payroll.items.map(item => (
                  <View key={item.employeeId} style={s.listRow}>
                    <Text style={s.listMain}>{item.employeeName}</Text>
                    <Text style={s.listSub}>{ROLES_ES[item.role] || item.role} · {item.totalHours?.toFixed(1)} horas</Text>
                  </View>
                ))}
              </Section>
            )}

            <Section title="📌 Lotes y empleados">
              <Text style={s.refTitle}>Lotes</Text>
              {lots.map(l => <Text key={l.id} style={s.refItem}>#{l.id} {l.code} – {l.name} ({l.hectares} ha)</Text>)}
              <Text style={[s.refTitle, { marginTop: 8 }]}>Empleados</Text>
              {employees.map(e => <Text key={e.id} style={s.refItem}>#{e.id} {e.name} – {ROLES_ES[e.role] || e.role}</Text>)}
            </Section>
          </View>
        )}

        {/* ── Work Logs ── */}
        {activeTab === "work" && (
          <View style={s.tabContent}>
            <Section title="📋 Registrar jornada diaria" subtitle="Función, lote y horas del día.">
              <Field label="Empleado">
                {employees.map(emp => (
                  <Pressable
                    key={emp.id}
                    style={[s.selectOption, workForm.employeeId === String(emp.id) && s.selectOptionActive]}
                    onPress={() => setWorkForm(f => ({ ...f, employeeId: String(emp.id) }))}
                  >
                    <Text style={workForm.employeeId === String(emp.id) ? s.selectOptionTextActive : s.selectOptionText}>
                      {emp.name}
                    </Text>
                  </Pressable>
                ))}
              </Field>

              <Field label="Lote">
                {lots.map(l => (
                  <Pressable
                    key={l.id}
                    style={[s.selectOption, workForm.lotId === String(l.id) && s.selectOptionActive]}
                    onPress={() => setWorkForm(f => ({ ...f, lotId: String(l.id) }))}
                  >
                    <Text style={workForm.lotId === String(l.id) ? s.selectOptionTextActive : s.selectOptionText}>
                      {l.code} – {l.name}
                    </Text>
                  </Pressable>
                ))}
              </Field>

              <Input label="Fecha (YYYY-MM-DD)" value={workForm.workDate} onChangeText={v => setWorkForm(f => ({ ...f, workDate: v }))} />
              <Input label="Función / Labor realizada" value={workForm.functionName} onChangeText={v => setWorkForm(f => ({ ...f, functionName: v }))} placeholder="Ej: Siembra, riego, abono..." />
              <Input label="Horas trabajadas" value={workForm.hoursWorked} onChangeText={v => setWorkForm(f => ({ ...f, hoursWorked: v }))} keyboardType="decimal-pad" />
              <Input label="Observaciones" value={workForm.notes} onChangeText={v => setWorkForm(f => ({ ...f, notes: v }))} multiline numberOfLines={3} />

              <PrimaryBtn
                label="Guardar jornada"
                icon="✓"
                loading={loading}
                onPress={() => submit(
                  "/work-logs",
                  { ...workForm, employeeId: +workForm.employeeId, lotId: +workForm.lotId, hoursWorked: +workForm.hoursWorked },
                  () => setWorkForm(f => ({ ...f, functionName: "", notes: "" })),
                )}
              />
            </Section>

            <Section title="Últimas jornadas">
              {workLogs.slice(0, 8).map(item => (
                <View key={item.id} style={s.listRow}>
                  <Text style={s.listDate}>{item.workDate}</Text>
                  <Text style={s.listMain}>{item.employeeName} · {item.functionName}</Text>
                  <Text style={s.listSub}>{item.lotCode} · {item.hoursWorked} h</Text>
                </View>
              ))}
            </Section>
          </View>
        )}

        {/* ── Activities ── */}
        {activeTab === "activities" && (
          <View style={s.tabContent}>
            <Section title="🌾 Actividad por lote" subtitle="Abonos, fumigaciones, riego y labores.">
              <Field label="Lote">
                {lots.map(l => (
                  <Pressable
                    key={l.id}
                    style={[s.selectOption, activityForm.lotId === String(l.id) && s.selectOptionActive]}
                    onPress={() => setActivityForm(f => ({ ...f, lotId: String(l.id) }))}
                  >
                    <Text style={activityForm.lotId === String(l.id) ? s.selectOptionTextActive : s.selectOptionText}>
                      {l.code} – {l.name}
                    </Text>
                  </Pressable>
                ))}
              </Field>

              <Field label="Tipo de actividad">
                {["Abono", "Fumigacion", "Riego", "Siembra", "Control maleza", "Preparacion suelo", "Monitoreo"].map(t => (
                  <Pressable
                    key={t}
                    style={[s.selectOption, activityForm.activityType === t && s.selectOptionActive]}
                    onPress={() => setActivityForm(f => ({ ...f, activityType: t }))}
                  >
                    <Text style={activityForm.activityType === t ? s.selectOptionTextActive : s.selectOptionText}>{t}</Text>
                  </Pressable>
                ))}
              </Field>

              <Input label="Fecha (YYYY-MM-DD)" value={activityForm.performedOn} onChangeText={v => setActivityForm(f => ({ ...f, performedOn: v }))} />
              <Input label="Insumo / Producto" value={activityForm.inputName} onChangeText={v => setActivityForm(f => ({ ...f, inputName: v }))} placeholder="Ej: Urea 46%, Lambda-cialotrina..." />
              <Input label="Dosis (por ha)" value={activityForm.dose} onChangeText={v => setActivityForm(f => ({ ...f, dose: v }))} placeholder="Ej: 120 kg/ha" />
              <Input label="Cantidad total" value={activityForm.quantity} onChangeText={v => setActivityForm(f => ({ ...f, quantity: v }))} keyboardType="decimal-pad" placeholder="0" />
              <Input label="Unidad (bultos, litros, kg...)" value={activityForm.unit} onChangeText={v => setActivityForm(f => ({ ...f, unit: v }))} />
              <Input label="Observaciones" value={activityForm.notes} onChangeText={v => setActivityForm(f => ({ ...f, notes: v }))} multiline numberOfLines={3} />

              <PrimaryBtn
                label="Guardar actividad"
                icon="✓"
                loading={loading}
                onPress={() => submit(
                  "/lot-activities",
                  { ...activityForm, lotId: +activityForm.lotId, quantity: activityForm.quantity ? +activityForm.quantity : null },
                  () => setActivityForm(f => ({ ...f, inputName: "", dose: "", quantity: "", notes: "" })),
                )}
              />
            </Section>

            <Section title="Historial de actividades">
              {activities.slice(0, 10).map(item => (
                <View key={item.id} style={s.listRow}>
                  <Text style={s.listDate}>{item.performedOn}</Text>
                  <Text style={s.listMain}>{item.lotCode} · {item.activityType}</Text>
                  <Text style={s.listSub}>{item.inputName || "—"} · {item.quantity ? `${item.quantity} ${item.unit}` : item.dose || "—"}</Text>
                </View>
              ))}
            </Section>
          </View>
        )}

        {/* ── Harvest ── */}
        {activeTab === "harvest" && (
          <View style={s.tabContent}>
            <Section title="🚜 Registro de cosecha" subtitle="Tolvas cosechadas por jornada.">
              <Field label="Maquinista">
                {employees.map(emp => (
                  <Pressable
                    key={emp.id}
                    style={[s.selectOption, harvestForm.employeeId === String(emp.id) && s.selectOptionActive]}
                    onPress={() => setHarvestForm(f => ({ ...f, employeeId: String(emp.id) }))}
                  >
                    <Text style={harvestForm.employeeId === String(emp.id) ? s.selectOptionTextActive : s.selectOptionText}>
                      {emp.name} ({ROLES_ES[emp.role] || emp.role})
                    </Text>
                  </Pressable>
                ))}
              </Field>

              <Field label="Lote">
                {lots.map(l => (
                  <Pressable
                    key={l.id}
                    style={[s.selectOption, harvestForm.lotId === String(l.id) && s.selectOptionActive]}
                    onPress={() => setHarvestForm(f => ({ ...f, lotId: String(l.id) }))}
                  >
                    <Text style={harvestForm.lotId === String(l.id) ? s.selectOptionTextActive : s.selectOptionText}>
                      {l.code} – {l.name}
                    </Text>
                  </Pressable>
                ))}
              </Field>

              <Input label="Fecha (YYYY-MM-DD)" value={harvestForm.harvestDate} onChangeText={v => setHarvestForm(f => ({ ...f, harvestDate: v }))} />

              <Field label="Cosechadora">
                {machinery.filter(m => m.type === "cosechadora").map(m => (
                  <Pressable
                    key={m.id}
                    style={[s.selectOption, harvestForm.machineName === m.name && s.selectOptionActive]}
                    onPress={() => setHarvestForm(f => ({ ...f, machineName: m.name }))}
                  >
                    <Text style={harvestForm.machineName === m.name ? s.selectOptionTextActive : s.selectOptionText}>
                      {m.code} – {m.name}
                    </Text>
                  </Pressable>
                ))}
              </Field>

              <Input label="Máquina (nombre manual)" value={harvestForm.machineName} onChangeText={v => setHarvestForm(f => ({ ...f, machineName: v }))} placeholder="Ej: Cosechadora CAT-01" />
              <Input label="Tolvas cosechadas" value={harvestForm.hoppersHarvested} onChangeText={v => setHarvestForm(f => ({ ...f, hoppersHarvested: v }))} keyboardType="numeric" />
              <Input label="Horas de operación" value={harvestForm.hoursOperated} onChangeText={v => setHarvestForm(f => ({ ...f, hoursOperated: v }))} keyboardType="decimal-pad" />
              <Input label="Observaciones" value={harvestForm.notes} onChangeText={v => setHarvestForm(f => ({ ...f, notes: v }))} multiline numberOfLines={3} />

              <PrimaryBtn
                label="Guardar cosecha"
                icon="✓"
                loading={loading}
                onPress={() => submit(
                  "/harvest-logs",
                  { ...harvestForm, employeeId: +harvestForm.employeeId, lotId: +harvestForm.lotId, hoppersHarvested: +harvestForm.hoppersHarvested, hoursOperated: +harvestForm.hoursOperated },
                  () => setHarvestForm(f => ({ ...f, hoppersHarvested: "0", notes: "" })),
                )}
              />
            </Section>

            <Section title="Historial de cosecha">
              {harvestLogs.slice(0, 8).map(item => (
                <View key={item.id} style={s.listRow}>
                  <Text style={s.listDate}>{item.harvestDate}</Text>
                  <Text style={s.listMain}>{item.machineName} · {item.lotCode}</Text>
                  <Text style={s.listSub}>{item.employeeName} · {item.hoppersHarvested} tolvas · {item.hoursOperated} h</Text>
                </View>
              ))}
            </Section>
          </View>
        )}

        {/* ── Fuel ── */}
        {activeTab === "fuel" && (
          <View style={s.tabContent}>
            <Section title="⛽ Combustible / ACPPM" subtitle="Registro de compras de combustible para maquinaria.">
              <Input label="Fecha (YYYY-MM-DD)" value={fuelForm.purchaseDate} onChangeText={v => setFuelForm(f => ({ ...f, purchaseDate: v }))} />

              <Field label="Tipo de combustible">
                {["ACPPM", "diesel", "gasolina"].map(t => (
                  <Pressable
                    key={t}
                    style={[s.selectOption, fuelForm.fuelType === t && s.selectOptionActive]}
                    onPress={() => setFuelForm(f => ({ ...f, fuelType: t }))}
                  >
                    <Text style={fuelForm.fuelType === t ? s.selectOptionTextActive : s.selectOptionText}>{t}</Text>
                  </Pressable>
                ))}
              </Field>

              <Input label="Litros" value={fuelForm.quantityLiters} onChangeText={v => setFuelForm(f => ({ ...f, quantityLiters: v }))} keyboardType="decimal-pad" placeholder="0.0" />
              <Input label="Precio por litro ($)" value={fuelForm.pricePerLiter} onChangeText={v => setFuelForm(f => ({ ...f, pricePerLiter: v }))} keyboardType="decimal-pad" placeholder="0" />
              <Input label="Proveedor / Estación" value={fuelForm.supplier} onChangeText={v => setFuelForm(f => ({ ...f, supplier: v }))} placeholder="Nombre de la estación..." />
              <Input label="N° Factura" value={fuelForm.invoiceNumber} onChangeText={v => setFuelForm(f => ({ ...f, invoiceNumber: v }))} placeholder="FE-0000000" />
              <Input label="Notas" value={fuelForm.notes} onChangeText={v => setFuelForm(f => ({ ...f, notes: v }))} multiline numberOfLines={2} />

              <PrimaryBtn
                label="Registrar compra"
                icon="✓"
                loading={loading}
                onPress={() => submit(
                  "/fuel-purchases",
                  { ...fuelForm, quantityLiters: +fuelForm.quantityLiters, pricePerLiter: fuelForm.pricePerLiter ? +fuelForm.pricePerLiter : null },
                  () => setFuelForm(f => ({ ...f, quantityLiters: "", pricePerLiter: "", supplier: "", invoiceNumber: "", notes: "" })),
                )}
              />
            </Section>

            <Section title="Historial de combustible">
              {fuelPurchases.slice(0, 10).map(item => (
                <View key={item.id} style={s.listRow}>
                  <Text style={s.listDate}>{item.purchaseDate}</Text>
                  <Text style={s.listMain}>{item.fuelType} · {item.quantityLiters} L</Text>
                  <Text style={s.listSub}>{item.machineName || "Sin máquina"} · {item.totalCost ? `$${Number(item.totalCost).toLocaleString("es-CO")}` : "—"}</Text>
                </View>
              ))}
            </Section>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const G = {
  bg: "#f2f5f2",
  primary: "#1a5c35",
  primaryDark: "#0f3020",
  primaryLight: "#2d8653",
  accent: "#c8971a",
  white: "#ffffff",
  card: "#ffffff",
  border: "#d4e4d4",
  text: "#1a2e1a",
  textMuted: "#5c7060",
  error: "#9b2424",
  errorBg: "#fee2e2",
  successBg: "#e8f5ec",
};

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: G.primary },
  loginContainer: { flexGrow: 1, justifyContent: "center", padding: 20, backgroundColor: G.primaryDark },
  loginCard: { backgroundColor: G.white, borderRadius: 20, padding: 24, gap: 14, shadowColor: "#000", shadowOpacity: .15, shadowRadius: 20, elevation: 8 },
  logo: { width: 100, height: 100, alignSelf: "center", borderRadius: 50 },
  appTitle: { fontSize: 26, fontWeight: "800", color: G.primary, textAlign: "center" },
  appSubtitle: { fontSize: 13, color: G.textMuted, textAlign: "center", marginTop: -8 },

  // Header
  header: { flexDirection: "row", alignItems: "center", backgroundColor: G.primaryDark, paddingHorizontal: 16, paddingVertical: 12, paddingTop: 16, gap: 12 },
  headerTitle: { fontSize: 17, fontWeight: "800", color: G.white },
  headerSub: { fontSize: 12, color: "rgba(255,255,255,.6)" },

  // Tabs
  tabBar: { flexDirection: "row", backgroundColor: G.primary, paddingBottom: 2 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 8, opacity: 0.65 },
  tabActive: { opacity: 1, borderBottomWidth: 2, borderBottomColor: G.white },
  tabIcon: { fontSize: 16 },
  tabLabel: { fontSize: 10, color: "rgba(255,255,255,.7)", marginTop: 2 },
  tabLabelActive: { color: G.white, fontWeight: "700" },

  screen: { backgroundColor: G.bg, padding: 14, gap: 14, paddingBottom: 32 },
  tabContent: { gap: 14 },

  // Sections
  section: { backgroundColor: G.white, borderRadius: 14, padding: 16, shadowColor: "#000", shadowOpacity: .04, shadowRadius: 8, elevation: 2 },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: G.primary, marginBottom: 2 },
  sectionSub: { fontSize: 12, color: G.textMuted, marginBottom: 10 },
  sectionBody: { gap: 10, marginTop: 10 },

  // KPI
  kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  kpiCard: { flex: 1, minWidth: 90, backgroundColor: "#f2faf4", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: G.border, alignItems: "center" },
  kpiIcon: { fontSize: 18 },
  kpiValue: { fontSize: 20, fontWeight: "800", color: G.primary, marginTop: 2 },
  kpiLabel: { fontSize: 10, color: G.textMuted, marginTop: 2 },

  // Forms
  field: { gap: 5 },
  fieldLabel: { fontSize: 12, fontWeight: "700", color: G.primary },
  input: { backgroundColor: G.bg, borderWidth: 1.5, borderColor: G.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: G.text, fontSize: 14 },

  // Select options
  selectOption: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5, borderColor: G.border, marginBottom: 4, backgroundColor: G.bg },
  selectOptionActive: { backgroundColor: G.primary, borderColor: G.primary },
  selectOptionText: { color: G.text, fontSize: 13 },
  selectOptionTextActive: { color: G.white, fontWeight: "700", fontSize: 13 },

  // Buttons
  btn: { backgroundColor: G.primary, borderRadius: 12, paddingVertical: 13, alignItems: "center", marginTop: 4 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: G.white, fontWeight: "800", fontSize: 15 },
  ghostBtn: { borderRadius: 12, paddingVertical: 11, alignItems: "center", borderWidth: 1.5, borderColor: G.border, backgroundColor: G.bg, marginTop: 4 },
  ghostBtnText: { color: G.primary, fontWeight: "700", fontSize: 14 },

  // Lists
  listRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: G.border },
  listDate: { fontSize: 11, color: G.textMuted, marginBottom: 1 },
  listMain: { fontSize: 13, fontWeight: "700", color: G.text },
  listSub: { fontSize: 12, color: G.textMuted, marginTop: 1 },

  // Feedback
  feedbackBox: { borderRadius: 10, padding: 12, marginBottom: 4 },
  feedbackError: { backgroundColor: G.errorBg },
  feedbackSuccess: { backgroundColor: G.successBg },
  errorText: { color: G.error, fontWeight: "700" },
  successText: { color: G.primary, fontWeight: "700" },

  // Demo box
  demoBox: { backgroundColor: "#f2faf4", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: G.border },
  demoTitle: { fontSize: 12, fontWeight: "700", color: G.primary, marginBottom: 4 },
  demoText: { fontSize: 12, color: G.textMuted, fontFamily: "monospace" },

  // Reference
  refTitle: { fontSize: 12, fontWeight: "800", color: G.primary },
  refItem: { fontSize: 12, color: G.textMuted, lineHeight: 20 },
});
