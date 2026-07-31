const router     = require("express").Router();
const auth       = require("../middlewares/auth.middleware");
const allowRoles = require("../middlewares/role.middleware");
const ctrl       = require("../controllers/reservas.controller");

router.get   ("/",    auth, allowRoles("ADMIN", "VENTAS"), ctrl.listar);
router.get   ("/por-cotizacion/:cotizacionId", auth, allowRoles("ADMIN", "VENTAS"), ctrl.porCotizacion);
router.post  ("/",    auth, allowRoles("ADMIN"),           ctrl.crear);
router.put   ("/:id", auth, allowRoles("ADMIN"),           ctrl.actualizar);
// Edición puntual del precio contratado (no toca el resto de campos de la reserva,
// a diferencia de PUT /:id que sobrescribe notas/fechas/estado si no se envían).
router.patch ("/:id/precio-mensual", auth, allowRoles("ADMIN"), ctrl.actualizarPrecioMensual);
router.delete("/:id", auth, allowRoles("ADMIN"),           ctrl.eliminar);

module.exports = router;
