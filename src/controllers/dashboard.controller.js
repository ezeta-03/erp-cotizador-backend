const prisma = require("../config/prisma");

exports.getDashboard = async (req, res) => {
  const role = req.user.role;

  // ADMIN
  if (role === "ADMIN") {
    const [clientes, productos, cotizaciones, ultimas] = await Promise.all([
      prisma.cliente.count(),
      prisma.producto.count(),
      prisma.cotizacion.count(),
      prisma.cotizacion.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        include: { cliente: true }
      })
    ]);

    return res.json({
      clientes,
      productos,
      cotizaciones,
      ultimas
    });
  }

  // VENTAS
  if (role === "VENTAS") {
    const cotizaciones = await prisma.cotizacion.findMany({
      where: { usuarioId: req.user.id },
      orderBy: { createdAt: "desc" }
    });

    return res.json({
      total: cotizaciones.length,
      recientes: cotizaciones.slice(0, 5)
    });
  }

  // CLIENTE
  if (role === "CLIENTE") {
    const cotizacion = await prisma.cotizacion.findFirst({
      where: { clienteId: req.user.id },
      orderBy: { createdAt: "desc" }
    });

    return res.json({
      cotizacion
    });
  }

  res.sendStatus(403);
};
