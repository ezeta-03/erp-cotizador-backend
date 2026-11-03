const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const allowRoles = require("../middlewares/role.middleware");
const controller = require("../controllers/cajaBancos.controller");

// Caja y Bancos: solo ADMIN y CONTABLE (como Cuentas por cobrar y por pagar).
const roles = allowRoles("ADMIN", "CONTABLE");

router.get("/", auth, roles, controller.listar);
router.post("/", auth, roles, controller.crear);
router.put("/:id", auth, roles, controller.actualizar);
router.get("/:id/movimientos", auth, roles, controller.movimientos);

module.exports = router;
