const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const allowRoles = require("../middlewares/role.middleware");
const controller = require("../controllers/solicitudesMargen.controller");

// VENTAS/ADMIN: mis aprobadas (must be before /)
router.get("/mis-aprobadas", auth, allowRoles("VENTAS", "ADMIN"), controller.misAprobadas);

// ADMIN: listar todas
router.get("/", auth, allowRoles("ADMIN"), controller.listar);

// VENTAS/ADMIN: crear solicitud
router.post("/", auth, allowRoles("VENTAS", "ADMIN"), controller.crear);

// ADMIN: aprobar / rechazar
router.post("/:id/aprobar", auth, allowRoles("ADMIN"), controller.aprobar);
router.post("/:id/rechazar", auth, allowRoles("ADMIN"), controller.rechazar);

module.exports = router;
