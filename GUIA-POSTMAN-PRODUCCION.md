# 🚀 Guía: Probar API en Producción con Postman

## 📋 Pasos para Configurar Postman en Producción

### **Paso 1: Obtener la URL de Producción**
Después de desplegar el backend en Render, obtendrás una URL como:
```
https://tu-backend-render.onrender.com
```

### **Paso 2: Importar Colección de Producción**
1. Abre Postman
2. Clic en **"Import"**
3. Importa: `backend/postman-collection-PRODUCCION.json`

### **Paso 3: Configurar Environment de Producción**
1. Ve a **"Environments"** (panel izquierdo)
2. Crea un nuevo environment: **"Cotizador Producción"**
3. Agrega estas variables:

| Variable | Valor | Descripción |
|----------|-------|-------------|
| `base_url` | `https://tu-backend-render.onrender.com` | URL de tu backend en Render |
| `token` | (vacío) | Token JWT (se llena después del login) |

### **Paso 4: Actualizar Variables de Entorno**
1. Selecciona el environment **"Cotizador Producción"**
2. Actualiza `base_url` con tu URL real de Render
3. Asegúrate de que termine sin `/` al final

### **Paso 5: Probar Conexión**
1. Selecciona la petición **"1. Login - Obtener Token"**
2. Asegúrate de que el environment esté seleccionado
3. Clic en **"Send"**
4. Si funciona, verás el token en la respuesta

## 🔧 Configuración Alternativa (Modificar Colección Local)

Si prefieres usar la colección local existente:

1. Abre la colección **"Cotizador MVP API"**
2. Ve a **"Variables"** de la colección
3. Cambia la variable `{{base_url}}` de:
   - `http://localhost:4000` → `https://tu-backend-render.onrender.com`

## 📱 Endpoints de Producción

Una vez configurado, todos los endpoints funcionarán igual que en local:

```
POST {{base_url}}/api/auth/login
GET  {{base_url}}/api/auth/me
GET  {{base_url}}/api/cotizaciones
GET  {{base_url}}/api/productos
GET  {{base_url}}/api/dashboard
```

## ⚠️ Consideraciones para Producción

### **CORS**
- El backend ya está configurado con `CORS` abierto para debugging
- En producción real, configura origins específicos

### **HTTPS**
- Render proporciona HTTPS automáticamente
- Todas las peticiones usarán `https://`

### **Rate Limiting**
- Render tiene límites de rate limiting
- Evita hacer muchas peticiones seguidas

### **Logs**
- Puedes ver los logs en el dashboard de Render
- Útil para debugging de producción

## 🧪 Pruebas Recomendadas

1. **Login** con credenciales de prueba
2. **Ver perfil** (`GET /api/auth/me`)
3. **Dashboard** (`GET /api/dashboard`)
4. **Listar cotizaciones** (`GET /api/cotizaciones`)

## 🔍 Troubleshooting

### **Error 404**
- Verifica que la URL de Render sea correcta
- Asegúrate de que el backend esté desplegado

### **Error 500**
- Revisa los logs en Render dashboard
- Verifica las variables de entorno en Render

### **Error de CORS**
- El backend permite cualquier origin por ahora
- Si hay problemas, verifica la configuración de CORS

### **Token Expirado**
- Los tokens JWT expiran, haz login nuevamente
- Verifica que el token se esté enviando correctamente

## 📞 URLs de Ejemplo

```
# Local
http://localhost:4000/api/auth/login

# Producción (ejemplo)
https://cotizador-backend.onrender.com/api/auth/login
```

¿Ya tienes la URL de Render? Puedo ayudarte a configurar Postman con la URL específica.