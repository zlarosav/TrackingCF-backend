# TrackingCF Backend

API REST para trackear y visualizar la actividad de usuarios en Codeforces. Diseñado para grupos de amigos, comunidades o instituciones que deseen monitorear el progreso de sus miembros en la plataforma.

## 🎯 Características

- **Tracking automático** de submissions de Codeforces cada 30 minutos
- **Sistema de rachas** (streaks) con cálculo inteligente y reset automático
- **Sistema de puntuación** basado en dificultad de problemas resueltos
- **API REST** para consultar usuarios, submissions y estadísticas
- **Base de datos MySQL** para almacenamiento persistente
- **2 Cron jobs inteligentes:**
  - Tracking cada 30 min (con descanso 3-8 AM)
  - Reset de rachas diario a las 00:00
- **Timezone configurable** mediante variable de entorno

## 📋 Requisitos Previos

- **Node.js** 16+ y npm
- **MySQL** 8.0+
- **Credenciales de API de Codeforces** ([obtenerlas aquí](https://codeforces.com/settings/api))

## 🚀 Instalación

### 1. Clonar el repositorio

```bash
git clone https://github.com/zlarosav/TrackingCF-backend.git
cd TrackingCF-backend
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar variables de entorno

Copia el archivo `.env.example` y renómbralo a `.env`:

```bash
cp .env.example .env
```

Edita el archivo `.env` con tus configuraciones.:

```env
PORT=3001
NODE_ENV=development

# MySQL Database
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=tu_contraseña
DB_NAME=tracking_cf

# Codeforces API Credentials (REQUERIDAS)
API_KEY_CF=tu_api_key
API_SECRET_CF=tu_api_secret

# Timezone (usado para rachas y logs)
TZ=America/Lima

# CORS - Frontend URL (opcional)
FRONTEND_URL=https://tu-dominio-custom.com
```

> **⚠️ Importante:** Las credenciales de Codeforces API son **obligatorias**. Obtén las tuyas en: https://codeforces.com/settings/api

### 4. Inicializar la base de datos

```bash
npm run db:init
```

Este comando creará la base de datos `tracking_cf` y todas las tablas necesarias (`users`, `submissions`, `user_stats`).

## 📝 Comandos Disponibles

### Desarrollo

```bash
npm run dev          # Iniciar servidor en modo desarrollo con hot-reload
npm start            # Iniciar servidor en modo producción
```

### Gestión de usuarios

```bash
npm run user:create  # Crear un nuevo usuario (interactivo)
npm run user:delete  # Eliminar un usuario (interactivo)
npm run user:rename  # Renombrar handle de usuario (con validación CF)
npm run user:toggle  # Habilitar/inhabilitar usuario
```

> **Nota:** Al crear un usuario, automáticamente:
> - Se valida que el handle existe en Codeforces
> - Se obtienen todas sus submissions desde el 1 de enero del año actual
> - Se calcula su racha desde el historial completo
> - Se inicializan sus estadísticas

### Tracking manual

```bash
npm run tracker:run    # Ejecutar tracking manual de todos los usuarios
npm run tracker:force  # Forzar tracking completo (ignora caché)
```

### Base de datos

```bash
npm run db:init    # Inicializar/reinicializar la base de datos
npm run db:delete  # Eliminar la base de datos (requiere confirmación)
```

## 🔄 Sistema de Tracking Automático

El backend ejecuta **2 cron jobs** independientes:

### 1. Tracking de Submissions (cada 30 min)

- Se ejecuta **cada 30 minutos** (en minutos :00 y :30)
- **Descansa entre 3-8 AM** (según timezone del `.env`) para reducir carga
- Actualiza automáticamente submissions y estadísticas de todos los usuarios
- Detecta problemas de la API de Codeforces y los reporta

### 2. Reset de Rachas + Actualización de Avatares (diario a las 00:00)

- Se ejecuta **todos los días a medianoche** (según timezone del `.env`)
- **Resetea rachas:** Revisa usuarios con rachas activas y resetea a 0 si no enviaron submissions ayer
- **Actualiza avatares:** Verifica y actualiza avatares de todos los usuarios habilitados desde Codeforces
- Ejemplo: Si Juan tiene racha de 5 días y ayer no envió nada → racha = 0

## 🔥 Sistema de Rachas (Streaks)

**Cálculo Inteligente:**
- Al crear un usuario, se calcula su racha desde **todo el historial**
- Cuenta días **consecutivos** hacia atrás desde la última submission
- Respeta la **timezone configurada** en `.env`

**Estados de Racha:**
- ✅ **Activa (naranja):** Última submission fue hoy
- ⚪ **Inactiva (gris):** Última submission fue ayer
- ❌ **Sin racha:** Última submission hace >1 día

**Reset Automático:**
- Si hoy son las 00:00 y ayer no hubo submissions → racha = 0
- Se ejecuta automáticamente por el cron job nocturno

## 🌐 Endpoints API

### Health Check
```http
GET /api/health
```

### Usuarios
```http
GET /api/users              # Listar todos con estadísticas + streak
GET /api/users/:handle      # Obtener usuario específico + streak
```

**Response incluye:**
```json
{
  "current_streak": 5,
  "last_streak_date": "2026-01-21",
  "streak_active": false
}
```

### Submissions
```http
GET /api/submissions                    # Listar últimas submissions
GET /api/submissions/:handle            # Submissions de un usuario  
GET /api/submissions/:handle/stats      # Estadísticas detalladas
GET /api/submissions/latest             # Últimas submissions globales
```

### Estadísticas
```http
GET /api/submissions/:handle/stats      # Stats por periodo
```

**Parámetros query:**
- `period`: `week`, `month`, `year`, `all` (default: `all`)

## 🛠️ Stack Tecnológico

- **Framework:** Express.js
- **Base de datos:** MySQL 8.0+
- **ORM/Query:** mysql2 (raw queries)
- **Cron Jobs:** node-cron
- **HTTP Client:** axios
- **Timezone:** Luxon (respeta `.env TZ`)
- **Error Handling:** Try-catch con rollback automático

## 🗂️ Estructura del Proyecto

```
src/
├── config/         # Configuración DB
├── models/         # Modelos (User, Submission, Stats)
├── routes/         # Endpoints de la API
├── services/       # Lógica de negocio (tracker, stats, streakReset)
├── jobs/           # Cron jobs (tracking + daily tasks)
├── scripts/        # Scripts CLI (createUser, deleteUser, renameUser, toggleUser, initDb, deleteDb)
└── server.js       # Punto de entrada
```

## 👥 Sistema de Gestión de Usuarios

### Campo `enabled` en Base de Datos

Todos los usuarios tienen un campo `enabled` (BOOLEAN):
- **TRUE:** Usuario visible y accesible
- **FALSE:** Usuario oculto (no aparece en listas, perfil retorna 404)

### Auto-detección de Handles Inválidos

El tracker detecta automáticamente handles que ya no existen:
- API retorna 404 → Usuario se inhabilita automáticamente
- API caída (timeout, 500) → No se inhabilita (error temporal)

### Comandos Disponibles

- `user:rename` - Cambiar handle (mantiene submissions)
- `user:toggle` - Habilitar/inhabilitar usuario
- `user:delete` - Eliminar usuario completamente

## 📦 Despliegue

Este backend está diseñado para desplegarse en:

- **Railway** / **Render** / **Fly.io** (Node.js)
- **VPS** (Ubuntu/Debian con PM2)
- **Contabo** / **DigitalOcean**

**Importante:** 
- Configura las variables de entorno en tu plataforma
- Asegúrate de que el `TZ` esté configurado correctamente
- Los cron jobs se ejecutan automáticamente al iniciar el servidor

## 🔒 Seguridad y Buenas Prácticas

- ✅ Variables de entorno para credenciales
- ✅ CORS configurado con whitelist
- ✅ Validación de handles de Codeforces
- ✅ Error handling con try-catch
- ✅ Logs con timestamps en timezone configurado
- ✅ Timezone consistente en toda la app (usando Luxon)

## 🤝 Contribuciones

Este es un proyecto open source. Siéntete libre de hacer fork, reportar issues o enviar pull requests.

## 📄 Licencia

MIT
