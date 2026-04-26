# AGRO PIPES — Guía de Despliegue

## Despliegue en Render (Producción)

### 1. Subir el proyecto a GitHub

```bash
git init
git add .
git commit -m "feat: AGRO PIPES v2 - sistema completo de gestión arrocera"
git remote add origin https://github.com/TU_USUARIO/agro-pipes-suite.git
git push -u origin main
```

### 2. Desplegar en Render con render.yaml

1. Ir a [render.com](https://render.com) → New → Blueprint
2. Conectar tu repositorio de GitHub
3. Render leerá `render.yaml` y creará automáticamente:
   - **Base de datos PostgreSQL** (`agro-pipes-db`)
   - **Backend API** (`agro-pipes-api`) → Python/Flask/Gunicorn
   - **Frontend Web** (`agro-pipes-web`) → React/Vite (sitio estático)

### 3. URLs resultantes

- **API**: `https://agro-pipes-api.onrender.com`
- **Web**: `https://agro-pipes-web.onrender.com`

---

## Despliegue local (Desarrollo)

### Backend

```bash
cd backend
pip install -r requirements.txt
python run.py
# API disponible en http://localhost:5000
```

### Frontend Web

```bash
cd web
npm install
npm run dev
# Web disponible en http://localhost:5173
```

### App Móvil

```bash
cd mobile
npm install
npx expo start
# Escanea el QR con la app Expo Go en tu teléfono
```

---

## Generar APK para Android

### Requisitos
- Cuenta en [expo.dev](https://expo.dev)
- EAS CLI instalado: `npm install -g eas-cli`

### Pasos

```bash
cd mobile

# 1. Instalar dependencias
npm install

# 2. Iniciar sesión en Expo
eas login

# 3. Configurar el proyecto (primera vez)
eas build:configure

# 4. Actualizar la URL del API en eas.json
# Cambiar "https://agro-pipes-api.onrender.com/api" por tu URL real

# 5. Generar APK (modo preview = APK instalable directamente)
eas build --platform android --profile preview

# 6. Descargar el APK desde el link que muestra EAS
```

El APK se puede instalar directamente en cualquier teléfono Android.
Para publicar en Google Play Store, usar el perfil `production` que genera `.aab`.

### Autenticación biométrica en la APK
- La app detecta automáticamente si el dispositivo tiene huella digital/reconocimiento facial
- El botón "Entrar con huella digital" aparece solo si hay biometría disponible
- Requiere haber iniciado sesión al menos una vez con usuario y contraseña

---

## Usuarios del sistema

| Rol           | Correo                      | Contraseña      | Acceso |
|---------------|------------------------------|-----------------|--------|
| Administrador | admin@agropipes.com         | AgroPipes2026!  | Total  |
| Supervisor    | supervisor@agropipes.com    | AgroPipes2026!  | Nómina + gestión de lotes |
| Maquinista    | maquinista@agropipes.com    | AgroPipes2026!  | Cosecha |
| Operario      | operario@agropipes.com      | AgroPipes2026!  | Jornales y actividades |

---

## Módulos disponibles

| Módulo | Descripción |
|--------|-------------|
| **Registro Diario** | Jornales por empleado, lote, función y horas |
| **Actividades de Lote** | Abonos (tipo + bultos), fumigaciones (dosis + litros), riego, siembra |
| **Cosecha** | Tolvas por maquinista, cosechadora y lote |
| **Combustible / ACPPM** | Compras con precio, litros, proveedor, factura y maquinaria |
| **Maquinaria** | Cosechadoras, tractores, fumigadoras con horómetro |
| **Nómina Quincena** | Horas acumuladas por empleado en períodos configurables |
| **Empleados** | Alta, baja y gestión de personal (Admin) |
| **Lotes** | Gestión de lotes arroceros con variedad, fechas y estado |
