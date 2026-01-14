const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const allowRoles = require("../middlewares/role.middleware");
const clientesController = require("../controllers/clientes.controller");

// Crear cliente
router.post("/", auth, allowRoles("ADMIN", "VENTAS"), clientesController.crear);

// Listar clientes
router.get("/", auth, allowRoles("ADMIN", "VENTAS"), clientesController.listar);

// Actualizar cliente
router.put("/:id", auth, allowRoles("ADMIN"), clientesController.actualizar);

// Eliminar cliente
router.delete("/:id", auth, allowRoles("ADMIN"), clientesController.eliminar);

// Invitar cliente
router.post(
  "/:id/invitar",
  // "/invitar",

  auth,
  allowRoles("ADMIN", "VENTAS"),
  clientesController.invitarCliente
);

// Análisis clientes + cotizaciones
// router.get(
//   "/actividad",
//   auth,
//   allowRoles("ADMIN", "VENTAS"),
//   clientesController.actividadClientes
// );

router.get(
  "/actividad",
  auth,
  allowRoles("ADMIN", "VENTAS"),
  clientesController.getActividadClientes
);

router.get(
  "/:id/actividad",
  auth,
  allowRoles("ADMIN", "VENTAS"),
  clientesController.actividadesClientes
);


module.exports = router;
