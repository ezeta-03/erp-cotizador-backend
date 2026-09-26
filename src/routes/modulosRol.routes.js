const router     = require("express").Router();
const auth       = require("../middlewares/auth.middleware");
const allowRoles = require("../middlewares/role.middleware");
const ctrl       = require("../controllers/modulosRol.controller");

router.use(auth);

router.get("/",     ctrl.obtener);
router.put("/:rol", allowRoles("ADMIN"), ctrl.actualizar);

module.exports = router;
