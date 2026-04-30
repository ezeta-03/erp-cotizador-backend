const router = require("express").Router();
const multer = require("multer");
const auth = require("../middlewares/auth.middleware");
const allowRoles = require("../middlewares/role.middleware");
const productosController = require("../controllers/productos.controller");

const upload = multer({ storage: multer.memoryStorage() });

// Preview del CSV (sin escritura)
router.post(
  "/preview-csv",
  auth,
  allowRoles("ADMIN"),
  upload.single("archivo"),
  productosController.previewCSV
);

// Importar desde CSV
router.post(
  "/importar-csv",
  auth,
  allowRoles("ADMIN"),
  upload.single("archivo"),
  productosController.importarCSV
);

// Eliminar TODOS los productos (soft-delete masivo)
router.delete(
  "/todos",
  auth,
  allowRoles("ADMIN"),
  productosController.eliminarTodos
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

// Actualizar tipo de medida + unidad
router.patch(
  "/:id/tipo-medida",
  auth,
  allowRoles("ADMIN"),
  productosController.actualizarTipoMedida
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
