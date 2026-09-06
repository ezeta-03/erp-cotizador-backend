const router        = require("express").Router();
const auth          = require("../middlewares/auth.middleware");
const servicioOAuth = require("../middlewares/servicioOAuth.middleware");
const allowRoles    = require("../middlewares/role.middleware");
const ctrl          = require("../controllers/almacen.controller");

router.get ("/stock",                auth, allowRoles("ADMIN", "VENTAS", "CONTABLE"), ctrl.stock);
router.get ("/movimientos",          auth, allowRoles("ADMIN", "CONTABLE"),           ctrl.listarMovimientos);
router.get ("/:productoId/kardex",   auth, allowRoles("ADMIN", "CONTABLE"),           ctrl.kardexProducto);
router.post("/entradas",             auth,               allowRoles("ADMIN"),           ctrl.registrarEntrada);
// /salidas también acepta al puente de seguimiento-actividades (clave de servicio
// en X-Almacen-Bridge-Key), para que un Proyecto pueda pedir insumos del almacén.
router.post("/salidas",              servicioOAuth(auth), allowRoles("ADMIN", "VENTAS"), ctrl.registrarSalida);

module.exports = router;
