const prisma = require("../config/prisma");

const ESTADOS_VALIDOS  = ["LIBRE", "LIBRE_EXTERNO", "OCUPADO", "REEMPLAZO"];
const DISTRITOS_VALIDOS = ["HUANCAYO", "EL_TAMBO", "CHILCA"];
const TIPOS_VALIDOS    = ["ESTATICO", "LED", "MUPI"];

/* ── helpers ── */
const toFloat   = (v) => (v != null && v !== "" ? parseFloat(v)  : null);
const toFloatD  = (v, d = 0) => (v != null && v !== "" ? parseFloat(v) : d);

exports.listar = async (req, res) => {
  try {
    const paneles = await prisma.panel.findMany({
      where: { activo: true },
      orderBy: { codigo: "asc" },
    });
    res.json(paneles);
  } catch (e) {
    res.status(500).json({ message: "Error al listar paneles", error: e.message });
  }
};

exports.crear = async (req, res) => {
  try {
    const {
      codigo, nombre, distrito, tipo, ubicacion,
      lat, lng, ancho, alto,
      costoProduccion, costoInstalacion, precioMes, estado,
    } = req.body;

    if (!codigo) return res.status(400).json({ message: "El código es obligatorio" });

    const panel = await prisma.panel.create({
      data: {
        codigo:           codigo.trim().toUpperCase(),
        nombre:           nombre   || null,
        distrito:         DISTRITOS_VALIDOS.includes(distrito) ? distrito : null,
        tipo:             TIPOS_VALIDOS.includes(tipo) ? tipo : "ESTATICO",
        ubicacion:        ubicacion || null,
        lat:              toFloat(lat),
        lng:              toFloat(lng),
        ancho:            toFloat(ancho),
        alto:             toFloat(alto),
        costoProduccion:  toFloatD(costoProduccion),
        costoInstalacion: toFloatD(costoInstalacion),
        precioMes:        toFloat(precioMes),
        estado:           ESTADOS_VALIDOS.includes(estado) ? estado : "LIBRE",
      },
    });

    res.status(201).json(panel);
  } catch (e) {
    if (e.code === "P2002") return res.status(409).json({ message: `El código ya existe` });
    res.status(500).json({ message: "Error al crear panel", error: e.message });
  }
};

exports.actualizar = async (req, res) => {
  try {
    const {
      codigo, nombre, distrito, tipo, ubicacion,
      lat, lng, ancho, alto,
      costoProduccion, costoInstalacion, precioMes, estado,
    } = req.body;

    const panel = await prisma.panel.update({
      where: { id: parseInt(req.params.id) },
      data: {
        codigo:           codigo ? codigo.trim().toUpperCase() : undefined,
        nombre:           nombre   ?? null,
        distrito:         DISTRITOS_VALIDOS.includes(distrito) ? distrito : null,
        tipo:             TIPOS_VALIDOS.includes(tipo) ? tipo : undefined,
        ubicacion:        ubicacion ?? null,
        lat:              toFloat(lat),
        lng:              toFloat(lng),
        ancho:            toFloat(ancho),
        alto:             toFloat(alto),
        costoProduccion:  toFloatD(costoProduccion),
        costoInstalacion: toFloatD(costoInstalacion),
        precioMes:        toFloat(precioMes),
        estado:           ESTADOS_VALIDOS.includes(estado) ? estado : undefined,
      },
    });

    res.json(panel);
  } catch (e) {
    if (e.code === "P2002") return res.status(409).json({ message: `El código ya existe` });
    res.status(500).json({ message: "Error al actualizar panel", error: e.message });
  }
};

exports.cambiarEstado = async (req, res) => {
  try {
    const { estado } = req.body;
    if (!ESTADOS_VALIDOS.includes(estado))
      return res.status(400).json({ message: "Estado inválido" });

    const panel = await prisma.panel.update({
      where: { id: parseInt(req.params.id) },
      data: { estado },
    });
    res.json(panel);
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

/* ── Importación masiva desde CSV ── */
exports.importar = async (req, res) => {
  try {
    const filas = req.body; // array de objetos
    if (!Array.isArray(filas) || filas.length === 0)
      return res.status(400).json({ message: "No se recibieron datos" });

    const resultados = { creados: 0, actualizados: 0, errores: [] };

    for (const fila of filas) {
      const codigo = fila.codigo?.trim().toUpperCase();
      if (!codigo) continue;

      const data = {
        nombre:           fila.nombre   || null,
        distrito:         DISTRITOS_VALIDOS.includes(fila.distrito) ? fila.distrito : null,
        tipo:             TIPOS_VALIDOS.includes(fila.tipo) ? fila.tipo : "ESTATICO",
        ubicacion:        fila.ubicacion || null,
        lat:              toFloat(fila.lat),
        lng:              toFloat(fila.lng),
        ancho:            toFloat(fila.ancho),
        alto:             toFloat(fila.alto),
        costoProduccion:  toFloatD(fila.costoProduccion),
        costoInstalacion: toFloatD(fila.costoInstalacion),
        precioMes:        toFloat(fila.precioMes),
        estado:           ESTADOS_VALIDOS.includes(fila.estado) ? fila.estado : "LIBRE",
        activo:           true,
      };

      try {
        await prisma.panel.upsert({
          where:  { codigo },
          update: data,
          create: { codigo, ...data },
        });
        resultados.creados++;
      } catch (err) {
        resultados.errores.push({ codigo, error: err.message });
      }
    }

    res.json(resultados);
  } catch (e) {
    res.status(500).json({ message: "Error al importar paneles", error: e.message });
  }
};
