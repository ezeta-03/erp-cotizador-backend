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

// Cliente: ver última cotización
router.get(
  "/mi-ultima",
  auth,
  allowRoles("CLIENTE"),
  controller.ultimaCotizacionCliente
);

// Descargar PDF de cotización
router.get("/:id/pdf", auth, controller.generarPdf);

module.exports = router;
