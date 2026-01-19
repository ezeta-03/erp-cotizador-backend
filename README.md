# Backend - Sistema de Cotización ZAAZMAGO

## 🚨 PROBLEMA CRÍTICO: Proyecto Supabase No Encontrado

**❌ Error Detectado:** El proyecto Supabase configurado no existe o no está activo.

### 🔍 Verificación del Problema
Ejecuta este comando para verificar el estado de tu proyecto Supabase:
```bash
node verify-supabase-project.js
```

Si obtienes "ENOTFOUND", significa que el proyecto no existe.

### 🛠️ Solución: Recrear Proyecto Supabase

#### Paso 1: Verificar Proyectos Existentes
1. Ve a [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Revisa si tienes proyectos activos
3. Si el proyecto fue eliminado, necesitarás crear uno nuevo

#### Paso 2: Crear Nuevo Proyecto
1. En Supabase Dashboard, haz clic en "New Project"
2. Elige un nombre descriptivo (ej: "cotizador-zaazmago-prod")
3. Selecciona la región más cercana (recomendado: AWS US East 1)
4. Crea una contraseña segura para la base de datos
5. Espera a que se complete la configuración inicial (puede tomar varios minutos)

#### Paso 3: Obtener Nueva DATABASE_URL
1. En el nuevo proyecto → **Settings** → **Database**
2. Copia la **Connection pooling** → **Connection string**
3. Asegúrate de que termine con `?sslmode=require`

#### Paso 4: Actualizar Variables de Entorno
Actualiza tu archivo `.env` con la nueva URL:
```env
DATABASE_URL=postgresql://postgres.[nuevo-project-ref]:[nueva-password]@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require
```

#### Paso 5: Verificar Conexión
```bash
node verify-supabase-project.js
```

Deberías ver "✅ El proyecto Supabase parece estar activo"

#### Paso 6: Inicializar Base de Datos
```bash
npm run setup-production
```

## 📋 Configuración Original (para proyectos existentes)

### 1. Crear proyecto en Supabase
1. Ve a [supabase.com](https://supabase.com) y crea una cuenta
2. Crea un nuevo proyecto
3. Espera a que se complete la configuración inicial

### 2. Obtener la DATABASE_URL
1. En el dashboard de Supabase, ve a **Settings** → **Database**
2. Copia la **Connection string** (debe incluir `?sslmode=require`)
3. La URL debería verse así:
   ```
   postgresql://postgres.[project-ref]:[password]@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require
   ```

### 3. Configurar Variables de Entorno
En Render, configura estas variables:

```env
DATABASE_URL=postgresql://postgres.[tu-project-ref]:[tu-password]@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require
```

### 4. Inicializar Base de Datos
Después del primer deploy, ejecuta en Render:

```bash
npm run setup-production
```

Este comando ejecutará automáticamente:
- Generación del cliente Prisma
- Migraciones de base de datos
- Seeds iniciales (usuario admin, configuración, etc.)

## �🚀 Despliegue

### Variables de Entorno Requeridas

Configurar en Render (o tu servicio de hosting):

```env
PORT=4000
DATABASE_URL=postgresql://usuario:password@host:puerto/database
JWT_SECRET=tu_jwt_secret_muy_seguro
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=tu_email@gmail.com
MAIL_PASS=tu_app_password
MAIL_FROM="Sistema de Cotización ZAAZMAGO"
FRONTEND_URL=https://tu-frontend.vercel.app
NODE_ENV=production

# Configuración específica para Puppeteer en Render
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
```

### Comandos para Producción

```bash
# Opción 1: Setup automático (recomendado)
npm run setup-production

# Opción 2: Setup manual
npm install
npx prisma generate
npx prisma migrate deploy
npm run seed:completo
```

### Verificar Configuración

```bash
# Diagnosticar conexión a BD
npm run diagnostico-db

# Diagnosticar PDFs
npm run diagnostico-pdf
```

# Ejecutar seeds (solo una vez, si es necesario)
npm run seed:completo

# Iniciar servidor
npm start
```

### Comandos para Desarrollo

```bash
# Instalar dependencias
npm install

# Ejecutar en modo desarrollo
npm run dev
```

## 📊 Datos de Desarrollo vs Producción

- **Desarrollo**: Usa datos ficticios para testing
- **Producción**: Usa datos reales de la base de datos

La aplicación detecta automáticamente el entorno mediante `NODE_ENV`:
- `NODE_ENV=development` → Datos ficticios
- `NODE_ENV=production` → Datos reales

## 🔧 Funcionalidades por Entorno

| Función | Desarrollo | Producción |
|---------|------------|------------|
| Listar Cotizaciones | Datos ficticios | BD real |
| Generar PDF | Datos ficticios | BD real |
| Crear Cotización | BD real | BD real |
| Autenticación | BD real | BD real |

## 🐛 Troubleshooting

### PDF no se genera
1. Verificar que Puppeteer esté instalado: `npm list puppeteer`
2. Revisar logs del servidor para errores de Puppeteer
3. En producción (Render), verificar que el servicio tenga suficiente memoria (al menos 1GB)
4. Si falla, el error será específico: "Puppeteer launch failed"

### Problemas comunes en Render
- **Memoria insuficiente**: Aumentar el plan de Render a al menos 1GB RAM
- **Timeout**: Los PDFs pueden tardar hasta 2 minutos en generarse
- **Chrome no disponible**: Render puede no tener Chrome instalado en algunos planes

### Problemas de Base de Datos (Supabase)
- **"Tenant or user not found"**: Verificar que el proyecto Supabase existe y está activo
- **"Connection refused"**: Revisar la DATABASE_URL y credenciales
- **"Table does not exist"**: Ejecutar `npm run setup-production` para inicializar BD

### Solución para problemas de BD:
```bash
# 1. Verificar conexión
npm run diagnostico-db

# 2. Si falla, verificar DATABASE_URL en Supabase dashboard

# 3. Re-inicializar base de datos
npm run setup-production
```

### Problemas específicos con Puppeteer
- **"Puppeteer launch failed"**: Verificar que Render tenga suficiente memoria (1GB+)
- **"Browser closed unexpectedly"**: Problema de memoria o configuración de sandbox
- **Timeout en generación**: Los PDFs complejos pueden tardar más de 30 segundos

### Variables de entorno para Puppeteer
```env
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
```

### Solución alternativa
Si Puppeteer sigue fallando, considerar:
1. Usar un servicio externo de PDF (como Puppeteer Cloud o similar)
2. Generar PDFs en el frontend usando bibliotecas como jsPDF
3. Usar un servicio de hosting que soporte Puppeteer (como Railway o DigitalOcean)

### Base de datos no conecta
1. Verificar DATABASE_URL en variables de entorno
2. Ejecutar `npx prisma generate` después de cambios en schema
3. Verificar que la BD esté accesible desde el servidor

### Migraciones fallan
1. Verificar permisos en la BD
2. Ejecutar `npx prisma migrate deploy` manualmente
3. Revisar logs de Prisma