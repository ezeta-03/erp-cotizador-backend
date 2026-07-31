const prisma = require("../config/prisma");

async function obtenerParametros(panelId) {
  let parametros = await prisma.parametrosCostoMupi.findUnique({ where: { panelId } });
  if (!parametros) {
    parametros = await prisma.parametrosCostoMupi.create({ data: { panelId } });
  }
  return parametros;
}

// Costo unitario del panel/mupi. LUZ y MANTENIMIENTO se repiten cada mes;
// PRODUCCIÓN e INSTALACIÓN son solo del Mes 01.
function calcularCostos(p) {
  const areaLona = p.anchoLona * p.altoLona;
  const luz = p.luz;
  const mantenimiento = p.costoHoraManoObra * p.horasMantenimiento;
  const produccion = p.costoLona * areaLona * p.numeroCaras;
  const instalacion = p.costoHoraManoObra * p.horasInstalacion;
  const costoMes1 = luz + mantenimiento + produccion + instalacion;
  const costoMes2 = luz + mantenimiento;
  return {
    areaLona: parseFloat(areaLona.toFixed(4)),
    luz,
    mantenimiento: parseFloat(mantenimiento.toFixed(2)),
    produccion: parseFloat(produccion.toFixed(2)),
    instalacion: parseFloat(instalacion.toFixed(2)),
    costoMes1: parseFloat(costoMes1.toFixed(2)),
    costoMes2: parseFloat(costoMes2.toFixed(2)),
  };
}

exports.obtenerParametros = obtenerParametros;
exports.calcularCostos = calcularCostos;

exports.obtener = async (req, res) => {
  try {
    const panelId = parseInt(req.params.panelId);
    const panel = await prisma.panel.findUnique({ where: { id: panelId } });
    if (!panel) return res.status(404).json({ message: "Panel no encontrado" });

    const parametros = await obtenerParametros(panelId);
    res.json({ parametros, costos: calcularCostos(parametros) });
  } catch (e) {
    res.status(500).json({ message: "Error al obtener parámetros de costo", error: e.message });
  }
};

exports.actualizar = async (req, res) => {
  try {
    const panelId = parseInt(req.params.panelId);
    const { luz, costoHoraManoObra, horasMantenimiento, horasInstalacion, costoLona, anchoLona, altoLona, numeroCaras } = req.body;
    const actual = await obtenerParametros(panelId);

    const num = (v, fallback) => (v === "" || v === null || v === undefined ? fallback : parseFloat(v));

    const parametros = await prisma.parametrosCostoMupi.update({
      where: { panelId },
      data: {
        luz: num(luz, actual.luz),
        costoHoraManoObra: num(costoHoraManoObra, actual.costoHoraManoObra),
        horasMantenimiento: num(horasMantenimiento, actual.horasMantenimiento),
        horasInstalacion: num(horasInstalacion, actual.horasInstalacion),
        costoLona: num(costoLona, actual.costoLona),
        anchoLona: num(anchoLona, actual.anchoLona),
        altoLona: num(altoLona, actual.altoLona),
        numeroCaras: num(numeroCaras, actual.numeroCaras),
      },
    });

    res.json({ parametros, costos: calcularCostos(parametros) });
  } catch (e) {
    res.status(500).json({ message: "Error al actualizar parámetros de costo", error: e.message });
  }
};
