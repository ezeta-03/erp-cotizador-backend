# 🚀 Credenciales de Prueba - Cotizador MVP

## 👤 Usuarios Disponibles

### 🔐 Administradores
- **Email:** `admin@demo.com`
- **Password:** `123456`
- **Rol:** ADMIN
- **Descripción:** Acceso completo al sistema

- **Email:** `admin2@demo.com`
- **Password:** `123456`
- **Rol:** ADMIN
- **Descripción:** Administrador secundario

### 💼 Vendedores
- **Email:** `juan@ventas.com`
- **Password:** `123456`
- **Rol:** VENTAS
- **Descripción:** Vendedor principal

- **Email:** `ana@ventas.com`
- **Password:** `123456`
- **Rol:** VENTAS
- **Descripción:** Vendedora

### 👥 Clientes
- **Email:** `carlos@cliente.com`
- **Password:** `123456`
- **Rol:** CLIENTE
- **Descripción:** Cliente con usuario

- **Email:** `maria@cliente.com`
- **Password:** `123456`
- **Rol:** CLIENTE
- **Descripción:** Cliente con usuario

## 🔑 Cómo Usar en Postman

1. **Login:** Usa cualquiera de las credenciales arriba
2. **Copia el token** de la respuesta
3. **Configura la variable `{{token}}`** en Postman
4. **Prueba los endpoints** que requieran autenticación

## 📋 Endpoints Principales

### Autenticación
- `POST /api/auth/login` - Iniciar sesión
- `GET /api/auth/me` - Ver perfil (requiere token)

### Cotizaciones
- `GET /api/cotizaciones` - Listar cotizaciones
- `POST /api/cotizaciones` - Crear cotización (ADMIN/VENTAS)
- `GET /api/cotizaciones/:id` - Ver cotización específica

### Productos
- `GET /api/productos` - Listar productos

### Clientes
- `GET /api/clientes` - Listar clientes (ADMIN/VENTAS)

### Dashboard
- `GET /api/dashboard` - Estadísticas del dashboard
- `GET /api/stats` - Estadísticas generales

## ⚠️ Notas Importantes

- **Todos los usuarios** tienen la misma contraseña: `123456`
- **Los endpoints protegidos** requieren el header `Authorization: Bearer {{token}}`
- **Los clientes** solo pueden ver sus propias cotizaciones
- **Los vendedores** solo pueden ver sus propias cotizaciones (excepto admins)

## 🧪 Prueba Rápida

1. Login con `admin@demo.com` / `123456`
2. Copia el token del response
3. Prueba `GET /api/dashboard` para ver estadísticas
4. Prueba `GET /api/cotizaciones` para ver todas las cotizaciones

### 🟣 Netwise (solo base local)
- **Email:** `netwise@demo.com`
- **Password:** `123456`
- **Rol:** CONTABLE · **Marca:** NETWISE
- **Descripción:** Mismo acceso que Contabilidad, con la interfaz de Netwise (morado, Poppins). Se crea con `node scripts/crear-usuario-netwise.js <email> <contraseña>`.
