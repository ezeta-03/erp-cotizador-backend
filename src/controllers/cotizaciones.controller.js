const prisma = require("../config/prisma");

// Crear cotización completa
exports.crearCotizacion = async (req, res) => {
  try {
    const { numero, clienteId, margen, notas, items } = req.body;

    // 1. Validar cliente
    const cliente = await prisma.cliente.findUnique({
      where: { id: Number(clienteId) }
    });

    if (!cliente) {
      return res.status(400).json({ message: "Cliente no existe" });
    }

    if (!items || items.length === 0) {
      return res.status(400).json({ message: "La cotización debe tener items" });
    }

    // 2. Validar productos y calcular subtotales
    let subtotal = 0;

    const itemsData = [];

    for (const item of items) {
      const producto = await prisma.producto.findUnique({
        where: { id: Number(item.productoId) }
      });

      if (!producto) {
        return res
          .status(400)
          .json({ message: `Producto ${item.productoId} no existe` });
      }

      const precioUnitario = Number(item.precio);
      const cantidad = Number(item.cantidad);
      const sub = precioUnitario * cantidad;

      subtotal += sub;

      itemsData.push({
        productoId: producto.id,
        cantidad,
        precio: precioUnitario,
        subtotal: sub
      });
    }

    const total = subtotal + subtotal * (margen / 100);

    // 3. Crear cotización
    const cotizacion = await prisma.cotizacion.create({
      data: {
        numero,
        clienteId: cliente.id,
        usuarioId: req.user.id,
        margen: Number(margen),
        notas,
        total,
        items: {
          create: itemsData
        }
      },
      include: {
        cliente: true,
        items: {
          include: {
            producto: true
          }
        }
      }
    });

    res.json(cotizacion);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al crear cotización" });
  }
};

// Listar cotizaciones según rol
exports.listarCotizaciones = async (req, res) => {
  try {
    const user = req.user;

    let where = {};

    if (user.role === "VENTAS") {
      where.usuarioId = user.id;
    }

    const cotizaciones = await prisma.cotizacion.findMany({
      where,
      include: {
        cliente: true
      },
      orderBy: { createdAt: "desc" }
    });

    res.json(cotizaciones);
  } catch (error) {
    res.status(500).json({ message: "Error al listar cotizaciones" });
  }
};

// Cliente: última cotización
exports.ultimaCotizacionCliente = async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== "CLIENTE") {
      return res.sendStatus(403);
    }

    const cotizacion = await prisma.cotizacion.findFirst({
      where: { clienteId: user.id },
      include: {
        items: {
          include: { producto: true }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    res.json(cotizacion);
  } catch (error) {
    res.status(500).json({ message: "Error obteniendo cotización" });
  }
};