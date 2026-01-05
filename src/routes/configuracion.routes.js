// routes/configuracion.routes.js
const express = require("express");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const router = express.Router();

// GET /api/configuracion
router.get("/", async (req, res) => {
  const config = await prisma.configuracion.findFirst();
  res.json(config);
});

// PUT /api/configuracion
router.put("/", async (req, res) => {
  const { costo_indirecto, porcentaje_administrativo, rentabilidad } = req.body;
  const config = await prisma.configuracion.findFirst();
  const updated = await prisma.configuracion.update({
    where: { id: config.id },
    data: { costo_indirecto, porcentaje_administrativo, rentabilidad },
  });
  res.json(updated);
});

// POST /api/configuracion/recalcular
router.post("/recalcular", async (req, res) => {
  const config = await prisma.configuracion.findFirst();
  const productos = await prisma.producto.findMany();

  for (const p of productos) {
    const costoParcial1 = p.costo_material * (1 + config.costo_indirecto);
    const costoParcial2 = costoParcial1 * (1 + config.porcentaje_administrativo);
    const precioFinal   = costoParcial2 * (1 + config.rentabilidad);
    const margen        = precioFinal * config.rentabilidad;

    await prisma.producto.update({
      where: { id: p.id },
      data: {
        costo_parcial_1: costoParcial1,
        costo_parcial_2: costoParcial2,
        precio_final: precioFinal,
        margen,
      },
    });
  }

  res.json({ message: "Productos recalculados con nueva configuración" });
});

module.exports = router;
