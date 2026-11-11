const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const { soloNetwise } = require("../middlewares/netwise.middleware");
const controller = require("../controllers/serviciosNetwise.controller");

// Catálogo de servicios Netwise: usuarios con marca NETWISE y Administradores.
router.use(auth, soloNetwise);

router.get("/", controller.listar);
router.post("/", controller.crear);
router.put("/:id", controller.actualizar);
router.delete("/:id", controller.eliminar);

module.exports = router;
