import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AppState,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { apiRequest } from "./src/lib/api";

const TOKEN_KEY = "agro-pipes-token";
const USER_KEY = "agro-pipes-user";
const API_URL_KEY = "agro-pipes-api-url";
const BIOMETRIC_ENABLED_KEY = "agro-pipes-biometric-enabled";
const PRODUCTION_API_URL = "https://agro-pipes-api.onrender.com/api";
const DEFAULT_API_URL = PRODUCTION_API_URL;

const today = () => new Date().toISOString().slice(0, 10);
const ROLES_ES = { admin: "Administrador", supervisor: "Supervisor", machinist: "Maquinista", operator: "Operario" };
const TABS = [
  { id: "dashboard", label: "Inicio", icon: "Inicio" },
  { id: "work", label: "Jornales", icon: "Jornales" },
  { id: "activities", label: "Lote", icon: "Lote" },
  { id: "harvest", label: "Cosecha", icon: "Cosecha" },
  { id: "fuel", label: "Combustible", icon: "ACPPM" },
];

function normalizeApiUrl(value) {
  let normalized = (value || "").trim();
  if (!normalized) return DEFAULT_API_URL;
  if (!/^https?:\/\//i.test(normalized)) {
    const useHttp = /^(localhost|127\.0\.0\.1|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/|$)/i.test(normalized);
    normalized = `${useHttp ? "http" : "https"}://${normalized}`;
  }
  normalized = normalized.replace(/\/+$/, "");
  if (!/\/api$/i.test(normalized)) {
    normalized = `${normalized}/api`;
  }
  return normalized;
}

function Section({ title, subtitle, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function MessageBox({ error, success, onClear }) {
  if (!error && !success) return null;
  return (
    <Pressable onPress={onClear} style={[styles.messageBox, error ? styles.messageError : styles.messageSuccess]}>
      <Text style={error ? styles.messageErrorText : styles.messageSuccessText}>{error || success}</Text>
      <Text style={styles.messageHint}>Toca para cerrar</Text>
    </Pressable>
  );
}

function Field({ label, children }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function Input({ label, ...props }) {
  return (
    <Field label={label}>
      <TextInput placeholderTextColor="#8ca091" style={styles.input} {...props} />
    </Field>
  );
}

function PrimaryButton({ label, onPress, loading }) {
  return (
    <Pressable style={[styles.primaryButton, loading && styles.buttonDisabled]} onPress={onPress} disabled={loading}>
      <Text style={styles.primaryButtonText}>{loading ? "Cargando..." : label}</Text>
    </Pressable>
  );
}

function GhostButton({ label, onPress }) {
  return (
    <Pressable style={styles.ghostButton} onPress={onPress}>
      <Text style={styles.ghostButtonText}>{label}</Text>
    </Pressable>
  );
}

function ChipSelector({ items, selectedValue, onChange, valueKey = "id", labelKey = "name" }) {
  return (
    <View style={styles.chipWrap}>
      {items.map((item) => {
        const value = String(item[valueKey]);
        const selected = selectedValue === value;
        return (
          <Pressable key={value} style={[styles.chip, selected && styles.chipActive]} onPress={() => onChange(value)}>
            <Text style={[styles.chipText, selected && styles.chipTextActive]}>{item[labelKey]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function MetricCard({ label, value, helper }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      {helper ? <Text style={styles.metricHelper}>{helper}</Text> : null}
    </View>
  );
}

function ListRow({ title, subtitle, meta }) {
  return (
    <View style={styles.listRow}>
      <Text style={styles.listMeta}>{meta}</Text>
      <Text style={styles.listTitle}>{title}</Text>
      <Text style={styles.listSubtitle}>{subtitle}</Text>
    </View>
  );
}

export default function App() {
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [token, setToken] = useState("");
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [locked, setLocked] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");
  const appStateRef = useRef(AppState.currentState);

  const [dashboard, setDashboard] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [lots, setLots] = useState([]);
  const [machinery, setMachinery] = useState([]);
  const [workLogs, setWorkLogs] = useState([]);
  const [activities, setActivities] = useState([]);
  const [harvestLogs, setHarvestLogs] = useState([]);
  const [fuelPurchases, setFuelPurchases] = useState([]);
  const [payroll, setPayroll] = useState({ period: null, items: [] });

  const [loginForm, setLoginForm] = useState({ email: "admin@agropipes.com", password: "AgroPipes2026!" });
  const [workForm, setWorkForm] = useState({ employeeId: "", lotId: "", workDate: today(), functionName: "", hoursWorked: "8", machineId: "", notes: "" });
  const [activityForm, setActivityForm] = useState({ lotId: "", performedOn: today(), activityType: "Abono", inputName: "", dose: "", quantity: "", unit: "bultos", machineId: "", notes: "" });
  const [harvestForm, setHarvestForm] = useState({ employeeId: "", lotId: "", harvestDate: today(), machineId: "", machineName: "", hoppersHarvested: "0", hoursOperated: "8", notes: "" });
  const [fuelForm, setFuelForm] = useState({ purchaseDate: today(), fuelType: "ACPPM", quantityLiters: "", pricePerLiter: "", supplier: "", invoiceNumber: "", machineId: "", notes: "" });

  const canSeePayroll = useMemo(() => ["admin", "supervisor"].includes(user?.role), [user]);

  const clearMessages = () => {
    setError("");
    setSuccess("");
  };

  const hydrateDefaults = useCallback(() => {
    if (!employees.length || !lots.length) return;
    const machinist = employees.find((item) => item.role === "machinist") || employees[0];
    setWorkForm((current) => ({
      ...current,
      employeeId: current.employeeId || String(employees[0].id),
      lotId: current.lotId || String(lots[0].id),
    }));
    setActivityForm((current) => ({
      ...current,
      lotId: current.lotId || String(lots[0].id),
    }));
    setHarvestForm((current) => ({
      ...current,
      employeeId: current.employeeId || String(machinist.id),
      lotId: current.lotId || String(lots[0].id),
      machineId: current.machineId || String(machinery[0]?.id || ""),
      machineName: current.machineName || machinery[0]?.name || "",
    }));
    setFuelForm((current) => ({
      ...current,
      machineId: current.machineId || String(machinery[0]?.id || ""),
    }));
  }, [employees, lots, machinery]);

  useEffect(() => {
    (async () => {
      try {
        const [savedUrl, savedToken, savedUser, savedBiometricEnabled] = await Promise.all([
          AsyncStorage.getItem(API_URL_KEY),
          SecureStore.getItemAsync(TOKEN_KEY),
          SecureStore.getItemAsync(USER_KEY),
          AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY),
        ]);

        if (savedUrl) setApiUrl(savedUrl);
        setBiometricEnabled(savedBiometricEnabled === "true");

        if (savedToken && savedUser) {
          setToken(savedToken);
          setUser(JSON.parse(savedUser));
          if (savedBiometricEnabled === "true") {
            setLocked(true);
          }
        }
      } catch (_) {}

      try {
        const compatible = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        setBiometricAvailable(compatible && enrolled);
      } catch (_) {
        setBiometricAvailable(false);
      }
    })();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (
        biometricEnabled &&
        token &&
        user &&
        appStateRef.current.match(/inactive|background/) &&
        nextState === "active"
      ) {
        setLocked(true);
      }
      appStateRef.current = nextState;
    });

    return () => subscription.remove();
  }, [biometricEnabled, token, user]);

  useEffect(() => {
    if (token) {
      loadData(token);
    }
  }, [token, apiUrl]);

  useEffect(() => {
    hydrateDefaults();
  }, [hydrateDefaults]);

  const loadData = useCallback(async (activeToken = token) => {
    if (!activeToken) return;
    setLoading(true);
    setError("");

    const requests = await Promise.allSettled([
      apiRequest(apiUrl, "/dashboard/summary", { token: activeToken }),
      apiRequest(apiUrl, "/employees", { token: activeToken }),
      apiRequest(apiUrl, "/lots", { token: activeToken }),
      apiRequest(apiUrl, "/machinery", { token: activeToken }),
      apiRequest(apiUrl, "/work-logs", { token: activeToken }),
      apiRequest(apiUrl, "/lot-activities", { token: activeToken }),
      apiRequest(apiUrl, "/harvest-logs", { token: activeToken }),
      apiRequest(apiUrl, "/fuel-purchases", { token: activeToken }),
      ...(canSeePayroll ? [apiRequest(apiUrl, "/payroll/fortnight", { token: activeToken })] : []),
    ]);

    const [dash, emp, lot, machine, work, activity, harvest, fuel, pay] = requests;
    if (dash.status === "fulfilled") setDashboard(dash.value);
    if (emp.status === "fulfilled") setEmployees(emp.value.items || []);
    if (lot.status === "fulfilled") setLots(lot.value.items || []);
    if (machine.status === "fulfilled") setMachinery(machine.value.items || []);
    if (work.status === "fulfilled") setWorkLogs(work.value.items || []);
    if (activity.status === "fulfilled") setActivities(activity.value.items || []);
    if (harvest.status === "fulfilled") setHarvestLogs(harvest.value.items || []);
    if (fuel.status === "fulfilled") setFuelPurchases(fuel.value.items || []);
    if (pay?.status === "fulfilled") setPayroll(pay.value);

    const failed = requests.find((result) => result.status === "rejected");
    if (failed?.reason) setError(failed.reason.message);
    setLoading(false);
  }, [token, apiUrl, canSeePayroll]);

  async function handleLogin() {
    setLoading(true);
    setError("");
    try {
      const normalizedUrl = normalizeApiUrl(apiUrl);
      setApiUrl(normalizedUrl);
      await AsyncStorage.setItem(API_URL_KEY, normalizedUrl);
      await apiRequest(normalizedUrl, "/health");
      const result = await apiRequest(normalizedUrl, "/auth/login", { method: "POST", body: loginForm });
      await SecureStore.setItemAsync(TOKEN_KEY, result.token);
      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(result.user));
      setToken(result.token);
      setUser(result.user);
      setLocked(false);
      setSuccess(`Bienvenido, ${result.user.name}.`);

      if (biometricAvailable && !biometricEnabled) {
        Alert.alert(
          "Activar huella digital",
          "Quieres habilitar acceso biometrico para futuros ingresos?",
          [
            { text: "Ahora no", style: "cancel" },
            {
              text: "Activar",
              onPress: async () => {
                await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, "true");
                setBiometricEnabled(true);
                setSuccess("Huella digital activada.");
              },
            },
          ],
        );
      }
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  async function handleUseProductionUrl() {
    const normalizedUrl = normalizeApiUrl(PRODUCTION_API_URL);
    setApiUrl(normalizedUrl);
    await AsyncStorage.setItem(API_URL_KEY, normalizedUrl);
    setSuccess("URL de produccion cargada.");
    setError("");
  }

  async function handleCheckServer() {
    setLoading(true);
    clearMessages();
    try {
      const normalizedUrl = normalizeApiUrl(apiUrl);
      setApiUrl(normalizedUrl);
      await AsyncStorage.setItem(API_URL_KEY, normalizedUrl);
      await apiRequest(normalizedUrl, "/health");
      setSuccess(`Servidor disponible: ${normalizedUrl}`);
    } catch (err) {
      setError(`No se pudo conectar al servidor configurado. ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleBiometricUnlock() {
    const savedToken = await SecureStore.getItemAsync(TOKEN_KEY);
    const savedUser = await SecureStore.getItemAsync(USER_KEY);
    if (!savedToken || !savedUser) {
      setError("No existe una sesion guardada para desbloquear.");
      return;
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Desbloquea AGRO PIPES",
      cancelLabel: "Cancelar",
      fallbackLabel: "Usar contrasena",
    });

    if (!result.success) {
      setError("Autenticacion biometrica fallida.");
      return;
    }

    setToken(savedToken);
    setUser(JSON.parse(savedUser));
    setLocked(false);
    setSuccess("Sesion desbloqueada con huella digital.");
  }

  async function toggleBiometricAccess(enabled) {
    if (!biometricAvailable) {
      setError("Este dispositivo no tiene huella disponible.");
      return;
    }

    if (enabled) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Confirma para activar huella digital",
        cancelLabel: "Cancelar",
        fallbackLabel: "Usar contrasena",
      });
      if (!result.success) {
        setError("No se pudo activar la huella digital.");
        return;
      }
      await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, "true");
      setBiometricEnabled(true);
      setSuccess("Huella digital activada.");
      return;
    }

    await AsyncStorage.removeItem(BIOMETRIC_ENABLED_KEY);
    setBiometricEnabled(false);
    setLocked(false);
    setSuccess("Huella digital desactivada.");
  }

  async function handleLogout() {
    await Promise.all([
      SecureStore.deleteItemAsync(TOKEN_KEY),
      SecureStore.deleteItemAsync(USER_KEY),
      AsyncStorage.removeItem(BIOMETRIC_ENABLED_KEY),
    ]);
    setToken("");
    setUser(null);
    setLocked(false);
    setBiometricEnabled(false);
    setDashboard(null);
    setEmployees([]);
    setLots([]);
    setMachinery([]);
    setWorkLogs([]);
    setActivities([]);
    setHarvestLogs([]);
    setFuelPurchases([]);
    setPayroll({ period: null, items: [] });
  }

  async function submit(path, body, resetter) {
    setLoading(true);
    clearMessages();
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

  const periodLabel = dashboard?.period ? `${dashboard.period.start} -> ${dashboard.period.end}` : "Sin periodo";
  const metrics = dashboard?.metrics || {};
  const biometricButtonLabel = biometricEnabled ? "Entrar con huella digital" : "Huella disponible en este celular";

  if (!user || !token) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="light" />
        <ScrollView contentContainerStyle={styles.loginScreen}>
          <View style={styles.loginCard}>
            <Image source={require("./assets/agro-pipes-logo.png")} style={styles.logo} />
            <Text style={styles.appTitle}>AGRO PIPES</Text>
            <Text style={styles.appSubtitle}>Sistema Agricola movil</Text>
            <MessageBox error={error} success={success} onClear={clearMessages} />
            <Input label="URL del servidor" value={apiUrl} onChangeText={setApiUrl} autoCapitalize="none" autoCorrect={false} />
            <View style={styles.serverActions}>
              <View style={styles.serverAction}>
                <GhostButton label="Usar produccion" onPress={handleUseProductionUrl} />
              </View>
              <View style={styles.serverAction}>
                <GhostButton label="Probar servidor" onPress={handleCheckServer} />
              </View>
            </View>
            <Text style={styles.serverHint}>Produccion esperada: {PRODUCTION_API_URL}</Text>
            <Input label="Correo" value={loginForm.email} onChangeText={(value) => setLoginForm((current) => ({ ...current, email: value }))} autoCapitalize="none" />
            <Input label="Contrasena" value={loginForm.password} onChangeText={(value) => setLoginForm((current) => ({ ...current, password: value }))} secureTextEntry />
            <PrimaryButton label="Iniciar sesion" onPress={handleLogin} loading={loading} />
            <View style={[styles.biometricPanel, biometricAvailable ? styles.biometricPanelActive : styles.biometricPanelMuted]}>
              <Text style={styles.biometricPanelTitle}>Acceso biometrico</Text>
              <Text style={styles.biometricPanelText}>
                {biometricAvailable
                  ? biometricEnabled
                    ? "La huella digital esta activa. Puedes entrar o desbloquear con biometria."
                    : "La huella esta disponible en este dispositivo. Inicia sesion y activala desde Seguridad."
                  : "Este dispositivo no tiene huella configurada o no ofrece biometria compatible."}
              </Text>
              {biometricAvailable ? (
                <GhostButton
                  label={biometricButtonLabel}
                  onPress={() => {
                    if (biometricEnabled) {
                      handleBiometricUnlock();
                      return;
                    }
                    Alert.alert("Huella disponible", "Inicia sesion con tu correo y luego activala desde el bloque de Seguridad.");
                  }}
                />
              ) : null}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (locked) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="light" />
        <View style={styles.lockScreen}>
          <Image source={require("./assets/agro-pipes-logo.png")} style={styles.lockLogo} />
          <Text style={styles.lockTitle}>Sesion protegida</Text>
          <Text style={styles.lockSubtitle}>Usa tu huella digital para continuar.</Text>
          <PrimaryButton label="Desbloquear con huella" onPress={handleBiometricUnlock} loading={loading} />
          <GhostButton label="Cerrar sesion" onPress={handleLogout} />
          <MessageBox error={error} success={success} onClear={clearMessages} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>AGRO PIPES</Text>
          <Text style={styles.headerSubtitle}>{user.name} | {ROLES_ES[user.role] || user.role}</Text>
        </View>
        <GhostButton label="Salir" onPress={handleLogout} />
      </View>

      <View style={styles.tabBar}>
        {TABS.map((tab) => (
          <Pressable key={tab.id} style={[styles.tab, activeTab === tab.id && styles.tabActive]} onPress={() => setActiveTab(tab.id)}>
            <Text style={[styles.tabLabel, activeTab === tab.id && styles.tabLabelActive]}>{tab.label}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.screen}>
        <MessageBox error={error} success={success} onClear={clearMessages} />

        {activeTab === "dashboard" ? (
          <View style={styles.tabContent}>
            <Section title="Resumen quincenal" subtitle={periodLabel}>
              <View style={styles.metricGrid}>
                <MetricCard label="Horas" value={`${Number(metrics.hoursThisFortnight || 0).toFixed(1)} h`} />
                <MetricCard label="Tolvas" value={metrics.hoppersThisFortnight ?? 0} />
                <MetricCard label="Combustible" value={`${Number(metrics.fuelLitersFortnight || 0).toFixed(0)} L`} />
                <MetricCard label="Lotes" value={metrics.activeLots ?? 0} />
                <MetricCard label="Equipo" value={metrics.activeEmployees ?? 0} />
                <MetricCard label="Maquinaria" value={metrics.activeMachinery ?? 0} />
              </View>
              <PrimaryButton label="Actualizar datos" onPress={() => loadData()} loading={loading} />
            </Section>

            <Section title="Seguridad" subtitle="Control biometrico del dispositivo">
              <View style={styles.securityRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.securityTitle}>Acceso con huella digital</Text>
                  <Text style={styles.securitySubtitle}>
                    {biometricAvailable ? "Protege la sesion y desbloquea con biometria." : "Este dispositivo no tiene biometria disponible."}
                  </Text>
                </View>
                <Switch value={biometricEnabled} onValueChange={toggleBiometricAccess} disabled={!biometricAvailable} />
              </View>
            </Section>

            <Section title="Ultimas jornadas">
              {workLogs.slice(0, 5).map((item) => (
                <ListRow
                  key={`work-${item.id}`}
                  meta={item.workDate}
                  title={`${item.employeeName} | ${item.functionName}`}
                  subtitle={`${item.lotCode} | ${item.hoursWorked} h${item.machineName ? ` | ${item.machineName}` : ""}`}
                />
              ))}
            </Section>

            <Section title="Ultimas cosechas">
              {harvestLogs.slice(0, 5).map((item) => (
                <ListRow
                  key={`harvest-${item.id}`}
                  meta={item.harvestDate}
                  title={`${item.employeeName} | ${item.machineName}`}
                  subtitle={`${item.lotCode} | ${item.hoppersHarvested} tolvas | ${item.hoursOperated} h`}
                />
              ))}
            </Section>

            {canSeePayroll ? (
              <Section title="Consolidado quincenal">
                {payroll.items.map((item) => (
                  <ListRow
                    key={`pay-${item.employeeId}`}
                    meta={ROLES_ES[item.role] || item.role}
                    title={item.employeeName}
                    subtitle={`${Number(item.totalHours || 0).toFixed(1)} horas`}
                  />
                ))}
              </Section>
            ) : null}
          </View>
        ) : null}

        {activeTab === "work" ? (
          <Section title="Registrar jornada" subtitle="Funcion, lote, horas y maquinaria usada">
            <Field label="Empleado">
              <ChipSelector items={employees} selectedValue={workForm.employeeId} onChange={(value) => setWorkForm((current) => ({ ...current, employeeId: value }))} />
            </Field>
            <Field label="Lote">
              <ChipSelector items={lots.map((lot) => ({ ...lot, name: `${lot.code} - ${lot.name}` }))} selectedValue={workForm.lotId} onChange={(value) => setWorkForm((current) => ({ ...current, lotId: value }))} />
            </Field>
            <Input label="Fecha" value={workForm.workDate} onChangeText={(value) => setWorkForm((current) => ({ ...current, workDate: value }))} />
            <Input label="Funcion" value={workForm.functionName} onChangeText={(value) => setWorkForm((current) => ({ ...current, functionName: value }))} />
            <Input label="Horas trabajadas" value={workForm.hoursWorked} onChangeText={(value) => setWorkForm((current) => ({ ...current, hoursWorked: value }))} keyboardType="decimal-pad" />
            <Field label="Maquinaria (opcional)">
              <ChipSelector items={[{ id: "", name: "Sin maquinaria" }, ...machinery]} selectedValue={workForm.machineId} onChange={(value) => setWorkForm((current) => ({ ...current, machineId: value }))} />
            </Field>
            <Input label="Observaciones" value={workForm.notes} onChangeText={(value) => setWorkForm((current) => ({ ...current, notes: value }))} multiline />
            <PrimaryButton
              label="Guardar jornada"
              onPress={() =>
                submit(
                  "/work-logs",
                  {
                    ...workForm,
                    employeeId: Number(workForm.employeeId),
                    lotId: Number(workForm.lotId),
                    hoursWorked: Number(workForm.hoursWorked),
                    machineId: workForm.machineId ? Number(workForm.machineId) : null,
                  },
                  () => setWorkForm((current) => ({ ...current, workDate: today(), functionName: "", hoursWorked: "8", machineId: "", notes: "" })),
                )
              }
              loading={loading}
            />
          </Section>
        ) : null}

        {activeTab === "activities" ? (
          <Section title="Actividad por lote" subtitle="Abono, fumigacion, riego y seguimiento">
            <Field label="Lote">
              <ChipSelector items={lots.map((lot) => ({ ...lot, name: `${lot.code} - ${lot.name}` }))} selectedValue={activityForm.lotId} onChange={(value) => setActivityForm((current) => ({ ...current, lotId: value }))} />
            </Field>
            <Input label="Fecha" value={activityForm.performedOn} onChangeText={(value) => setActivityForm((current) => ({ ...current, performedOn: value }))} />
            <Field label="Tipo de actividad">
              <ChipSelector
                items={["Abono", "Fumigacion", "Riego", "Siembra", "Control maleza", "Monitoreo"].map((name) => ({ id: name, name }))}
                selectedValue={activityForm.activityType}
                onChange={(value) => setActivityForm((current) => ({ ...current, activityType: value }))}
                valueKey="id"
                labelKey="name"
              />
            </Field>
            <Input label="Insumo o producto" value={activityForm.inputName} onChangeText={(value) => setActivityForm((current) => ({ ...current, inputName: value }))} />
            <Input label="Dosis" value={activityForm.dose} onChangeText={(value) => setActivityForm((current) => ({ ...current, dose: value }))} />
            <Input label="Cantidad total" value={activityForm.quantity} onChangeText={(value) => setActivityForm((current) => ({ ...current, quantity: value }))} keyboardType="decimal-pad" />
            <Input label="Unidad" value={activityForm.unit} onChangeText={(value) => setActivityForm((current) => ({ ...current, unit: value }))} />
            <Field label="Maquinaria (opcional)">
              <ChipSelector items={[{ id: "", name: "Sin maquinaria" }, ...machinery]} selectedValue={activityForm.machineId} onChange={(value) => setActivityForm((current) => ({ ...current, machineId: value }))} />
            </Field>
            <Input label="Observaciones" value={activityForm.notes} onChangeText={(value) => setActivityForm((current) => ({ ...current, notes: value }))} multiline />
            <PrimaryButton
              label="Guardar actividad"
              onPress={() =>
                submit(
                  "/lot-activities",
                  {
                    ...activityForm,
                    lotId: Number(activityForm.lotId),
                    quantity: activityForm.quantity ? Number(activityForm.quantity) : null,
                    machineId: activityForm.machineId ? Number(activityForm.machineId) : null,
                  },
                  () => setActivityForm((current) => ({ ...current, performedOn: today(), inputName: "", dose: "", quantity: "", machineId: "", notes: "" })),
                )
              }
              loading={loading}
            />
          </Section>
        ) : null}

        {activeTab === "harvest" ? (
          <Section title="Registro de cosecha" subtitle="Maquinista, lote, maquina y tolvas">
            <Field label="Maquinista">
              <ChipSelector items={employees} selectedValue={harvestForm.employeeId} onChange={(value) => setHarvestForm((current) => ({ ...current, employeeId: value }))} />
            </Field>
            <Field label="Lote">
              <ChipSelector items={lots.map((lot) => ({ ...lot, name: `${lot.code} - ${lot.name}` }))} selectedValue={harvestForm.lotId} onChange={(value) => setHarvestForm((current) => ({ ...current, lotId: value }))} />
            </Field>
            <Field label="Maquinaria">
              <ChipSelector
                items={machinery.map((item) => ({ ...item, name: item.name }))}
                selectedValue={harvestForm.machineId}
                onChange={(value) => {
                  const machine = machinery.find((item) => String(item.id) === value);
                  setHarvestForm((current) => ({ ...current, machineId: value, machineName: machine?.name || "" }));
                }}
              />
            </Field>
            <Input label="Fecha" value={harvestForm.harvestDate} onChangeText={(value) => setHarvestForm((current) => ({ ...current, harvestDate: value }))} />
            <Input label="Tolvas cosechadas" value={harvestForm.hoppersHarvested} onChangeText={(value) => setHarvestForm((current) => ({ ...current, hoppersHarvested: value }))} keyboardType="numeric" />
            <Input label="Horas operadas" value={harvestForm.hoursOperated} onChangeText={(value) => setHarvestForm((current) => ({ ...current, hoursOperated: value }))} keyboardType="decimal-pad" />
            <Input label="Observaciones" value={harvestForm.notes} onChangeText={(value) => setHarvestForm((current) => ({ ...current, notes: value }))} multiline />
            <PrimaryButton
              label="Guardar cosecha"
              onPress={() =>
                submit(
                  "/harvest-logs",
                  {
                    ...harvestForm,
                    employeeId: Number(harvestForm.employeeId),
                    lotId: Number(harvestForm.lotId),
                    machineId: harvestForm.machineId ? Number(harvestForm.machineId) : null,
                    hoppersHarvested: Number(harvestForm.hoppersHarvested),
                    hoursOperated: Number(harvestForm.hoursOperated),
                  },
                  () => setHarvestForm((current) => ({ ...current, harvestDate: today(), hoppersHarvested: "0", hoursOperated: "8", notes: "" })),
                )
              }
              loading={loading}
            />
          </Section>
        ) : null}

        {activeTab === "fuel" ? (
          <Section title="Compra de combustible" subtitle="Control de ACPPM y consumo por maquina">
            <Input label="Fecha de compra" value={fuelForm.purchaseDate} onChangeText={(value) => setFuelForm((current) => ({ ...current, purchaseDate: value }))} />
            <Field label="Maquinaria">
              <ChipSelector items={machinery.map((item) => ({ ...item, name: item.name }))} selectedValue={fuelForm.machineId} onChange={(value) => setFuelForm((current) => ({ ...current, machineId: value }))} />
            </Field>
            <Input label="Tipo de combustible" value={fuelForm.fuelType} onChangeText={(value) => setFuelForm((current) => ({ ...current, fuelType: value }))} />
            <Input label="Litros" value={fuelForm.quantityLiters} onChangeText={(value) => setFuelForm((current) => ({ ...current, quantityLiters: value }))} keyboardType="decimal-pad" />
            <Input label="Precio por litro" value={fuelForm.pricePerLiter} onChangeText={(value) => setFuelForm((current) => ({ ...current, pricePerLiter: value }))} keyboardType="decimal-pad" />
            <Input label="Proveedor" value={fuelForm.supplier} onChangeText={(value) => setFuelForm((current) => ({ ...current, supplier: value }))} />
            <Input label="Factura" value={fuelForm.invoiceNumber} onChangeText={(value) => setFuelForm((current) => ({ ...current, invoiceNumber: value }))} />
            <Input label="Observaciones" value={fuelForm.notes} onChangeText={(value) => setFuelForm((current) => ({ ...current, notes: value }))} multiline />
            <PrimaryButton
              label="Guardar compra"
              onPress={() =>
                submit(
                  "/fuel-purchases",
                  {
                    ...fuelForm,
                    machineId: fuelForm.machineId ? Number(fuelForm.machineId) : null,
                    quantityLiters: Number(fuelForm.quantityLiters),
                    pricePerLiter: Number(fuelForm.pricePerLiter),
                  },
                  () => setFuelForm((current) => ({ ...current, purchaseDate: today(), quantityLiters: "", pricePerLiter: "", supplier: "", invoiceNumber: "", notes: "" })),
                )
              }
              loading={loading}
            />
          </Section>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#0f3020",
  },
  loginScreen: {
    minHeight: "100%",
    justifyContent: "center",
    padding: 18,
    backgroundColor: "#0f3020",
  },
  loginCard: {
    backgroundColor: "#f6f2e7",
    borderRadius: 28,
    padding: 22,
    gap: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  logo: {
    width: 120,
    height: 120,
    alignSelf: "center",
    borderRadius: 24,
  },
  appTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#124326",
    textAlign: "center",
  },
  appSubtitle: {
    textAlign: "center",
    color: "#5f7163",
    marginTop: -6,
    marginBottom: 4,
  },
  lockScreen: {
    flex: 1,
    justifyContent: "center",
    padding: 22,
    backgroundColor: "#0f3020",
    gap: 14,
  },
  lockLogo: {
    width: 140,
    height: 140,
    alignSelf: "center",
    borderRadius: 28,
  },
  lockTitle: {
    fontSize: 26,
    color: "#ffffff",
    fontWeight: "800",
    textAlign: "center",
  },
  lockSubtitle: {
    color: "rgba(255,255,255,0.72)",
    textAlign: "center",
    marginBottom: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 10,
    backgroundColor: "#124326",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#ffffff",
  },
  headerSubtitle: {
    color: "rgba(255,255,255,0.76)",
    marginTop: 2,
  },
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: 10,
    paddingBottom: 10,
    backgroundColor: "#124326",
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: "#f4ac2b",
  },
  tabLabel: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 12,
  },
  tabLabelActive: {
    color: "#17311f",
  },
  screen: {
    padding: 16,
    gap: 14,
    backgroundColor: "#f4f1e6",
  },
  tabContent: {
    gap: 14,
  },
  section: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(31,107,58,0.12)",
    gap: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#124326",
  },
  sectionSubtitle: {
    color: "#607062",
  },
  sectionBody: {
    gap: 12,
    marginTop: 4,
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    fontWeight: "700",
    color: "#124326",
  },
  input: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(31,107,58,0.12)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#17311f",
  },
  serverActions: {
    flexDirection: "row",
    gap: 10,
  },
  serverAction: {
    flex: 1,
  },
  serverHint: {
    marginTop: -2,
    color: "#607062",
    fontSize: 12,
    lineHeight: 18,
  },
  primaryButton: {
    backgroundColor: "#1f6b3a",
    paddingVertical: 14,
    borderRadius: 18,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontWeight: "800",
  },
  ghostButton: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(31,107,58,0.14)",
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#fff8ea",
  },
  ghostButtonText: {
    color: "#124326",
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(31,107,58,0.14)",
    backgroundColor: "#f7faf7",
  },
  chipActive: {
    backgroundColor: "#1f6b3a",
    borderColor: "#1f6b3a",
  },
  chipText: {
    color: "#33523c",
    fontWeight: "600",
    fontSize: 12,
  },
  chipTextActive: {
    color: "#ffffff",
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metricCard: {
    minWidth: 105,
    flexGrow: 1,
    backgroundColor: "#fff8ea",
    borderWidth: 1,
    borderColor: "rgba(244,172,43,0.22)",
    borderRadius: 18,
    padding: 12,
    gap: 4,
  },
  metricLabel: {
    color: "#6c7c6d",
    fontSize: 12,
  },
  metricValue: {
    color: "#124326",
    fontSize: 22,
    fontWeight: "800",
  },
  metricHelper: {
    color: "#8d998d",
    fontSize: 11,
  },
  messageBox: {
    borderRadius: 16,
    padding: 12,
    gap: 4,
  },
  messageError: {
    backgroundColor: "rgba(203,47,47,0.12)",
    borderWidth: 1,
    borderColor: "rgba(203,47,47,0.18)",
  },
  messageSuccess: {
    backgroundColor: "rgba(31,107,58,0.12)",
    borderWidth: 1,
    borderColor: "rgba(31,107,58,0.18)",
  },
  messageErrorText: {
    color: "#8a2020",
    fontWeight: "700",
  },
  messageSuccessText: {
    color: "#124326",
    fontWeight: "700",
  },
  messageHint: {
    fontSize: 11,
    color: "#6d7d6f",
  },
  biometricPanel: {
    borderRadius: 18,
    padding: 14,
    gap: 8,
    borderWidth: 1,
  },
  biometricPanelActive: {
    backgroundColor: "#eef7f0",
    borderColor: "rgba(31,107,58,0.18)",
  },
  biometricPanelMuted: {
    backgroundColor: "#f3f4f6",
    borderColor: "rgba(107,114,128,0.18)",
  },
  biometricPanelTitle: {
    color: "#124326",
    fontWeight: "800",
    fontSize: 14,
  },
  biometricPanelText: {
    color: "#5e6d60",
    lineHeight: 20,
  },
  listRow: {
    borderRadius: 16,
    backgroundColor: "#f9fbf8",
    borderWidth: 1,
    borderColor: "rgba(31,107,58,0.08)",
    padding: 12,
    gap: 3,
  },
  listMeta: {
    fontSize: 11,
    color: "#7b8b7d",
    textTransform: "uppercase",
  },
  listTitle: {
    color: "#17311f",
    fontWeight: "700",
  },
  listSubtitle: {
    color: "#607062",
  },
  securityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  securityTitle: {
    color: "#17311f",
    fontWeight: "700",
  },
  securitySubtitle: {
    color: "#607062",
    marginTop: 2,
  },
});
