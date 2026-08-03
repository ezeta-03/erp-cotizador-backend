const prisma = require("../config/prisma");

const ESTADOS = ["LIBRE", "LIBRE_EXTERNO", "OCUPADO", "OCUPADO_EXTERNO", "REEMPLAZO"];
// Estados de un panel gestionado por un tercero: son solo un registro de referencia
// (fechas + estado), sin cliente ni precio propios.
const ESTADOS_EXTERNO = ["LIBRE_EXTERNO", "OCUPADO_EXTERNO"];
const esExterno = (estado) => ESTADOS_EXTERNO.includes(estado);

const INCLUDE = {
  panel:   { select: { id: true, codigo: true, nombre: true, distrito: true, tipo: true } },
  cliente: { select: { id: true, nombreComercial: true, documento: true } },
};

const nombreSolapada = (solapada) => solapada.cliente?.nombreComercial ?? "un registro externo";

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

/* ── Listar reservas generadas desde una cotización ── */
exports.porCotizacion = async (req, res) => {
  try {
    const cotizacionId = parseInt(req.params.cotizacionId);

    const reservas = await prisma.reserva.findMany({
      where: { cotizacionId, activo: true },
      include: INCLUDE,
      orderBy: { createdAt: "asc" },
    });

    res.json(reservas);
  } catch (e) {
    res.status(500).json({ message: "Error al listar reservas de la cotización", error: e.message });
  }
};

/* ── Crear ── */
exports.crear = async (req, res) => {
  try {
    const { panelId, clienteId, fechaInicio, fechaFin, precioMensual, estado, notas, cotizacionId } = req.body;
    const estadoFinal = ESTADOS.includes(estado) ? estado : "OCUPADO";
    const externo = esExterno(estadoFinal);

    if (!panelId || !fechaInicio || !fechaFin)
      return res.status(400).json({ message: "Panel y fechas son obligatorios" });
    if (!externo && (!clienteId || !precioMensual))
      return res.status(400).json({ message: "Cliente y precio son obligatorios" });

    const panel = await prisma.panel.findUnique({ where: { id: parseInt(panelId) } });
    if (!panel || !panel.activo) {
      return res.status(400).json({ message: "El panel/mupi no existe o está desactivado" });
    }

    const nuevaInicio = new Date(fechaInicio);
    const nuevaFin = new Date(fechaFin);

    if (nuevaFin <= nuevaInicio)
      return res.status(400).json({ message: "La fecha de fin debe ser posterior al inicio" });

    const solapada = await prisma.reserva.findFirst({
      where: {
        panelId: parseInt(panelId),
        activo: true,
        fechaInicio: { lte: nuevaFin },
        fechaFin: { gte: nuevaInicio },
      },
      include: { cliente: { select: { nombreComercial: true } } },
    });
    if (solapada) {
      return res.status(409).json({
        message: `El panel ya está reservado para ${nombreSolapada(solapada)} del ${solapada.fechaInicio.toISOString().slice(0, 10)} al ${solapada.fechaFin.toISOString().slice(0, 10)}`,
      });
    }

    const reserva = await prisma.reserva.create({
      data: {
        panelId:       parseInt(panelId),
        clienteId:     externo ? null : parseInt(clienteId),
        cotizacionId:  cotizacionId ? parseInt(cotizacionId) : null,
        fechaInicio:   nuevaInicio,
        fechaFin:      nuevaFin,
        precioMensual: externo ? null : parseFloat(precioMensual),
        estado:        estadoFinal,
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
    const id = parseInt(req.params.id);
    const { clienteId, fechaInicio, fechaFin, precioMensual, estado, notas } = req.body;

    const actual = await prisma.reserva.findUnique({ where: { id } });
    if (!actual) return res.status(404).json({ message: "Reserva no encontrada" });

    const estadoFinal = ESTADOS.includes(estado) ? estado : actual.estado;
    const externo = esExterno(estadoFinal);

    const nuevaInicio = fechaInicio ? new Date(fechaInicio) : actual.fechaInicio;
    const nuevaFin = fechaFin ? new Date(fechaFin) : actual.fechaFin;

    if (nuevaFin <= nuevaInicio)
      return res.status(400).json({ message: "La fecha de fin debe ser posterior al inicio" });

    if (!externo && !(clienteId || actual.clienteId))
      return res.status(400).json({ message: "Cliente es obligatorio para una reserva propia" });
    if (!externo && !(precioMensual || actual.precioMensual))
      return res.status(400).json({ message: "Precio es obligatorio para una reserva propia" });

    if (fechaInicio || fechaFin) {
      const solapada = await prisma.reserva.findFirst({
        where: {
          id: { not: id },
          panelId: actual.panelId,
          activo: true,
          fechaInicio: { lte: nuevaFin },
          fechaFin: { gte: nuevaInicio },
        },
        include: { cliente: { select: { nombreComercial: true } } },
      });
      if (solapada) {
        return res.status(409).json({
          message: `El panel ya está reservado para ${nombreSolapada(solapada)} del ${solapada.fechaInicio.toISOString().slice(0, 10)} al ${solapada.fechaFin.toISOString().slice(0, 10)}`,
        });
      }
    }

    const reserva = await prisma.reserva.update({
      where: { id },
      data: {
        clienteId:     externo ? null : (clienteId ? parseInt(clienteId) : undefined),
        fechaInicio:   fechaInicio   ? nuevaInicio : undefined,
        fechaFin:      fechaFin      ? nuevaFin    : undefined,
        precioMensual: externo ? null : (precioMensual ? parseFloat(precioMensual) : undefined),
        estado:        estadoFinal,
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

/* ── Actualizar solo el precio contratado ── */
exports.actualizarPrecioMensual = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { precioMensual } = req.body;
    const valor = parseFloat(precioMensual);
    if (isNaN(valor) || valor <= 0) return res.status(400).json({ message: "Precio inválido" });

    const reserva = await prisma.reserva.update({
      where: { id },
      data: { precioMensual: valor },
      include: INCLUDE,
    });
    res.json(reserva);
  } catch (e) {
    res.status(500).json({ message: "Error al actualizar precio contratado", error: e.message });
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
