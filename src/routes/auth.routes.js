const express = require("express");
const router = express.Router();

// Controllers
const authController = require("../controllers/auth.controller");

// Middlewares
const auth = require("../middlewares/auth.middleware");
const allowRoles = require("../middlewares/role.middleware");

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

// ================== USUARIO ACTUAL ==================
router.get("/me", auth, authController.me);

module.exports = router;
