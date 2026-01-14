const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const allowRoles = require("../middlewares/role.middleware");
const productosController = require("../controllers/productos.controller");

// Crear producto
router.post(
  "/",
  auth,
  allowRoles("ADMIN"),
  productosController.crear
);

// Listar productos
router.get(
  "/",
  auth,
  allowRoles("ADMIN", "VENTAS"),
  productosController.listar
);

// Actualizar producto
router.put(
  "/:id",
  auth,
  allowRoles("ADMIN"),
  productosController.actualizar
);

// Eliminar producto
router.delete(
  "/:id",
  auth,
  allowRoles("ADMIN"),
  productosController.eliminar
);

module.exports = router;
