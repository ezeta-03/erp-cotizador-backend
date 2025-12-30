const router = require("express").Router();
const auth = require("../middelwares/auth.middleware");
const allowRoles = require("../middelwares/role.middleware");
const clientesController = require("../controllers/clientes.controller");

// Crear cliente
router.post(
  "/",
  auth,
  allowRoles("ADMIN", "VENTAS"),
  clientesController.crear
);

// Listar clientes
router.get(
  "/",
  auth,
  allowRoles("ADMIN", "VENTAS"),
  clientesController.listar
);

// Actualizar cliente
router.put(
  "/:id",
  auth,
  allowRoles("ADMIN"),
  clientesController.actualizar
);

// Eliminar cliente
router.delete(
  "/:id",
  auth,
  allowRoles("ADMIN"),
  clientesController.eliminar
);

module.exports = router;
