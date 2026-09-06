const prisma = require("../config/prisma");

// Email fijo del "usuario sistema" que representa peticiones automatizadas de otros
// sistemas de confianza (ej. seguimiento-actividades). Se crea una sola vez con
// scripts/setup-usuario-sistema.js; nunca puede loguearse por el flujo normal
// (password aleatorio, activo:false).
const SISTEMA_EMAIL = "sistema.proyectos@almacen.interno";
let sistemaUsuarioIdCache = null;

async function resolverUsuarioSistema() {
  if (sistemaUsuarioIdCache) return sistemaUsuarioIdCache;
  const usuario = await prisma.usuario.findUnique({ where: { email: SISTEMA_EMAIL } });
  if (!usuario) {
    throw new Error(
      `Usuario de sistema no encontrado (${SISTEMA_EMAIL}). Correr: node scripts/setup-usuario-sistema.js`
    );
  }
  sistemaUsuarioIdCache = usuario.id;
  return usuario.id;
}

// Permite que una ruta la llame:
//  1) Un humano logueado (JWT normal vía Authorization: Bearer) — delega al middleware
//     de auth existente, sin cambiar su comportamiento.
//  2) Un sistema externo de confianza (ej. Cloud Function de seguimiento-actividades),
//     identificado con la clave compartida en el header X-Almacen-Bridge-Key — se le
//     asigna la identidad del "usuario sistema" para que el resto del código (logs,
//     FK de MovimientoAlmacen.usuarioId) funcione sin cambios.
module.exports = function servicioOAuth(authMiddlewareHumano) {
  return async (req, res, next) => {
    const claveRecibida = req.header("X-Almacen-Bridge-Key")?.trim();
    if (!claveRecibida) {
      return authMiddlewareHumano(req, res, next);
    }

    // .trim() de ambos lados: un espacio o salto de línea de más al copiar la clave
    // en el panel de variables de entorno (Render, etc.) no debe romper la comparación.
    const claveEsperada = process.env.ALMACEN_BRIDGE_API_KEY?.trim();
    if (!claveEsperada || claveRecibida !== claveEsperada) {
      return res.status(401).json({ message: "Clave de servicio inválida" });
    }

    try {
      const usuarioId = await resolverUsuarioSistema();
      req.user = { id: usuarioId, role: "ADMIN", esSistema: true };
      next();
    } catch (error) {
      console.error("❌", error.message);
      res.status(500).json({ message: "Error de configuración del puente de almacén" });
    }
  };
};
