const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const allowRoles = require("../middlewares/role.middleware");
const ctrl = require("../controllers/rentabilidad.controller");

router.get("/mupis", auth, allowRoles("ADMIN", "VENTAS"), ctrl.listarMupis);

module.exports = router;
