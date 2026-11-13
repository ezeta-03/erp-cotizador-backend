const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const allowRoles = require("../middlewares/role.middleware");
const controller = require("../controllers/reportes.controller");

// Reportes de Zaazmago. ADMIN y CONTABLE.
router.get("/recaudo", auth, allowRoles("ADMIN", "CONTABLE"), controller.recaudo);

module.exports = router;
