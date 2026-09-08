const router          = require("express").Router();
const auth            = require("../middlewares/auth.middleware");
const servicioOAuth   = require("../middlewares/servicioOAuth.middleware");
const allowRoles      = require("../middlewares/role.middleware");
const ctrl            = require("../controllers/almacen.controller");
const ordenesCtrl     = require("../controllers/ordenesAlmacen.controller");

// Catálogo (insumos + productos terminados)
router.get   ("/items",       auth, allowRoles("ADMIN", "VENTAS", "CONTABLE"), ctrl.listarItems);
router.post  ("/items",       auth, allowRoles("ADMIN"),                       ctrl.crearItem);
router.put   ("/items/:id",   auth, allowRoles("ADMIN"),                       ctrl.actualizarItem);
router.delete("/items/:id",   auth, allowRoles("ADMIN"),                       ctrl.eliminarItem);

// Órdenes de almacén (solicitud/picking-list con varias líneas, imprimible)
router.get ("/ordenes",         auth, allowRoles("ADMIN", "VENTAS", "CONTABLE"), ordenesCtrl.listarOrdenes);
router.post("/ordenes",         auth, allowRoles("ADMIN", "VENTAS"),            ordenesCtrl.crearOrden);
router.get ("/ordenes/:id",     auth, allowRoles("ADMIN", "VENTAS", "CONTABLE"), ordenesCtrl.obtenerOrden);
// PDF acepta token por query string porque se abre como link directo del navegador
router.get ("/ordenes/:id/pdf", auth.conQueryToken, allowRoles("ADMIN", "VENTAS", "CONTABLE"), ordenesCtrl.pdfOrden);

// /stock también acepta al puente de seguimiento-actividades (clave de servicio),
// para alimentar el selector de productos al pedir insumos desde un Proyecto.
router.get ("/stock",                servicioOAuth(auth), allowRoles("ADMIN", "VENTAS", "CONTABLE"), ctrl.stock);
router.get ("/movimientos",          auth, allowRoles("ADMIN", "CONTABLE"),           ctrl.listarMovimientos);
router.get ("/:productoId/kardex",   auth, allowRoles("ADMIN", "CONTABLE"),           ctrl.kardexItem);
router.post("/entradas",             auth,               allowRoles("ADMIN"),           ctrl.registrarEntrada);
// /salidas también acepta al puente de seguimiento-actividades (clave de servicio
// en X-Almacen-Bridge-Key), para que un Proyecto pueda pedir insumos del almacén.
router.post("/salidas",              servicioOAuth(auth), allowRoles("ADMIN", "VENTAS"), ctrl.registrarSalida);

module.exports = router;
