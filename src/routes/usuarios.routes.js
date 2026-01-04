const router = require("express").Router();
const auth = require("../middelwares/auth.middleware");
const allowRoles = require("../middelwares/role.middleware");
const usuariosController = require("../controllers/usuarios.controller");

// Solo autenticación a nivel de router; roles por ruta
router.use(auth);

router.get("/", allowRoles("ADMIN"), usuariosController.listar);
router.post("/", allowRoles("ADMIN"), usuariosController.crear);
router.put("/:id", allowRoles("ADMIN"), usuariosController.actualizar);
router.delete("/:id", allowRoles("ADMIN"), usuariosController.eliminar);

module.exports = router;
