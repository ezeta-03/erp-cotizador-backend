const prisma = require("../config/prisma");

const ITEM_SELECT = {
  id: true, codigo: true, nombre: true, tipo: true, empresa: true,
  categoria: true, unidad: true, ubicacion: true,
  stockMinimo: true, stockMaximo: true, stockActual: true,
  costoUnitario: true, proveedorNombre: true, activo: true,
};

/* ── Catálogo (insumos + productos terminados) ────────────────────────────── */

exports.listarItems = async (req, res) => {
  try {
    const { tipo, empresa, categoria, incluirInactivos } = req.query;
    const where = {};
    if (!incluirInactivos) where.activo = true;
    if (tipo) where.tipo = tipo;
    if (empresa) where.empresa = empresa;
    if (categoria) where.categoria = categoria;

    const items = await prisma.itemAlmacen.findMany({
      where, select: ITEM_SELECT, orderBy: [{ empresa: "asc" }, { tipo: "asc" }, { nombre: "asc" }],
    });
    res.json(items);
  } catch (error) {
    console.error("❌ Error al listar ítems de almacén:", error);
    res.status(500).json({ message: "Error al listar ítems de almacén" });
  }
};

exports.crearItem = async (req, res) => {
  try {
    const {
      codigo, nombre, tipo, empresa, categoria, unidad, ubicacion,
      stockMinimo, stockMaximo, costoUnitario, proveedorNombre,
    } = req.body;

    if (!codigo || !nombre || !tipo || !categoria || !unidad) {
      return res.status(400).json({ message: "Faltan campos requeridos: codigo, nombre, tipo, categoria, unidad" });
    }
    if (!["INSUMO", "PRODUCTO_TERMINADO", "HERRAMIENTA", "MAQUINARIA_EQUIPO"].includes(tipo)) {
      return res.status(400).json({ message: "tipo inválido" });
    }
    if (empresa && !["BTL_OUTDOOR", "NETWISE"].includes(empresa)) {
      return res.status(400).json({ message: "empresa inválida" });
    }

    const item = await prisma.itemAlmacen.create({
      data: {
        codigo, nombre, tipo, categoria, unidad,
        empresa: empresa || "BTL_OUTDOOR",
        ubicacion: ubicacion || null,
        stockMinimo: stockMinimo !== undefined ? Number(stockMinimo) : 0,
        stockMaximo: stockMaximo !== undefined ? Number(stockMaximo) : 0,
        costoUnitario: costoUnitario !== undefined ? Number(costoUnitario) : 0,
        proveedorNombre: proveedorNombre || null,
      },
      select: ITEM_SELECT,
    });
    res.status(201).json(item);
  } catch (error) {
    if (error.code === "P2002") return res.status(400).json({ message: "Ya existe un ítem con ese código" });
    console.error("❌ Error al crear ítem de almacén:", error);
    res.status(500).json({ message: "Error al crear ítem de almacén" });
  }
};

exports.actualizarItem = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nombre, categoria, unidad, ubicacion,
      stockMinimo, stockMaximo, costoUnitario, proveedorNombre, activo,
    } = req.body;

    const item = await prisma.itemAlmacen.update({
      where: { id: Number(id) },
      data: {
        ...(nombre !== undefined && { nombre }),
        ...(categoria !== undefined && { categoria }),
        ...(unidad !== undefined && { unidad }),
        ...(ubicacion !== undefined && { ubicacion: ubicacion || null }),
        ...(stockMinimo !== undefined && { stockMinimo: Number(stockMinimo) }),
        ...(stockMaximo !== undefined && { stockMaximo: Number(stockMaximo) }),
        ...(costoUnitario !== undefined && { costoUnitario: Number(costoUnitario) }),
        ...(proveedorNombre !== undefined && { proveedorNombre: proveedorNombre || null }),
        ...(activo !== undefined && { activo }),
      },
      select: ITEM_SELECT,
    });
    res.json(item);
  } catch (error) {
    console.error("❌ Error al actualizar ítem de almacén:", error);
    res.status(500).json({ message: "Error al actualizar ítem de almacén" });
  }
};

exports.eliminarItem = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.itemAlmacen.update({ where: { id: Number(id) }, data: { activo: false } });
    res.json({ ok: true });
  } catch (error) {
    console.error("❌ Error al desactivar ítem de almacén:", error);
    res.status(500).json({ message: "Error al desactivar ítem de almacén" });
  }
};

/* ── Stock (vista resumida para selects y tablero) ────────────────────────── */
exports.stock = async (req, res) => {
  try {
    const { tipo, empresa, categoria } = req.query;
    const where = { activo: true };
    if (tipo) where.tipo = tipo;
    if (empresa) where.empresa = empresa;
    if (categoria) where.categoria = categoria;

    const items = await prisma.itemAlmacen.findMany({
      where,
      select: { id: true, codigo: true, nombre: true, tipo: true, empresa: true, categoria: true, unidad: true, stockActual: true },
      orderBy: { nombre: "asc" },
    });

    res.json(items);
  } catch (error) {
    console.error("❌ Error al obtener stock:", error);
    res.status(500).json({ message: "Error al obtener stock" });
  }
};

// ── Listar movimientos (filtrable por tipo, ítem y rango de fechas) ─────────
exports.listarMovimientos = async (req, res) => {
  try {
    const { tipo, productoId, desde, hasta } = req.query;

    const where = {};
    if (tipo) where.tipo = tipo;
    if (productoId) where.itemAlmacenId = Number(productoId);
    if (desde || hasta) {
      where.fecha = {};
      if (desde) where.fecha.gte = new Date(desde);
      if (hasta) where.fecha.lte = new Date(hasta);
    }

    const movimientos = await prisma.movimientoAlmacen.findMany({
      where,
      include: {
        item: { select: { id: true, codigo: true, nombre: true, tipo: true, unidad: true } },
        proveedor: { select: { id: true, nombre: true } },
        cliente: { select: { id: true, nombreComercial: true } },
        usuario: { select: { id: true, nombre: true } },
      },
      orderBy: { fecha: "desc" },
    });

    res.json(movimientos);
  } catch (error) {
    console.error("❌ Error al listar movimientos de almacén:", error);
    res.status(500).json({ message: "Error al listar movimientos de almacén" });
  }
};

// ── Kardex de un ítem ────────────────────────────────────────────────────────
exports.kardexItem = async (req, res) => {
  try {
    const itemId = Number(req.params.productoId);

    const [item, movimientos] = await Promise.all([
      prisma.itemAlmacen.findUnique({ where: { id: itemId }, select: ITEM_SELECT }),
      prisma.movimientoAlmacen.findMany({
        where: { itemAlmacenId: itemId },
        include: {
          proveedor: { select: { id: true, nombre: true } },
          cliente: { select: { id: true, nombreComercial: true } },
          usuario: { select: { id: true, nombre: true } },
        },
        orderBy: { fecha: "asc" },
      }),
    ]);

    if (!item) return res.status(404).json({ message: "Ítem no encontrado" });

    res.json({ producto: item, movimientos });
  } catch (error) {
    console.error("❌ Error al obtener kardex:", error);
    res.status(500).json({ message: "Error al obtener kardex" });
  }
};

// ── Registrar entrada (compra de insumo, o ingreso de producto terminado) ───
exports.registrarEntrada = async (req, res) => {
  try {
    const { productoId, proveedorId, cantidad, precioUnitario, fecha, notas } = req.body;

    if (!productoId || !cantidad || precioUnitario === undefined) {
      return res.status(400).json({ message: "Faltan campos requeridos: productoId, cantidad, precioUnitario" });
    }

    const cant = Number(cantidad);
    const precio = Number(precioUnitario);
    if (isNaN(cant) || cant <= 0) return res.status(400).json({ message: "cantidad debe ser un número positivo" });
    if (isNaN(precio) || precio < 0) return res.status(400).json({ message: "precioUnitario inválido" });

    const precioTotal = parseFloat((cant * precio).toFixed(2));

    const [movimiento] = await prisma.$transaction([
      prisma.movimientoAlmacen.create({
        data: {
          tipo: "ENTRADA",
          itemAlmacenId: Number(productoId),
          proveedorId: proveedorId ? Number(proveedorId) : null,
          cantidad: cant,
          precioUnitario: precio,
          precioTotal,
          fecha: fecha ? new Date(fecha) : new Date(),
          notas: notas || null,
          usuarioId: req.user.id,
        },
        include: {
          item: { select: { id: true, codigo: true, nombre: true, tipo: true, unidad: true } },
          proveedor: { select: { id: true, nombre: true } },
        },
      }),
      prisma.itemAlmacen.update({
        where: { id: Number(productoId) },
        data: { stockActual: { increment: cant } },
      }),
    ]);

    res.status(201).json(movimiento);
  } catch (error) {
    console.error("❌ Error al registrar entrada de almacén:", error);
    res.status(500).json({ message: "Error al registrar entrada de almacén" });
  }
};

// ── Registrar salida (Ventas / consumo de proyecto) ──────────────────────────
exports.registrarSalida = async (req, res) => {
  try {
    const {
      productoId, clienteId, proyectoExternoId,
      cantidad, precioUnitario, precioFacturado, fecha, notas,
    } = req.body;

    if (!productoId || !cantidad) {
      return res.status(400).json({ message: "Faltan campos requeridos: productoId, cantidad" });
    }
    if (!clienteId && !proyectoExternoId) {
      return res.status(400).json({ message: "La salida debe indicar clienteId y/o proyectoExternoId" });
    }

    const cant = Number(cantidad);
    if (isNaN(cant) || cant <= 0) return res.status(400).json({ message: "cantidad debe ser un número positivo" });

    const item = await prisma.itemAlmacen.findUnique({
      where: { id: Number(productoId) },
      select: { stockActual: true, costoUnitario: true, empresa: true },
    });
    if (!item) return res.status(404).json({ message: "Ítem no encontrado" });
    // El puente de servicio (seguimiento-actividades) es solo de BTL/Outdoor —
    // nunca debe poder descontar stock de Netwise, aunque el llamador lo pida.
    if (req.user.esSistema && item.empresa !== "BTL_OUTDOOR") {
      return res.status(403).json({ message: "Este ítem no pertenece a BTL/Outdoor" });
    }
    if (item.stockActual < cant) {
      return res.status(400).json({
        message: `Stock insuficiente: disponible ${item.stockActual}, solicitado ${cant}`,
      });
    }

    // Sin precioUnitario (ej. consumo interno de un proyecto, sin venta de por medio):
    // se valoriza al costo del ítem, no a un precio de venta.
    const precio = precioUnitario !== undefined ? Number(precioUnitario) : item.costoUnitario;
    if (isNaN(precio) || precio < 0) return res.status(400).json({ message: "precioUnitario inválido" });

    const precioTotal = parseFloat((cant * precio).toFixed(2));

    const [movimiento] = await prisma.$transaction([
      prisma.movimientoAlmacen.create({
        data: {
          tipo: "SALIDA",
          itemAlmacenId: Number(productoId),
          clienteId: clienteId ? Number(clienteId) : null,
          proyectoExternoId: proyectoExternoId || null,
          cantidad: cant,
          precioUnitario: precio,
          precioTotal,
          precioFacturado: precioFacturado !== undefined ? Number(precioFacturado) : null,
          fecha: fecha ? new Date(fecha) : new Date(),
          notas: notas || null,
          usuarioId: req.user.id,
        },
        include: {
          item: { select: { id: true, codigo: true, nombre: true, tipo: true, unidad: true } },
          cliente: { select: { id: true, nombreComercial: true } },
        },
      }),
      prisma.itemAlmacen.update({
        where: { id: Number(productoId) },
        data: { stockActual: { decrement: cant } },
      }),
    ]);

    res.status(201).json(movimiento);
  } catch (error) {
    console.error("❌ Error al registrar salida de almacén:", error);
    res.status(500).json({ message: "Error al registrar salida de almacén" });
  }
};
