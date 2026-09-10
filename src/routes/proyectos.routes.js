const router     = require("express").Router();
const auth       = require("../middlewares/auth.middleware");
const allowRoles = require("../middlewares/role.middleware");
const ctrl       = require("../controllers/proyectos.controller");

router.use(auth);

router.get("/",     allowRoles("ADMIN", "VENTAS", "CONTABLE"), ctrl.listarProyectos);
router.get("/:id",  allowRoles("ADMIN", "VENTAS", "CONTABLE"), ctrl.obtenerProyecto);
// Asignar responsables y cambiar estado es solo de Admin, igual que el resto
// de escritura sobre Almacén.
router.put("/:id",  allowRoles("ADMIN"), ctrl.actualizarProyecto);

module.exports = router;
