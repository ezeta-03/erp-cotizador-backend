const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const allowRoles = require("../middlewares/role.middleware");
const controller = require("../controllers/cotizaciones.controller");

// ✅ RUTAS ESPECÍFICAS PRIMERO

// Cliente: ver última cotización
router.get(
  "/mia",
  auth,
  allowRoles("CLIENTE"),
  controller.ultimaCotizacionCliente
);

// Cliente: ver todas sus cotizaciones
router.get(
  "/mis-cotizaciones",
  auth,
  allowRoles("CLIENTE"),
  controller.misCotizaciones
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
  allowRoles("ADMIN", "VENTAS", "CONTABLE"),
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

// VENTAS/ADMIN: renegociar cotización rechazada
router.post(
  "/:id/renegociar",
  auth,
  allowRoles("ADMIN", "VENTAS"),
  controller.renegociarCotizacion
);

// VENTAS/ADMIN: facturar cotización aprobada
router.post(
  "/:id/facturar",
  auth,
  allowRoles("ADMIN", "VENTAS", "CONTABLE"),
  controller.facturarCotizacion
);

// Descargar PDF
router.get("/:id/pdf", auth, controller.generarPdf);

// Log de cambios de estado
router.get(
  "/:id/log",
  auth,
  allowRoles("ADMIN", "VENTAS", "CONTABLE", "CLIENTE"),
  controller.obtenerLog
);

module.exports = router;