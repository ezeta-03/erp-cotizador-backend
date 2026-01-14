const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const allowRoles = require("../middlewares/role.middleware");
const usuariosController = require("../controllers/usuarios.controller");

// Solo autenticación a nivel de router; roles por ruta
router.use(auth);

router.get("/", allowRoles("ADMIN"), usuariosController.listar);
router.post("/", allowRoles("ADMIN"), usuariosController.crear);
router.put("/:id", allowRoles("ADMIN"), usuariosController.actualizar);
router.delete("/:id", allowRoles("ADMIN"), usuariosController.eliminar);
// Cambiar estado (activar/desactivar)
router.patch(
  "/:id/estado",
  auth,
  allowRoles("ADMIN"),
  usuariosController.cambiarEstado
);
router.post(
  "/:id/reinvitacion",
  auth,
  allowRoles("ADMIN"),
  usuariosController.reinvitar
);
module.exports = router;
