const router = require("express").Router();

// ✅ importar middlewares
const auth = require("../middelwares/auth.middleware");
const allowRoles = require("../middelwares/role.middleware");

// ✅ importar TODO el controller
const authController = require("../controllers/auth.controller");

// ================== AUTH ==================
router.post("/login", authController.login);
router.post("/activar", authController.activarCuenta);

// ================== CLIENTE ==================
router.post(
  "/cambiar-password",
  auth,
  allowRoles("CLIENTE"),
  authController.cambiarPassword
);

module.exports = router;
