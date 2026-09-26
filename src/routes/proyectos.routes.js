const router     = require("express").Router();
const auth       = require("../middlewares/auth.middleware");
const allowRoles = require("../middlewares/role.middleware");
const ctrl       = require("../controllers/proyectos.controller");
const presCtrl   = require("../controllers/presupuestos.controller");

router.use(auth);

router.get("/",          allowRoles("ADMIN", "VENTAS", "CONTABLE"), ctrl.listarProyectos);
// Un Proyecto puede crearse en cualquier momento, a la par de las
// cotizaciones — no depende de que exista o se apruebe una.
router.post("/",         allowRoles("ADMIN", "VENTAS"),             ctrl.crearProyecto);
// Antes de "/:id" — si no, Express interpreta "externos" como un id.
router.get("/externos",  allowRoles("ADMIN", "VENTAS", "CONTABLE"), ctrl.listarProyectosExternos);
// Catálogo de partidas precargadas del presupuesto — también antes de "/:id".
router.get("/partidas-presupuesto", allowRoles("ADMIN", "VENTAS", "CONTABLE"), presCtrl.listarPartidas);
router.put("/partidas-presupuesto", allowRoles("ADMIN"),                       presCtrl.guardarPartidas);
router.get("/:id",       allowRoles("ADMIN", "VENTAS", "CONTABLE"), ctrl.obtenerProyecto);
// Asignar responsables y cambiar estado es solo de Admin, igual que el resto
// de escritura sobre Almacén.
router.put("/:id",  allowRoles("ADMIN"), ctrl.actualizarProyecto);

// Presupuesto y control de costos (uno por proyecto). Lo arma quien puede
// crear proyectos; Contable solo lo consulta.
router.get("/:id/presupuesto", allowRoles("ADMIN", "VENTAS", "CONTABLE"), presCtrl.obtenerPresupuesto);
router.put("/:id/presupuesto", allowRoles("ADMIN", "VENTAS"),             presCtrl.guardarPresupuesto);

module.exports = router;
