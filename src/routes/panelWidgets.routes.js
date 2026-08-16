const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const allowRoles = require("../middlewares/role.middleware");
const ctrl = require("../controllers/panelWidgets.controller");

router.get("/", auth, allowRoles("ADMIN", "VENTAS"), ctrl.listar);
router.put("/", auth, allowRoles("ADMIN", "VENTAS"), ctrl.guardar);

module.exports = router;
