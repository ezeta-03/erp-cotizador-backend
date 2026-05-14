const prisma = require("../config/prisma");

const ESTADOS_VALIDOS = ["DISPONIBLE", "RESERVADO", "EN_USO", "MANTENIMIENTO"];

const conCodigo = (p) => ({
  ...p,
  codigo: `PAN-${String(p.id).padStart(3, "0")}`,
});

exports.listar = async (req, res) => {
  try {
    const paneles = await prisma.panel.findMany({
      where: { activo: true },
      orderBy: { id: "asc" },
    });
    res.json(paneles.map(conCodigo));
  } catch (e) {
    res.status(500).json({ message: "Error al listar paneles", error: e.message });
  }
};

exports.crear = async (req, res) => {
  try {
    const { nombre, ubicacion, lat, lng, ancho, alto, costoProduccion, costoInstalacion, precioMes } = req.body;

    if (!nombre || !ubicacion || !ancho || !alto || !precioMes) {
      return res.status(400).json({ message: "Faltan campos obligatorios" });
    }

    const panel = await prisma.panel.create({
      data: {
        nombre,
        ubicacion,
        lat:              lat  != null ? parseFloat(lat)  : null,
        lng:              lng  != null ? parseFloat(lng)  : null,
        ancho:            parseFloat(ancho),
        alto:             parseFloat(alto),
        costoProduccion:  parseFloat(costoProduccion  ?? 0),
        costoInstalacion: parseFloat(costoInstalacion ?? 0),
        precioMes:        parseFloat(precioMes),
      },
    });

    res.status(201).json(conCodigo(panel));
  } catch (e) {
    res.status(500).json({ message: "Error al crear panel", error: e.message });
  }
};

exports.actualizar = async (req, res) => {
  try {
    const { nombre, ubicacion, lat, lng, ancho, alto, costoProduccion, costoInstalacion, precioMes } = req.body;

    const panel = await prisma.panel.update({
      where: { id: parseInt(req.params.id) },
      data: {
        nombre,
        ubicacion,
        lat:              lat  != null ? parseFloat(lat)  : null,
        lng:              lng  != null ? parseFloat(lng)  : null,
        ancho:            parseFloat(ancho),
        alto:             parseFloat(alto),
        costoProduccion:  parseFloat(costoProduccion  ?? 0),
        costoInstalacion: parseFloat(costoInstalacion ?? 0),
        precioMes:        parseFloat(precioMes),
      },
    });

    res.json(conCodigo(panel));
  } catch (e) {
    res.status(500).json({ message: "Error al actualizar panel", error: e.message });
  }
};

exports.cambiarEstado = async (req, res) => {
  try {
    const { estado } = req.body;

    if (!ESTADOS_VALIDOS.includes(estado)) {
      return res.status(400).json({ message: "Estado inválido" });
    }

    const panel = await prisma.panel.update({
      where: { id: parseInt(req.params.id) },
      data: { estado },
    });

    res.json(conCodigo(panel));
  } catch (e) {
    res.status(500).json({ message: "Error al cambiar estado", error: e.message });
  }
};

exports.eliminar = async (req, res) => {
  try {
    await prisma.panel.update({
      where: { id: parseInt(req.params.id) },
      data: { activo: false },
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: "Error al eliminar panel", error: e.message });
  }
};
