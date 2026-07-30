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

// ── Crear producto (formulario manual) ───────────────────────────────────────
exports.crear = async (req, res) => {
  try {
    const { nombre, precio_final, tipoMedida, unidad } = req.body;

    if (!nombre || precio_final === undefined) {
      return res.status(400).json({ message: "Faltan campos requeridos: nombre, precio_final" });
    }

    const precio = parseFloat(String(precio_final).replace(",", "."));
    if (isNaN(precio) || precio <= 0) {
      return res.status(400).json({ message: "precio_final debe ser un número positivo" });
    }

    const categoria = nombre.trim().split(/\s+/)[0].toUpperCase().replace(/[^A-ZÁÉÍÓÚÑ]/gi, "") || "GENERAL";

    const producto = await prisma.producto.create({
      data: {
        nombre: nombre.trim(),
        servicio: nombre.trim(),
        categoria,
        precio_final: precio,
        costo_material: precio,
        costo_parcial_1: precio,
        costo_parcial_2: precio,
        margen: 0,
        unidad: unidad?.trim() || null,
        tipoMedida: tipoMedida || "UNIDAD",
        activo: true,
        origen: "MANUAL",
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

// ── Actualizar tipo de medida + unidad ────────────────────────────────────────
exports.actualizarTipoMedida = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { tipoMedida, unidad } = req.body;
    const validos = ["UNIDAD", "LINEAL", "AREA", "PESO"];
    if (tipoMedida && !validos.includes(tipoMedida)) {
      return res.status(400).json({ message: "tipoMedida inválido" });
    }
    const producto = await prisma.producto.update({
      where: { id },
      data: {
        ...(tipoMedida && { tipoMedida }),
        unidad: unidad !== undefined ? (unidad || null) : undefined,
      },
    });
    res.json(producto);
  } catch (error) {
    console.error("❌ Error actualizando tipo de medida:", error);
    res.status(500).json({ message: "Error actualizando tipo de medida" });
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

// ── Parsear líneas del CSV → array de {nombre, precio} ───────────────────────
function parseLineasCSV(buffer) {
  // Soporta UTF-8 con/sin BOM; si aparecen caracteres de reemplazo (U+FFFD)
  // es que el archivo no era UTF-8 válido (típico de "CSV" exportado como
  // ANSI/Windows-1252 desde Excel) — se reintenta como latin1.
  let texto = buffer.toString("utf-8");
  if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1); // strip BOM
  if (texto.includes("�")) texto = buffer.toString("latin1");

  const lineas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lineas.length < 2) return { filas: [], error: "Archivo vacío o sin datos" };

  const filas = [];
  const nombresVistos = new Set();

  lineas.slice(1).forEach((linea, i) => {
    let partes = linea.split(";");
    if (partes.length < 2 && linea.includes(",")) partes = linea.split(","); // CSV separado por comas

    const nombre = partes[0]?.trim() ?? "";
    const precioRaw = partes[1]?.trim() ?? "";

    if (!nombre || !precioRaw) {
      filas.push({ fila: i + 2, nombre, precio: null, estado: "omitido", motivo: !nombre ? "Nombre vacío" : "Sin precio" });
      return;
    }

    if (nombresVistos.has(nombre)) {
      filas.push({ fila: i + 2, nombre, precio: null, estado: "omitido", motivo: "Nombre duplicado en el archivo (se usó la primera aparición)" });
      return;
    }

    const precioStr = precioRaw.replace(/S\/\s*/i, "").replace(",", ".").trim();
    const precio = parseFloat(precioStr);

    if (isNaN(precio)) {
      filas.push({ fila: i + 2, nombre, precio: null, estado: "error", motivo: `Precio inválido: "${precioRaw}"` });
    } else if (precio <= 0) {
      filas.push({ fila: i + 2, nombre, precio: null, estado: "error", motivo: `El precio debe ser mayor a cero: "${precioRaw}"` });
    } else {
      nombresVistos.add(nombre);
      filas.push({ fila: i + 2, nombre, precio, estado: "valido" });
    }
  });

  return { filas, error: null };
}

// ── Preview del CSV (sin escritura en BD) ─────────────────────────────────────
exports.previewCSV = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No se envió ningún archivo" });

    const { filas, error } = parseLineasCSV(req.file.buffer);
    if (error) return res.status(400).json({ message: error });

    const validas = filas.filter((f) => f.estado === "valido");
    const omitidas = filas.filter((f) => f.estado === "omitido");
    const errores = filas.filter((f) => f.estado === "error");

    // Detectar cuáles ya existen en BD (sin modificar nada)
    const nombres = validas.map((f) => f.nombre);
    const existentes = await prisma.producto.findMany({
      where: { nombre: { in: nombres } },
      select: { nombre: true, activo: true },
    });
    const existenteSet = new Set(existentes.map((p) => p.nombre));

    const preview = validas.map((f) => ({
      ...f,
      accion: existenteSet.has(f.nombre) ? "actualizar" : "crear",
    }));

    res.json({
      preview,
      stats: {
        total: filas.length,
        validos: validas.length,
        nuevos: preview.filter((f) => f.accion === "crear").length,
        actualizar: preview.filter((f) => f.accion === "actualizar").length,
        omitidos: omitidas.length,
        errores: errores.length,
      },
      omitidos: omitidas,
      erroresDetalle: errores,
    });
  } catch (error) {
    console.error("Error en preview CSV:", error);
    res.status(500).json({ message: "Error al procesar preview", error: error.message });
  }
};

// ── Importar desde CSV — batch para no saturar el pool de Supabase ────────────
exports.importarCSV = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No se envió ningún archivo" });

    const { filas, error } = parseLineasCSV(req.file.buffer);
    if (error) return res.status(400).json({ message: error });

    const validas = filas.filter((f) => f.estado === "valido");
    const omitidas = filas.filter((f) => f.estado === "omitido" || f.estado === "error");

    if (validas.length === 0) {
      return res.status(400).json({ message: "No hay productos válidos para importar" });
    }

    // ── 1. Soft-delete solo productos CSV (los manuales sobreviven) ──────────
    await prisma.producto.updateMany({ where: { origen: "CSV" }, data: { activo: false } });

    // ── 2. Cargar todos los existentes de una vez (1 query) ──────────────────
    const nombres = validas.map((f) => f.nombre);
    const existentes = await prisma.producto.findMany({
      where: { nombre: { in: nombres } },
      select: { id: true, nombre: true, origen: true },
    });
    const existenteMap = new Map(existentes.map((p) => [p.nombre, p.id]));

    const toCreate = validas.filter((f) => !existenteMap.has(f.nombre));
    const toUpdate = validas.filter((f) => existenteMap.has(f.nombre));

    // ── 3. Crear nuevos de golpe (1 query) ───────────────────────────────────
    if (toCreate.length > 0) {
      await prisma.producto.createMany({
        data: toCreate.map(({ nombre, precio }) => ({
          nombre,
          servicio: nombre,
          categoria: nombre.split(/\s+/)[0].toUpperCase().replace(/[^A-ZÁÉÍÓÚÑ]/gi, "") || "GENERAL",
          precio_final: precio,
          costo_material: precio,
          costo_parcial_1: precio,
          costo_parcial_2: precio,
          margen: 0,
          activo: true,
          origen: "CSV",
        })),
        skipDuplicates: true,
      });
    }

    // ── 4. Actualizar existentes en una sola transacción (1 conexión) ────────
    if (toUpdate.length > 0) {
      await prisma.$transaction(
        toUpdate.map(({ nombre, precio }) =>
          prisma.producto.update({
            where: { id: existenteMap.get(nombre) },
            data: {
              servicio: nombre,
              precio_final: precio,
              costo_material: precio,
              costo_parcial_1: precio,
              costo_parcial_2: precio,
              activo: true,
            },
          })
        )
      );
    }

    res.json({
      message: "Importación CSV completada",
      creados: toCreate.length,
      actualizados: toUpdate.length,
      omitidos: omitidas.length,
      errores: omitidas.filter((f) => f.estado === "error"),
      total: filas.length,
    });
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
