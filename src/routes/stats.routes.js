// src/routes/stats.routes.js
const express = require("express");
const router = express.Router();
const statsController = require("../controllers/stats.controller");
const verifyToken = require("../middlewares/auth.middleware");
const checkRole = require("../middlewares/role.middleware");

// Todas las rutas requieren autenticación
router.use(verifyToken);

// Estadísticas de cotizaciones por estado
router.get("/cotizaciones/estados", statsController.getEstadisticasCotizaciones);

// Cotizaciones por día del mes actual
router.get("/cotizaciones/por-dia", statsController.getCotizacionesPorDia);

// Meta mensual (vendedor obtiene la suya, admin puede obtener de cualquiera)
router.get("/meta", statsController.getMetaMensual);

// Progreso vs meta
router.get("/progreso", statsController.getProgresoMeta);

// Solo ADMIN
router.post("/meta", checkRole("ADMIN"), statsController.setMetaMensual);
router.get("/progreso/todos", statsController.getProgresoTodosVendedores);

module.exports = router;