const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const allowRoles = require("../middlewares/role.middleware");
const controller = require("../controllers/cotizaciones.controller");

// ✅ RUTAS ESPECÍFICAS PRIMERO

// Cliente: ver última cotización
router.get(
  "/mia",  // ← Esta debe ir ANTES de /:id
  auth,
  allowRoles("CLIENTE"),
  controller.ultimaCotizacionCliente
);

// 🔥 HISTÓRICO (ADMIN, VENTAS)
router.get(
  "/historico",  // ← Esta también debe ir ANTES de /:id
  auth,
  allowRoles("ADMIN", "VENTAS"),
  controller.historicoCotizaciones
);

// ✅ RUTAS GENÉRICAS DESPUÉS

// Crear cotización
router.post(
  "/",
  auth,
  allowRoles("ADMIN", "VENTAS"),
  controller.crearCotizacion
);

// Listar cotizaciones (ADMIN, VENTAS)
router.get(
  "/",
  auth,
  allowRoles("ADMIN", "VENTAS"),
  controller.listarCotizaciones
);

// Obtener cotización específica (ahora SÍ puede estar aquí)
router.get(
  "/:id",  // ← Esta va DESPUÉS de las rutas específicas
  auth,
  allowRoles("ADMIN", "VENTAS", "CLIENTE"),
  controller.obtenerCotizacion
);

// Cliente: aceptar / rechazar cotización
router.post(
  "/:id/responder",
  auth,
  allowRoles("CLIENTE"),
  controller.responderCotizacion
);

// VENTAS/ADMIN: facturar cotización aprobada
router.post(
  "/:id/facturar",
  auth,
  allowRoles("ADMIN", "VENTAS"),
  controller.facturarCotizacion
);

// Descargar PDF
router.get("/:id/pdf", auth, controller.generarPdf);

module.exports = router;