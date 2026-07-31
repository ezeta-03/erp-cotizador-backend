const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const allowRoles = require("../middlewares/role.middleware");
const ctrl = require("../controllers/parametrosCostoMupi.controller");

router.get("/:panelId", auth, allowRoles("ADMIN", "VENTAS"), ctrl.obtener);
router.put("/:panelId", auth, allowRoles("ADMIN"), ctrl.actualizar);

module.exports = router;
