const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const allowRoles = require("../middlewares/role.middleware");
const controller = require("../controllers/comprobantes.controller");

// Facturación electrónica: emiten y consultan ADMIN y CONTABLE (igual que "Facturar").
const roles = allowRoles("ADMIN", "CONTABLE");

router.get("/", auth, roles, controller.listar);
router.post("/", auth, roles, controller.emitirManual);
router.post("/desde-cotizacion", auth, roles, controller.emitirDesdeCotizacion);
// RUC/DNI del receptor vía Migo (autocompletar)
router.get("/consulta/:documento", auth, roles, controller.consultarDocumento);
router.get("/opciones", auth, roles, controller.opciones);
router.get("/tipo-cambio", auth, roles, controller.tipoCambio);
// Formulario prellenado para convertir una cotización en comprobante
router.get("/cotizacion/:id/borrador", auth, roles, controller.borradorDesdeCotizacion);
router.get("/:id", auth, roles, controller.obtener);
// Cobros (cuentas por cobrar)
router.get("/:id/pagos", auth, roles, controller.listarPagos);
router.post("/:id/pagos", auth, roles, controller.registrarPago);
router.delete("/:id/pagos/:pagoId", auth, roles, controller.eliminarPago);
router.post("/:id/verificar", auth, roles, controller.verificarEnSunat);
router.post("/:id/nota-credito", auth, roles, controller.emitirNota("NOTA_CREDITO"));
router.post("/:id/nota-debito", auth, roles, controller.emitirNota("NOTA_DEBITO"));
router.post("/:id/enviar-correo", auth, roles, controller.enviarCorreo);
router.post("/:id/reenviar", auth, roles, controller.reenviar);
// Descargas abiertas desde el navegador: aceptan el token por query string.
router.get("/:id/xml", auth.conQueryToken, roles, controller.descargarArchivo("xmlFirmado", ""));
router.get("/:id/cdr", auth.conQueryToken, roles, controller.descargarArchivo("cdrXml", "R-"));
router.get("/:id/pdf", auth.conQueryToken, roles, controller.pdf);

module.exports = router;
