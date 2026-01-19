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
3. En producción, verificar que el contenedor tenga acceso a Chrome

### Base de datos no conecta
1. Verificar DATABASE_URL en variables de entorno
2. Ejecutar `npx prisma generate` después de cambios en schema
3. Verificar que la BD esté accesible desde el servidor

### Migraciones fallan
1. Verificar permisos en la BD
2. Ejecutar `npx prisma migrate deploy` manualmente
3. Revisar logs de Prisma