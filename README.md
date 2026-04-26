# AGRO PIPES Suite

MVP full-stack para una empresa agricola con:

- Backend en Flask para autenticacion, lotes, jornales, historial agronomico y cosecha.
- Panel web en React para administracion operativa.
- App movil en React Native (Expo) para captura en campo.

## Modulos funcionales

- Registro diario por empleado: funcion, lote, fecha y horas trabajadas.
- Historial por lote: abonos, fumigaciones, monitoreo, riego y observaciones.
- Registro de cosecha: maquinista, maquina, lote, tolvas y horas operadas.
- Consolidado quincenal: suma automatica de horas por empleado.
- Dashboard: horas acumuladas, tolvas, lotes activos y personal activo.

## Estructura

```text
agro-pipes-suite/
|-- backend/
|   |-- app/
|   |-- requirements.txt
|   `-- run.py
|-- web/
|   |-- public/agro-pipes-logo.jpeg
|   `-- src/
|-- mobile/
|   |-- assets/agro-pipes-logo.jpeg
|   `-- App.js
`-- README.md
```

## Backend Flask

### Apertura rapida sin consola

Puedes abrir la app completa con doble clic, sin dejar ventanas negras abiertas:

- `C:\Users\deiby\Downloads\ABRIR AGRO PIPES.vbs`
- `C:\Users\deiby\Downloads\CERRAR AGRO PIPES.vbs`

El acceso de abrir inicia el backend en segundo plano y te abre automaticamente:

- `http://127.0.0.1:5000/`

1. Crear entorno virtual:

   ```powershell
   cd C:\Users\deiby\Downloads\agro-pipes-suite\backend
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```

2. Configurar variables:

   ```powershell
   Copy-Item .env.example .env
   ```

3. Iniciar la API:

   ```powershell
   flask --app run.py run --debug
   ```

   O, si quieres usar el Python portable detectado en este equipo:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\start-backend.ps1
   ```

La base SQLite se crea automaticamente en `backend/instance/agro_pipes.db` con datos demo.

## Front-end web

1. Instalar dependencias:

   ```powershell
   cd C:\Users\deiby\Downloads\agro-pipes-suite\web
   npm install
   ```

2. Configurar URL de la API:

   ```powershell
   Copy-Item .env.example .env
   ```

3. Ejecutar:

   ```powershell
   npm run dev
   ```

Acceso demo:

- Correo: `admin@agropipes.com`
- Contrasena: `AgroPipes2026!`

## App movil React Native

1. Instalar dependencias:

   ```powershell
   cd C:\Users\deiby\Downloads\agro-pipes-suite\mobile
   npm install
   ```

2. Levantar Expo:

   ```powershell
   npm run start
   ```

3. En Android emulador usa `http://10.0.2.2:5000/api`.
4. En dispositivo fisico reemplaza la URL por la IP LAN del computador.

La app movil permite cambiar la URL de la API desde la misma pantalla de acceso.

## Seguridad y robustez incluidas

- Contrasenas con hash seguro.
- Token firmado para sesion.
- Validaciones de negocio en la API.
- Roles base: `admin`, `supervisor`, `machinist`, `operator`.
- Restriccion del consolidado quincenal a administracion y supervision.
- Restriccion del registro de cosecha a perfiles autorizados.

## Endpoints principales

- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/dashboard/summary`
- `GET/POST /api/work-logs`
- `GET/POST /api/lot-activities`
- `GET/POST /api/harvest-logs`
- `GET /api/payroll/fortnight`
- `GET /api/employees`
- `GET /api/lots`

## Datos demo cargados automaticamente

- 4 empleados con roles distintos.
- 3 lotes.
- Jornales iniciales.
- Actividades agronomicas.
- Registros de cosecha.

## Siguientes mejoras recomendadas

- Migrar a PostgreSQL para produccion.
- Reemplazar el token simple por JWT con refresco.
- Agregar auditoria, exportacion a Excel/PDF y reportes por rango.
- Integrar catalogos maestros administrables desde el panel.
- Publicar el backend detras de HTTPS con proxy reverso.
