const prisma = require("../config/prisma");

// ── Stock actual por producto ─────────────────────────────────────────────────
exports.stock = async (req, res) => {
  try {
    const { categoria } = req.query;

    const where = { activo: true };
    if (categoria) where.categoria = categoria;

    const productos = await prisma.producto.findMany({
      where,
      select: {
        id: true,
        nombre: true,
        servicio: true,
        categoria: true,
        unidad: true,
        stockActual: true,
      },
      orderBy: { nombre: "asc" },
    });

    res.json(productos);
  } catch (error) {
    console.error("❌ Error al obtener stock:", error);
    res.status(500).json({ message: "Error al obtener stock" });
  }
};

// ── Listar movimientos (filtrable por tipo, producto y rango de fechas) ──────
exports.listarMovimientos = async (req, res) => {
  try {
    const { tipo, productoId, desde, hasta } = req.query;

    const where = {};
    if (tipo) where.tipo = tipo;
    if (productoId) where.productoId = Number(productoId);
    if (desde || hasta) {
      where.fecha = {};
      if (desde) where.fecha.gte = new Date(desde);
      if (hasta) where.fecha.lte = new Date(hasta);
    }

    const movimientos = await prisma.movimientoAlmacen.findMany({
      where,
      include: {
        producto: { select: { id: true, nombre: true, servicio: true, unidad: true } },
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

// ── Kardex de un producto ─────────────────────────────────────────────────────
exports.kardexProducto = async (req, res) => {
  try {
    const productoId = Number(req.params.productoId);

    const [producto, movimientos] = await Promise.all([
      prisma.producto.findUnique({
        where: { id: productoId },
        select: { id: true, nombre: true, servicio: true, unidad: true, stockActual: true },
      }),
      prisma.movimientoAlmacen.findMany({
        where: { productoId },
        include: {
          proveedor: { select: { id: true, nombre: true } },
          cliente: { select: { id: true, nombreComercial: true } },
          usuario: { select: { id: true, nombre: true } },
        },
        orderBy: { fecha: "asc" },
      }),
    ]);

    if (!producto) return res.status(404).json({ message: "Producto no encontrado" });

    res.json({ producto, movimientos });
  } catch (error) {
    console.error("❌ Error al obtener kardex:", error);
    res.status(500).json({ message: "Error al obtener kardex" });
  }
};

// ── Registrar entrada (Compras) ───────────────────────────────────────────────
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
          productoId: Number(productoId),
          proveedorId: proveedorId ? Number(proveedorId) : null,
          cantidad: cant,
          precioUnitario: precio,
          precioTotal,
          fecha: fecha ? new Date(fecha) : new Date(),
          notas: notas || null,
          usuarioId: req.user.id,
        },
        include: {
          producto: { select: { id: true, nombre: true, servicio: true, unidad: true } },
          proveedor: { select: { id: true, nombre: true } },
        },
      }),
      prisma.producto.update({
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

    if (!productoId || !cantidad || precioUnitario === undefined) {
      return res.status(400).json({ message: "Faltan campos requeridos: productoId, cantidad, precioUnitario" });
    }
    if (!clienteId && !proyectoExternoId) {
      return res.status(400).json({ message: "La salida debe indicar clienteId y/o proyectoExternoId" });
    }

    const cant = Number(cantidad);
    const precio = Number(precioUnitario);
    if (isNaN(cant) || cant <= 0) return res.status(400).json({ message: "cantidad debe ser un número positivo" });
    if (isNaN(precio) || precio < 0) return res.status(400).json({ message: "precioUnitario inválido" });

    const producto = await prisma.producto.findUnique({
      where: { id: Number(productoId) },
      select: { stockActual: true },
    });
    if (!producto) return res.status(404).json({ message: "Producto no encontrado" });
    if (producto.stockActual < cant) {
      return res.status(400).json({
        message: `Stock insuficiente: disponible ${producto.stockActual}, solicitado ${cant}`,
      });
    }

    const precioTotal = parseFloat((cant * precio).toFixed(2));

    const [movimiento] = await prisma.$transaction([
      prisma.movimientoAlmacen.create({
        data: {
          tipo: "SALIDA",
          productoId: Number(productoId),
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
          producto: { select: { id: true, nombre: true, servicio: true, unidad: true } },
          cliente: { select: { id: true, nombreComercial: true } },
        },
      }),
      prisma.producto.update({
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
