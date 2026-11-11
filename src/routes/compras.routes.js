const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const allowRoles = require("../middlewares/role.middleware");
const ctrl = require("../controllers/compras.controller");

// Compras: Admin, Ventas (operaciones/almacén) y Contable crean y reciben
// órdenes; solo Finanzas (Admin o Contable) las aprueba o rechaza.
const todos = allowRoles("ADMIN", "VENTAS", "CONTABLE");
const finanzas = allowRoles("ADMIN", "CONTABLE");

router.get("/opciones", auth, todos, ctrl.opciones);
router.get("/sugerencias", auth, todos, ctrl.sugerencias);
// Proveedores propuestos (hasta 3) con precio, por ítem de almacén
router.get("/items/:id/proveedores", auth, todos, ctrl.listarPropuestos);
router.put("/items/:id/proveedores", auth, todos, ctrl.guardarPropuestos);
// Órdenes de compra
router.get("/ordenes", auth, todos, ctrl.listar);
router.post("/ordenes", auth, todos, ctrl.crear);
router.get("/ordenes/:id", auth, todos, ctrl.obtener);
router.put("/ordenes/:id", auth, todos, ctrl.actualizar);
router.post("/ordenes/:id/enviar", auth, todos, ctrl.enviar);
router.post("/ordenes/:id/aprobar", auth, finanzas, ctrl.aprobar);
router.post("/ordenes/:id/rechazar", auth, finanzas, ctrl.rechazar);
router.post("/ordenes/:id/anular", auth, todos, ctrl.anular);
router.post("/ordenes/:id/recibir", auth, todos, ctrl.recibir);
router.get("/ordenes/:id/pdf", auth.conQueryToken, todos, ctrl.pdf);

module.exports = router;
