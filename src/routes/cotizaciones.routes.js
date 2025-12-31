const router = require("express").Router();
const auth = require("../middelwares/auth.middleware");
const allowRoles = require("../middelwares/role.middleware");
const controller = require("../controllers/cotizaciones.controller");

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

// 🔥 HISTÓRICO (ADMIN, VENTAS)
router.get(
  "/historico",
  auth,
  allowRoles("ADMIN", "VENTAS"),
  controller.historicoCotizaciones
);

// Cliente: ver última cotización
router.get(
  "/mia",
  auth,
  allowRoles("CLIENTE"),
  controller.ultimaCotizacionCliente
);

// Cliente: aceptar / rechazar cotización
router.post(
  "/:id/responder",
  auth,
  allowRoles("CLIENTE"),
  controller.responderCotizacion // 🔴 ESTE ERA EL PROBLEMA
);

// Descargar PDF
router.get("/:id/pdf", auth, controller.generarPdf);

module.exports = router;
