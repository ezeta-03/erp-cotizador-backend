const prisma = require("../config/prisma");

const ESTADOS = ["LIBRE", "LIBRE_EXTERNO", "OCUPADO", "REEMPLAZO"];

const INCLUDE = {
  panel:   { select: { id: true, codigo: true, nombre: true, distrito: true, tipo: true } },
  cliente: { select: { id: true, nombreComercial: true, documento: true } },
};

/* ── Listar por año ── */
exports.listar = async (req, res) => {
  try {
    const anio = parseInt(req.query.anio) || new Date().getFullYear();
    const yearStart = new Date(anio, 0, 1);
    const yearEnd   = new Date(anio, 11, 31, 23, 59, 59);

    const reservas = await prisma.reserva.findMany({
      where: {
        activo: true,
        OR: [
          { fechaInicio: { lte: yearEnd },   fechaFin: { gte: yearStart } },
        ],
      },
      include: INCLUDE,
      orderBy: { fechaInicio: "asc" },
    });

    res.json(reservas);
  } catch (e) {
    res.status(500).json({ message: "Error al listar reservas", error: e.message });
  }
};

/* ── Crear ── */
exports.crear = async (req, res) => {
  try {
    const { panelId, clienteId, fechaInicio, fechaFin, precioMensual, estado, notas } = req.body;

    if (!panelId || !clienteId || !fechaInicio || !fechaFin || !precioMensual)
      return res.status(400).json({ message: "Panel, cliente, fechas y precio son obligatorios" });

    if (new Date(fechaFin) <= new Date(fechaInicio))
      return res.status(400).json({ message: "La fecha de fin debe ser posterior al inicio" });

    const reserva = await prisma.reserva.create({
      data: {
        panelId:       parseInt(panelId),
        clienteId:     parseInt(clienteId),
        fechaInicio:   new Date(fechaInicio),
        fechaFin:      new Date(fechaFin),
        precioMensual: parseFloat(precioMensual),
        estado:        ESTADOS.includes(estado) ? estado : "OCUPADO",
        notas:         notas || null,
      },
      include: INCLUDE,
    });

    await prisma.panel.update({
      where: { id: reserva.panelId },
      data: { estado: reserva.estado },
    });

    res.status(201).json(reserva);
  } catch (e) {
    res.status(500).json({ message: "Error al crear reserva", error: e.message });
  }
};

/* ── Actualizar ── */
exports.actualizar = async (req, res) => {
  try {
    const { clienteId, fechaInicio, fechaFin, precioMensual, estado, notas } = req.body;

    if (fechaInicio && fechaFin && new Date(fechaFin) <= new Date(fechaInicio))
      return res.status(400).json({ message: "La fecha de fin debe ser posterior al inicio" });

    const reserva = await prisma.reserva.update({
      where: { id: parseInt(req.params.id) },
      data: {
        clienteId:     clienteId     ? parseInt(clienteId) : undefined,
        fechaInicio:   fechaInicio   ? new Date(fechaInicio) : undefined,
        fechaFin:      fechaFin      ? new Date(fechaFin)    : undefined,
        precioMensual: precioMensual ? parseFloat(precioMensual) : undefined,
        estado:        ESTADOS.includes(estado) ? estado : undefined,
        notas:         notas ?? null,
      },
      include: INCLUDE,
    });

    await prisma.panel.update({
      where: { id: reserva.panelId },
      data: { estado: reserva.estado },
    });

    res.json(reserva);
  } catch (e) {
    res.status(500).json({ message: "Error al actualizar reserva", error: e.message });
  }
};

/* ── Eliminar (soft) ── */
exports.eliminar = async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const reserva = await prisma.reserva.findUnique({ where: { id } });
    if (!reserva) return res.status(404).json({ message: "Reserva no encontrada" });

    await prisma.reserva.update({ where: { id }, data: { activo: false } });

    const ahora = new Date();
    const vigente = await prisma.reserva.findFirst({
      where: {
        panelId:     reserva.panelId,
        activo:      true,
        fechaInicio: { lte: ahora },
        fechaFin:    { gte: ahora },
      },
      orderBy: { fechaInicio: "desc" },
    });

    await prisma.panel.update({
      where: { id: reserva.panelId },
      data: { estado: vigente ? vigente.estado : "LIBRE" },
    });

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: "Error al eliminar reserva", error: e.message });
  }
};
