const router = require("express").Router();
const { login, activarCuenta } = require("../controllers/auth.controller");

router.post("/login", login);
router.post("/activar", activarCuenta);


module.exports = router;
