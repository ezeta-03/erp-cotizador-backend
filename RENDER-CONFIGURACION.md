# 🚨 INSTRUCCIONES CRÍTICAS: Configurar Variables en Render

## ❌ ERROR ACTUAL
```
PrismaClientInitializationError: Invalid prisma.usuario.findUnique() invocation:
error: Error validating datasource `db`: the URL must start with the protocol `postgresql://` or `postgres://`.
```

**Causa:** La variable `DATABASE_URL` no está configurada en Render.

## 🛠️ SOLUCIÓN: Configurar Variables de Entorno

### PASO 1: Ir a Render Dashboard
1. Ve a https://render.com
2. Selecciona tu proyecto: **erp-cotizador-backend**
3. Ve a **Settings** (en el menú lateral izquierdo)
4. Haz clic en **Environment**

### PASO 2: Agregar Variables (una por una)

**IMPORTANTE:** Copia cada variable exactamente como está aquí:

| Variable | Valor |
|----------|-------|
| `DATABASE_URL` | `postgresql://postgres.qlqbhyfzdzlfwsqysveb:Dulc34lm3ndr4m1$@aws-0-us-west-2.pooler.supabase.com:5432/postgres` |
| `JWT_SECRET` | `cotizaciones_mvp_zaazmago_2025_super_secreto` |
| `NODE_ENV` | `production` |
| `PORT` | `4000` |
| `FRONTEND_URL` | `https://erp-cotizador-frontend.vercel.app` |
| `MAIL_HOST` | `smtp.gmail.com` |
| `MAIL_PORT` | `587` |
| `MAIL_USER` | `academiazenteno@gmail.com` |
| `MAIL_PASS` | `ododvsolyktfffra` |
| `MAIL_FROM` | `Sistema de Cotización ZAAZMAGO` |

### PASO 3: Cómo Agregar Cada Variable
1. Haz clic en **Add Environment Variable**
2. **Key:** `DATABASE_URL`
3. **Value:** `postgresql://postgres.qlqbhyfzdzlfwsqysveb:Dulc34lm3ndr4m1$@aws-0-us-west-2.pooler.supabase.com:5432/postgres`
4. Haz clic en **Save**
5. Repite para cada variable

### PASO 4: Forzar Redeploy
Después de agregar todas las variables:
1. Ve a la pestaña **Logs** para confirmar que se guardaron
2. Ve a **Manual Deploy** → **Clear build cache and deploy**

### PASO 5: Verificar que Funcione

Después del redeploy, prueba:

```bash
# Health check
curl https://erp-cotizador-backend.onrender.com/api/health

# Debería responder:
# {
#   "status": "✅ Backend funcionando",
#   "database": "✅ Conectada",
#   "users_count": 6,
#   "environment": {
#     "DATABASE_URL": "✅ Configurada",
#     "JWT_SECRET": "✅ Configurada"
#   }
# }
```

## ⚠️ NOTAS IMPORTANTES

- **DATABASE_URL** debe ser exactamente igual (no agregar comillas)
- Si hay algún error tipográfico, el backend no funcionará
- Después del redeploy, puede tardar 2-3 minutos en estar listo
- Si aún falla, revisa los logs de Render para ver el error específico

## 🔍 Verificación Final

Una vez configurado:
- ✅ Backend responde correctamente
- ✅ Base de datos conectada
- ✅ Login funciona en Postman
- ✅ Frontend funciona sin errores CORS
- ✅ Todos los datos se cargan correctamente

¿Ya configuraste todas las variables en Render? Una vez que lo hagas, todo debería funcionar perfectamente.