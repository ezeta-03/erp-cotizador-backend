const router     = require("express").Router();
const auth       = require("../middlewares/auth.middleware");
const allowRoles = require("../middlewares/role.middleware");
const ctrl       = require("../controllers/almacen.controller");

router.get ("/stock",                auth, allowRoles("ADMIN", "VENTAS", "CONTABLE"), ctrl.stock);
router.get ("/movimientos",          auth, allowRoles("ADMIN", "CONTABLE"),           ctrl.listarMovimientos);
router.get ("/:productoId/kardex",   auth, allowRoles("ADMIN", "CONTABLE"),           ctrl.kardexProducto);
router.post("/entradas",             auth, allowRoles("ADMIN"),                       ctrl.registrarEntrada);
router.post("/salidas",              auth, allowRoles("ADMIN", "VENTAS"),             ctrl.registrarSalida);

module.exports = router;
