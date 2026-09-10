const prisma = require("../config/prisma");

const SOLICITUD_INCLUDE = {
  item: { select: { id: true, codigo: true, nombre: true, unidad: true, stockActual: true, empresa: true } },
  proyecto: { select: { id: true, nombre: true } },
  resueltoPor: { select: { id: true, nombre: true } },
};

exports.listarSolicitudes = async (req, res) => {
  try {
    const { estado } = req.query;
    const where = {};
    if (estado) where.estado = estado;

    const solicitudes = await prisma.solicitudAlmacen.findMany({
      where,
      include: SOLICITUD_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
    res.json(solicitudes);
  } catch (error) {
    console.error("❌ Error al listar solicitudes de almacén:", error);
    res.status(500).json({ message: "Error al listar solicitudes de almacén" });
  }
};

// Aprobar: recién acá se crea el MovimientoAlmacen real y se descuenta stock
// — se revalida el stock porque puede haber pasado tiempo desde que se pidió.
exports.aprobarSolicitud = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const solicitud = await prisma.solicitudAlmacen.findUnique({
      where: { id },
      include: { item: true },
    });
    if (!solicitud) return res.status(404).json({ message: "Solicitud no encontrada" });
    if (solicitud.estado !== "PENDIENTE") {
      return res.status(400).json({ message: `La solicitud ya fue ${solicitud.estado.toLowerCase()}` });
    }
    if (solicitud.item.stockActual < solicitud.cantidad) {
      return res.status(400).json({
        message: `Stock insuficiente: disponible ${solicitud.item.stockActual}, solicitado ${solicitud.cantidad}`,
      });
    }

    const precio = solicitud.item.costoUnitario;
    const precioTotal = parseFloat((solicitud.cantidad * precio).toFixed(2));

    const [movimiento] = await prisma.$transaction([
      prisma.movimientoAlmacen.create({
        data: {
          tipo: "SALIDA",
          itemAlmacenId: solicitud.itemAlmacenId,
          proyectoExternoId: solicitud.proyectoExternoId,
          proyectoId: solicitud.proyectoId,
          cantidad: solicitud.cantidad,
          precioUnitario: precio,
          precioTotal,
          notas: solicitud.notas || null,
          usuarioId: req.user.id,
        },
      }),
      prisma.itemAlmacen.update({
        where: { id: solicitud.itemAlmacenId },
        data: { stockActual: { decrement: solicitud.cantidad } },
      }),
    ]);

    const actualizada = await prisma.solicitudAlmacen.update({
      where: { id },
      data: {
        estado: "APROBADA",
        resueltoPorId: req.user.id,
        resueltoAt: new Date(),
        movimientoId: movimiento.id,
      },
      include: SOLICITUD_INCLUDE,
    });

    res.json(actualizada);
  } catch (error) {
    console.error("❌ Error al aprobar solicitud de almacén:", error);
    res.status(500).json({ message: "Error al aprobar la solicitud" });
  }
};

exports.rechazarSolicitud = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { motivo } = req.body;

    const solicitud = await prisma.solicitudAlmacen.findUnique({ where: { id } });
    if (!solicitud) return res.status(404).json({ message: "Solicitud no encontrada" });
    if (solicitud.estado !== "PENDIENTE") {
      return res.status(400).json({ message: `La solicitud ya fue ${solicitud.estado.toLowerCase()}` });
    }

    const actualizada = await prisma.solicitudAlmacen.update({
      where: { id },
      data: {
        estado: "RECHAZADA",
        resueltoPorId: req.user.id,
        resueltoAt: new Date(),
        motivoRechazo: motivo || null,
      },
      include: SOLICITUD_INCLUDE,
    });

    res.json(actualizada);
  } catch (error) {
    console.error("❌ Error al rechazar solicitud de almacén:", error);
    res.status(500).json({ message: "Error al rechazar la solicitud" });
  }
};
