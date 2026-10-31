const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const allowRoles = require("../middlewares/role.middleware");
const controller = require("../controllers/cuentasPorCobrar.controller");

// Cuentas por cobrar: solo ADMIN y CONTABLE.
const roles = allowRoles("ADMIN", "CONTABLE");

router.get("/", auth, roles, controller.resumen);
router.get("/alertas", auth, roles, controller.alertas);
router.get("/estado-cuenta/:numDoc", auth, roles, controller.estadoCuenta);
router.post("/clientes/:numDoc/recordatorio", auth, roles, controller.enviarRecordatorio);

module.exports = router;
