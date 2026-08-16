const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const allowRoles = require("../middlewares/role.middleware");
const ctrl = require("../controllers/dashboard.controller");

router.get("/resumen", auth, allowRoles("ADMIN", "VENTAS"), ctrl.resumen);

module.exports = router;
