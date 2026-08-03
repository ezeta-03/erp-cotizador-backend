const prisma = require("../config/prisma");

exports.listar = async (req, res) => {
  try {
    const eventos = await prisma.eventoProduccionInstalacion.findMany({
      include: {
        reserva: {
          select: {
            id: true,
            panel: { select: { id: true, codigo: true, nombre: true, tipo: true, costoProduccion: true, costoInstalacion: true } },
            cliente: { select: { nombreComercial: true } },
          },
        },
      },
      orderBy: { fecha: "desc" },
    });

    const filas = eventos.map((e) => {
      const costo = e.reserva.panel.costoProduccion + e.reserva.panel.costoInstalacion;
      const rentabilidad = e.montoCobrado - costo;
      return {
        id: e.id,
        reservaId: e.reservaId,
        panel: { codigo: e.reserva.panel.codigo, nombre: e.reserva.panel.nombre, tipo: e.reserva.panel.tipo },
        cliente: e.reserva.cliente?.nombreComercial ?? null,
        fecha: e.fecha,
        montoCobrado: e.montoCobrado,
        costo: parseFloat(costo.toFixed(2)),
        rentabilidad: parseFloat(rentabilidad.toFixed(2)),
        notas: e.notas,
      };
    });

    const resumen = {
      nEventos: filas.length,
      totalCobrado: parseFloat(filas.reduce((s, f) => s + f.montoCobrado, 0).toFixed(2)),
      totalCosto: parseFloat(filas.reduce((s, f) => s + f.costo, 0).toFixed(2)),
      totalRentabilidad: parseFloat(filas.reduce((s, f) => s + f.rentabilidad, 0).toFixed(2)),
    };

    res.json({ resumen, filas });
  } catch (e) {
    res.status(500).json({ message: "Error al listar eventos de producción/instalación", error: e.message });
  }
};

exports.crear = async (req, res) => {
  try {
    const { reservaId, fecha, montoCobrado, notas } = req.body;
    if (!reservaId || !fecha || montoCobrado === undefined || montoCobrado === null || montoCobrado === "")
      return res.status(400).json({ message: "Reserva, fecha y monto cobrado son obligatorios" });

    const valor = parseFloat(montoCobrado);
    if (isNaN(valor) || valor < 0) return res.status(400).json({ message: "Monto cobrado inválido" });

    const reserva = await prisma.reserva.findUnique({ where: { id: parseInt(reservaId) } });
    if (!reserva) return res.status(404).json({ message: "Reserva no encontrada" });

    const evento = await prisma.eventoProduccionInstalacion.create({
      data: {
        reservaId: parseInt(reservaId),
        fecha: new Date(fecha),
        montoCobrado: valor,
        notas: notas || null,
      },
    });

    res.status(201).json(evento);
  } catch (e) {
    res.status(500).json({ message: "Error al registrar evento", error: e.message });
  }
};

exports.eliminar = async (req, res) => {
  try {
    await prisma.eventoProduccionInstalacion.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: "Error al eliminar evento", error: e.message });
  }
};
