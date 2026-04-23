const prisma = require("../config/prisma");
const XLSX = require("xlsx");

// ── Listar productos (solo activos por defecto) ───────────────────────────────
exports.listar = async (req, res) => {
  try {
    const { activo = "true", categoria } = req.query;

    const where = { activo: activo === "true" };
    if (categoria) where.categoria = categoria;

    const productos = await prisma.producto.findMany({
      where,
      orderBy: { nombre: "asc" },
      include: { adicionales: true },
    });

    res.json(productos);
  } catch (error) {
    console.error("Error al listar productos:", error);
    res.status(500).json({ message: "Error al listar productos" });
  }
};

// ── Crear producto ────────────────────────────────────────────────────────────
exports.crear = async (req, res) => {
  try {
    const { categoria, servicio, material, unidad, costo_material, adicionales } = req.body;

    if (!categoria || !servicio || costo_material === undefined) {
      return res.status(400).json({ message: "Faltan campos requeridos: categoria, servicio, costo_material" });
    }

    const costo = Number(costo_material);
    const producto = await prisma.producto.create({
      data: {
        categoria,
        servicio,
        nombre: servicio,
        material: material || null,
        unidad: unidad || null,
        costo_material: costo,
        costo_parcial_1: parseFloat((costo * 1.1).toFixed(2)),
        costo_parcial_2: parseFloat((costo * 1.1 * 1.17).toFixed(2)),
        precio_final: parseFloat((costo * 1.1 * 1.17 * 1.2).toFixed(2)),
        margen: parseFloat((costo * 1.1 * 1.17 * 1.2 * 0.2).toFixed(2)),
        adicionales: adicionales?.length
          ? { create: adicionales.map((a) => ({ nombre: a.nombre, precio: Number(a.precio) })) }
          : undefined,
      },
    });
    res.status(201).json(producto);
  } catch (error) {
    console.error("❌ Error creando producto:", error);
    res.status(500).json({ message: "Error creando producto" });
  }
};

// ── Actualizar producto ───────────────────────────────────────────────────────
exports.actualizar = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { categoria, servicio, material, unidad, costo_material, adicionales } = req.body;

    const costo = Number(costo_material);
    const producto = await prisma.producto.update({
      where: { id },
      data: {
        categoria,
        servicio,
        nombre: servicio,
        material: material || null,
        unidad: unidad || null,
        costo_material: costo,
        costo_parcial_1: parseFloat((costo * 1.1).toFixed(2)),
        costo_parcial_2: parseFloat((costo * 1.1 * 1.17).toFixed(2)),
        precio_final: parseFloat((costo * 1.1 * 1.17 * 1.2).toFixed(2)),
        margen: parseFloat((costo * 1.1 * 1.17 * 1.2 * 0.2).toFixed(2)),
        adicionales: adicionales
          ? { deleteMany: {}, create: adicionales.map((a) => ({ nombre: a.nombre, precio: Number(a.precio) })) }
          : undefined,
      },
    });
    res.json(producto);
  } catch (error) {
    console.error("❌ Error actualizando producto:", error);
    res.status(500).json({ message: "Error actualizando producto" });
  }
};

// ── Eliminar un producto (soft delete) ───────────────────────────────────────
exports.eliminar = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await prisma.producto.update({ where: { id }, data: { activo: false } });
    res.json({ message: "Producto desactivado" });
  } catch (error) {
    console.error("❌ Error al desactivar producto:", error);
    res.status(500).json({ message: "Error al desactivar producto" });
  }
};

// ── Eliminar TODOS los productos (soft delete masivo) ────────────────────────
exports.eliminarTodos = async (req, res) => {
  try {
    const { count } = await prisma.producto.updateMany({ data: { activo: false } });
    res.json({ message: `${count} producto(s) desactivado(s)`, count });
  } catch (error) {
    console.error("❌ Error al eliminar todos los productos:", error);
    res.status(500).json({ message: "Error al eliminar productos" });
  }
};

// ── Importar desde CSV (Producto;Precio de Produccion) ───────────────────────
exports.importarCSV = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No se envió ningún archivo" });
    }

    const contenido = req.file.buffer.toString("utf-8");
    const lineas = contenido
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lineas.length < 2) {
      return res.status(400).json({ message: "El archivo está vacío o sin datos" });
    }

    const filasDatos = lineas.slice(1); // saltar cabecera
    const resultados = { creados: 0, actualizados: 0, omitidos: 0, errores: [], total: filasDatos.length };

    // Soft-delete masivo antes de importar (reemplazo total)
    await prisma.producto.updateMany({ where: { activo: true }, data: { activo: false } });

    for (let i = 0; i < filasDatos.length; i++) {
      const fila = filasDatos[i];
      const partes = fila.split(";");

      if (partes.length < 2) { resultados.omitidos++; continue; }

      const nombre = partes[0].trim();
      const precioRaw = partes[1].trim();

      if (!nombre) { resultados.omitidos++; continue; }
      if (!precioRaw) { resultados.omitidos++; continue; }

      const precioStr = precioRaw.replace(/S\/\s*/i, "").replace(",", ".").trim();
      const precio = parseFloat(precioStr);

      if (isNaN(precio)) {
        resultados.errores.push({ fila: i + 2, nombre, error: `Precio inválido: "${precioRaw}"` });
        continue;
      }

      // Categoría: primera palabra del nombre
      const categoria = nombre.split(/\s+/)[0].toUpperCase().replace(/[^A-ZÁÉÍÓÚÑ]/gi, "") || "GENERAL";

      try {
        const existente = await prisma.producto.findFirst({ where: { nombre } });

        if (existente) {
          await prisma.producto.update({
            where: { id: existente.id },
            data: { servicio: nombre, categoria, precio_final: precio, costo_material: precio, costo_parcial_1: precio, costo_parcial_2: precio, margen: 0, activo: true },
          });
          resultados.actualizados++;
        } else {
          await prisma.producto.create({
            data: { nombre, servicio: nombre, categoria, precio_final: precio, costo_material: precio, costo_parcial_1: precio, costo_parcial_2: precio, margen: 0, activo: true },
          });
          resultados.creados++;
        }
      } catch (err) {
        resultados.errores.push({ fila: i + 2, nombre, error: err.message });
      }
    }

    res.json({ message: "Importación CSV completada", ...resultados });
  } catch (error) {
    console.error("Error al importar CSV:", error);
    res.status(500).json({ message: "Error al importar archivo CSV", error: error.message });
  }
};

// ── Exportar productos a Excel ────────────────────────────────────────────────
exports.exportarExcel = async (req, res) => {
  try {
    const { tipo } = req.query;

    let data = [];

    if (tipo === "plantilla") {
      data = [{ Producto: "BANNER DELGADO 10 ONZAS", "Precio de Produccion": "S/ 9.00" }];
    } else {
      const productos = await prisma.producto.findMany({
        where: { activo: true },
        orderBy: { nombre: "asc" },
      });
      data = productos.map((p) => ({
        Producto: p.nombre || p.servicio,
        "Precio de Produccion": `S/ ${p.precio_final.toFixed(2)}`,
      }));
    }

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Productos");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Disposition", `attachment; filename=productos_${tipo === "plantilla" ? "plantilla" : Date.now()}.xlsx`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  } catch (error) {
    console.error("Error al exportar Excel:", error);
    res.status(500).json({ message: "Error al exportar archivo" });
  }
};
