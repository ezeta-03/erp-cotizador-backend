const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const allowRoles = require("../middlewares/role.middleware");
const ctrl = require("../controllers/rentabilidad.controller");

router.get("/mupis", auth, allowRoles("ADMIN", "VENTAS"), ctrl.listarMupis);
router.get("/oportunidad-perdida", auth, allowRoles("ADMIN", "VENTAS"), ctrl.oportunidadPerdida);

module.exports = router;
