// backend/src/controllers/productos.controller.js
const prisma = require("../config/prisma");
const XLSX = require("xlsx");

// Función helper para calcular precios
function calcularPrecios(costoMaterial) {
  const costoParcial1 = costoMaterial * 1.1; // +10%
  const costoParcial2 = costoParcial1 * 1.17; // +17%
  const precioFinal = costoParcial2 * 1.2; // +20%
  const margen = precioFinal * 0.2; // 20% del precio final

  return {
    costo_parcial_1: parseFloat(costoParcial1.toFixed(2)),
    costo_parcial_2: parseFloat(costoParcial2.toFixed(2)),
    precio_final: parseFloat(precioFinal.toFixed(2)),
    margen: parseFloat(margen.toFixed(2)),
  };
}

// Crear producto
exports.crear = async (req, res) => {
  try {
    const {
      categoria,
      servicio,
      material,
      unidad,
      costo_material,
      adicionales,
    } = req.body;
    const producto = await prisma.producto.create({
      data: {
        categoria,
        servicio,
        material,
        unidad,
        costo_material: Number(costo_material),
        costo_parcial_1: Number(costo_material) * 1.1,
        costo_parcial_2: Number(costo_material) * 1.17,
        precio_final: Number(costo_material) * 1.2,
        margen: Number(costo_material) * 0.2,
        adicionales: adicionales
          ? {
              create: adicionales.map((a) => ({
                nombre: a.nombre,
                precio: Number(a.precio),
              })),
            }
          : undefined,
      },
    });
    res.json(producto);
  } catch (error) {
    console.error("❌ Error creando producto:", error);
    res.status(500).json({ message: "Error creando producto" });
  }
};

// Listar productos
exports.listar = async (req, res) => {
  try {
    const { activo, categoria } = req.query;

    const where = {};
    if (activo !== undefined) where.activo = activo === "true";
    if (categoria) where.categoria = categoria;

    const productos = await prisma.producto.findMany({
      where,
      orderBy: { id: "asc" },
      include: {
        adicionales: true, // 👈 ahora sí trae los adicionales
      },
    });

    res.json(productos);
  } catch (error) {
    console.error("Error al listar productos:", error);
    res.status(500).json({ message: "Error al listar productos" });
  }
};

// Actualizar producto

exports.actualizar = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const {
      categoria,
      servicio,
      material,
      unidad,
      costo_material,
      adicionales,
    } = req.body;
    const producto = await prisma.producto.update({
      where: { id },
      data: {
        categoria,
        servicio,
        material,
        unidad,
        costo_material: Number(costo_material),
        costo_parcial_1: Number(costo_material) * 1.1,
        costo_parcial_2: Number(costo_material) * 1.17,
        precio_final: Number(costo_material) * 1.2,
        margen: Number(costo_material) * 0.2,
        adicionales: adicionales
          ? {
              deleteMany: {},
              create: adicionales.map((a) => ({
                nombre: a.nombre,
                precio: Number(a.precio),
              })),
            }
          : undefined,
      },
    });
    res.json(producto);
  } catch (error) {
    console.error("❌ Error actualizando producto:", error);
    res.status(500).json({ message: "Error actualizando producto" });
  }
};

// Eliminar producto (soft delete)
exports.eliminar = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.producto.update({
      where: { id: Number(id) },
      data: { activo: false },
    });

    res.json({ message: "Producto desactivado" });
  } catch (error) {
    res.status(500).json({ message: "Error al eliminar producto" });
  }
};

// Importar productos desde Excel
exports.importarExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No se envió ningún archivo" });
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);

    if (data.length === 0) {
      return res.status(400).json({ message: "El archivo está vacío" });
    }

    const resultados = {
      creados: 0,
      actualizados: 0,
      errores: [],
      total: data.length,
    };

    for (let i = 0; i < data.length; i++) {
      const fila = data[i];

      try {
        const categoria =
          fila["Categoria"] || fila["Categoría"] || fila["CATEGORIA"];
        const servicio = fila["Servicio"] || fila["SERVICIO"];
        const capacidad_productiva =
          fila["Capacidad Productiva"] || fila["CAPACIDAD PRODUCTIVA"] || null;
        const unidad = fila["Unidad"] || fila["UNIDAD"] || null;
        const valor_unitario =
          fila["Valor Unitario"] || fila["VALOR UNITARIO"] || null;
        const costo_material = Number(
          fila["Costo Material"] ||
            fila["COSTO MATERIAL"] ||
            fila["Material"] ||
            0
        );

        if (!categoria || !servicio) {
          resultados.errores.push({
            fila: i + 2,
            error: "Faltan campos requeridos (Categoria, Servicio)",
          });
          continue;
        }

        const precios = calcularPrecios(costo_material);

        // Buscar si existe producto similar
        const existente = await prisma.producto.findFirst({
          where: {
            categoria,
            servicio,
            capacidad_productiva,
          },
        });

        if (existente) {
          await prisma.producto.update({
            where: { id: existente.id },
            data: {
              costo_material,
              unidad,
              valor_unitario,
              ...precios,
              nombre: servicio,
              precio_material: costo_material,
              activo: true,
            },
          });
          resultados.actualizados++;
        } else {
          await prisma.producto.create({
            data: {
              categoria,
              servicio,
              capacidad_productiva,
              unidad,
              valor_unitario,
              costo_material,
              ...precios,
              nombre: servicio,
              precio_material: costo_material,
              precio_mano_obra: 0,
              activo: true,
            },
          });
          resultados.creados++;
        }
      } catch (error) {
        resultados.errores.push({ fila: i + 2, error: error.message });
      }
    }

    res.json({
      message: "Importación completada",
      ...resultados,
    });
  } catch (error) {
    console.error("Error al importar Excel:", error);
    res
      .status(500)
      .json({ message: "Error al importar archivo", error: error.message });
  }
};

// Exportar productos a Excel
exports.exportarExcel = async (req, res) => {
  try {
    const { tipo } = req.query;

    let data = [];

    if (tipo === "plantilla") {
      data = [
        {
          Categoria: "IMPRESIONES",
          Servicio: "Ejemplo Servicio",
          "Capacidad Productiva": "1 unidad de ejemplo",
          Unidad: "und",
          "Valor Unitario": 0,
          "Costo Material": 100,
        },
      ];
    } else {
      const productos = await prisma.producto.findMany({
        where: { activo: true },
        orderBy: { id: "asc" },
      });

      data = productos.map((p) => ({
        Categoria: p.categoria,
        Servicio: p.servicio,
        "Capacidad Productiva": p.capacidad_productiva || "",
        Unidad: p.unidad || "",
        "Valor Unitario": p.valor_unitario || 0,
        "Costo Material": p.costo_material,
        "Costo Parcial 1": p.costo_parcial_1,
        "Costo Parcial 2": p.costo_parcial_2,
        "Precio Final": p.precio_final,
        Margen: p.margen,
      }));
    }

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Productos");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=productos_${
        tipo === "plantilla" ? "plantilla" : Date.now()
      }.xlsx`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.send(buffer);
  } catch (error) {
    console.error("Error al exportar Excel:", error);
    res.status(500).json({ message: "Error al exportar archivo" });
  }
};
