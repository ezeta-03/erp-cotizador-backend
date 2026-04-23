const router = require("express").Router();
const multer = require("multer");
const auth = require("../middlewares/auth.middleware");
const allowRoles = require("../middlewares/role.middleware");
const productosController = require("../controllers/productos.controller");

const upload = multer({ storage: multer.memoryStorage() });

// Importar desde CSV (antes de las rutas con :id)
router.post(
  "/importar-csv",
  auth,
  allowRoles("ADMIN"),
  upload.single("archivo"),
  productosController.importarCSV
);

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

// Eliminar producto (soft delete)
router.delete(
  "/:id",
  auth,
  allowRoles("ADMIN"),
  productosController.eliminar
);

module.exports = router;
