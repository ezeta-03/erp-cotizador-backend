const router = require("express").Router();
const auth = require("../middelwares/auth.middleware");
const allowRoles = require("../middelwares/role.middleware");
const controller = require("../controllers/usuarios.controller");

router.use(auth, allowRoles("ADMIN"));

router.get("/", controller.listar);
router.post("/", controller.crear);
router.put("/:id", controller.actualizar);
router.delete("/:id", controller.eliminar);

module.exports = router;
