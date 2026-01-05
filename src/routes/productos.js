// routes/productos.js
const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const router = express.Router();
const upload = multer({ dest: "uploads/" });

router.post("/import-excel", upload.single("file"), async (req, res) => {
  try {
    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    for (const row of rows) {
      await prisma.producto.create({
        data: {
          categoria: row["Categoría"],
          servicio: row["Servicio"],
          material: row["Material"],
          unidad: row["Unidad"],
          costo_material: Number(row["Costo Material (S/.)"]),
          costo_parcial_1: Number(row["Costo Parcial 1"]),
          costo_parcial_2: Number(row["Costo Parcial 2"]),
          precio_final: Number(row["Precio Final"]),
          margen: Number(row["Margen"]),
          activo: true,
        },
      });
    }

    res.json({ message: "Productos importados correctamente" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al importar Excel" });
  }
});

module.exports = router;
