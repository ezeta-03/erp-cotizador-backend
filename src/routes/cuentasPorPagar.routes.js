const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const allowRoles = require("../middlewares/role.middleware");
const controller = require("../controllers/cuentasPorPagar.controller");
const adjunto = require("../middlewares/adjunto.middleware");

// Cuentas por pagar: solo ADMIN y CONTABLE.
const roles = allowRoles("ADMIN", "CONTABLE");

router.get("/", auth, roles, controller.resumen);
router.get("/opciones", auth, roles, controller.opciones);
router.get("/alertas", auth, roles, controller.alertas);
// Categorías de gasto
router.get("/categorias", auth, roles, controller.listarCategorias);
router.post("/categorias", auth, roles, controller.crearCategoria);
router.put("/categorias/:id", auth, roles, controller.actualizarCategoria);
// Proveedores de compras y servicios (no los arrendadores de paneles)
router.get("/proveedores", auth, roles, controller.listarProveedores);
router.post("/proveedores", auth, roles, controller.crearProveedor);
router.put("/proveedores/:id", auth, roles, controller.actualizarProveedor);
// Documentos por pagar y sus pagos
router.get("/documentos", auth, roles, controller.listarDocumentos);
router.post("/documentos", auth, roles, controller.crearDocumento);
router.get("/documentos/:id", auth, roles, controller.obtenerDocumento);
router.put("/documentos/:id", auth, roles, controller.actualizarDocumento);
router.post("/documentos/:id/anular", auth, roles, controller.anularDocumento);
router.post("/documentos/:id/adjuntos", auth, roles, adjunto, controller.agregarAdjuntoDocumento);
router.get("/documentos/:id/adjuntos/:adjuntoId", auth, roles, controller.urlAdjuntoDocumento);
router.delete("/documentos/:id/adjuntos/:adjuntoId", auth, roles, controller.eliminarAdjuntoDocumento);
router.post("/documentos/:id/pagos", auth, roles, adjunto, controller.registrarPago);
router.post("/documentos/:id/pagos/:pagoId/adjuntos", auth, roles, adjunto, controller.agregarAdjuntoPago);
router.get("/documentos/:id/pagos/:pagoId/adjuntos/:adjuntoId", auth, roles, controller.urlAdjuntoPago);
router.delete("/documentos/:id/pagos/:pagoId/adjuntos/:adjuntoId", auth, roles, controller.eliminarAdjuntoPago);
router.delete("/documentos/:id/pagos/:pagoId", auth, roles, controller.eliminarPago);
// Cuotas de alquiler de paneles
router.post("/cuotas-paneles/:id/pagar", auth, roles, controller.pagarCuotaPanel);
router.post("/cuotas-paneles/:id/revertir", auth, roles, controller.revertirCuotaPanel);

module.exports = router;
