const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const allowRoles = require("../middlewares/role.middleware");
const controller = require("../controllers/flujoEfectivo.controller");

// Estado de Flujo de Efectivo: solo ADMIN y CONTABLE. ?desde&hasta[&formato=xlsx|pdf]
router.get("/", auth, allowRoles("ADMIN", "CONTABLE"), controller.obtener);

module.exports = router;
