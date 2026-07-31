const prisma = require("../config/prisma");
const { obtenerParametros, calcularCostos } = require("./parametrosCostoMupi.controller");

// Meses de calendario que toca el contrato (inicio y fin inclusive), mínimo 1 mes.
// Usa toISOString() (UTC) en vez de getMonth()/getFullYear() (hora local), que
// puede correr una fecha "2026-01-01" a diciembre 2025 según la zona horaria del servidor.
const fechaISO = (fecha) => (fecha instanceof Date ? fecha.toISOString() : String(fecha)).slice(0, 10);

function mesesDeContrato(fechaInicio, fechaFin) {
  const [ys, ms] = fechaISO(fechaInicio).split("-").map(Number);
  const [ye, me] = fechaISO(fechaFin).split("-").map(Number);
  const inicioAbs = ys * 12 + ms;
  const finAbs = ye * 12 + me;
  return Math.max(finAbs - inicioAbs + 1, 1);
}

exports.listarMupis = async (req, res) => {
  try {
    const reservas = await prisma.reserva.findMany({
      where: { activo: true },
      include: {
        panel: { select: { codigo: true, nombre: true, tipo: true, precioMes: true } },
        cliente: { select: { nombreComercial: true, nombreContacto: true } },
      },
      orderBy: { fechaInicio: "asc" },
    });

    // Cada panel tiene sus propios parámetros de costo; se calculan una sola vez por panel.
    const costosPorPanel = new Map();
    const costosDe = async (panelId) => {
      if (!costosPorPanel.has(panelId)) {
        const parametros = await obtenerParametros(panelId);
        costosPorPanel.set(panelId, calcularCostos(parametros));
      }
      return costosPorPanel.get(panelId);
    };

    const filas = [];
    for (const r of reservas) {
      const { costoMes1, costoMes2 } = await costosDe(r.panelId);
      const meses = mesesDeContrato(r.fechaInicio, r.fechaFin);
      const mesesRecurrentes = Math.max(meses - 1, 0);
      const precioMinimo = r.panel.precioMes ?? 0;
      const precioContratado = r.precioMensual;

      const rentabilidadMes1 = precioContratado - costoMes1;
      const rentabilidadMes2 = precioContratado - costoMes2;
      const ingresoTotalContrato = precioContratado * meses;
      const costoTotalContrato = costoMes1 + costoMes2 * mesesRecurrentes;
      const rentabilidadTotalContrato = ingresoTotalContrato - costoTotalContrato;

      filas.push({
        reservaId: r.id,
        panelId: r.panelId,
        panel: { codigo: r.panel.codigo, nombre: r.panel.nombre, tipo: r.panel.tipo },
        cliente: r.cliente.nombreComercial,
        contacto: r.cliente.nombreContacto,
        fechaInicio: r.fechaInicio,
        fechaFin: r.fechaFin,
        meses,
        precioMinimo,
        precioContratado,
        bajoMinimo: precioContratado < precioMinimo,
        costoMes1,
        costoMes2,
        rentabilidadMes1: parseFloat(rentabilidadMes1.toFixed(2)),
        rentabilidadMes2: parseFloat(rentabilidadMes2.toFixed(2)),
        ingresoTotalContrato: parseFloat(ingresoTotalContrato.toFixed(2)),
        costoTotalContrato: parseFloat(costoTotalContrato.toFixed(2)),
        rentabilidadTotalContrato: parseFloat(rentabilidadTotalContrato.toFixed(2)),
      });
    }

    const ingresoMensualContratado = filas.reduce((s, f) => s + f.precioContratado, 0);
    const costoMensualMes2 = filas.reduce((s, f) => s + f.costoMes2, 0);
    const utilidadMensualMes2 = filas.reduce((s, f) => s + f.rentabilidadMes2, 0);
    const resumen = {
      nMupis: filas.length,
      ingresoMensualContratado: parseFloat(ingresoMensualContratado.toFixed(2)),
      costoMensualMes2: parseFloat(costoMensualMes2.toFixed(2)),
      utilidadMensualMes2: parseFloat(utilidadMensualMes2.toFixed(2)),
      utilidadTotalContrato: parseFloat(filas.reduce((s, f) => s + f.rentabilidadTotalContrato, 0).toFixed(2)),
      margenPromedioMes2: ingresoMensualContratado > 0 ? parseFloat(((utilidadMensualMes2 / ingresoMensualContratado) * 100).toFixed(1)) : 0,
      contratosBajoPrecioMinimo: filas.filter((f) => f.bajoMinimo).length,
    };

    res.json({ resumen, filas });
  } catch (e) {
    res.status(500).json({ message: "Error al calcular rentabilidad de paneles", error: e.message });
  }
};
