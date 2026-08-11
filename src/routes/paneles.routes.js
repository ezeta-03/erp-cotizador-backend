const router     = require("express").Router();
const auth       = require("../middlewares/auth.middleware");
const allowRoles = require("../middlewares/role.middleware");
const ctrl       = require("../controllers/paneles.controller");

router.get   ("/",          auth, allowRoles("ADMIN", "VENTAS"), ctrl.listar);
router.get   ("/eliminados",auth, allowRoles("ADMIN"),           ctrl.listarEliminados);
router.post  ("/",          auth, allowRoles("ADMIN"),           ctrl.crear);
router.post  ("/importar",  auth, allowRoles("ADMIN"),           ctrl.importar);
router.put   ("/:id",       auth, allowRoles("ADMIN"),           ctrl.actualizar);
// El estado de un panel/mupi se deriva de sus reservas; este endpoint es solo
// un override manual para corregir datos, por eso queda restringido a ADMIN.
router.patch ("/:id/estado",auth, allowRoles("ADMIN"),           ctrl.cambiarEstado);
// Edición puntual del precio mínimo (no toca el resto de campos del panel, a
// diferencia de PUT /:id que espera el formulario completo).
router.patch ("/:id/precio-mes", auth, allowRoles("ADMIN"),      ctrl.actualizarPrecioMes);
router.delete("/:id",       auth, allowRoles("ADMIN"),           ctrl.eliminar);
router.patch ("/:id/restaurar", auth, allowRoles("ADMIN"),       ctrl.restaurar);

module.exports = router;
