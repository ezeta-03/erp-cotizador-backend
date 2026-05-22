const router     = require("express").Router();
const auth       = require("../middlewares/auth.middleware");
const allowRoles = require("../middlewares/role.middleware");
const ctrl       = require("../controllers/reservas.controller");

router.get   ("/",    auth, allowRoles("ADMIN", "VENTAS"), ctrl.listar);
router.post  ("/",    auth, allowRoles("ADMIN"),           ctrl.crear);
router.put   ("/:id", auth, allowRoles("ADMIN"),           ctrl.actualizar);
router.delete("/:id", auth, allowRoles("ADMIN"),           ctrl.eliminar);

module.exports = router;
