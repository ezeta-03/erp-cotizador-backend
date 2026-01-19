# Backend - Sistema de Cotización ZAAZMAGO

## 🚀 Despliegue

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
# Instalar dependencias
npm install

# Generar cliente Prisma
npx prisma generate

# Ejecutar migraciones (solo una vez)
npx prisma migrate deploy

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