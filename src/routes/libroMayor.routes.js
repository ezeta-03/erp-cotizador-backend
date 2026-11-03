const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const allowRoles = require("../middlewares/role.middleware");
const controller = require("../controllers/libroMayor.controller");

// Libro Mayor: solo ADMIN y CONTABLE. ?desde&hasta[&formato=xlsx|pdf]
router.get("/", auth, allowRoles("ADMIN", "CONTABLE"), controller.obtener);

module.exports = router;
