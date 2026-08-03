const prisma = require("../config/prisma");

const ESTADOS_VALIDOS  = ["LIBRE", "LIBRE_EXTERNO", "OCUPADO", "OCUPADO_EXTERNO", "REEMPLAZO"];
const DISTRITOS_VALIDOS = ["HUANCAYO", "EL_TAMBO", "CHILCA"];
const TIPOS_VALIDOS    = ["ESTATICO", "LED", "MUPI"];
const PROPIEDAD_VALIDOS = ["PROPIO", "EXTERNO"];

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
      costoProduccion, costoInstalacion, precioMes, estado, propiedad,
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
        propiedad:        PROPIEDAD_VALIDOS.includes(propiedad) ? propiedad : "PROPIO",
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
      costoProduccion, costoInstalacion, precioMes, estado, propiedad,
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
        propiedad:        PROPIEDAD_VALIDOS.includes(propiedad) ? propiedad : undefined,
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

exports.actualizarPrecioMes = async (req, res) => {
  try {
    const { precioMes } = req.body;
    const valor = toFloat(precioMes);
    if (valor === null) return res.status(400).json({ message: "Precio inválido" });

    const panel = await prisma.panel.update({
      where: { id: parseInt(req.params.id) },
      data: { precioMes: valor },
    });
    res.json(panel);
  } catch (e) {
    res.status(500).json({ message: "Error al actualizar precio mínimo", error: e.message });
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

      const tipo = TIPOS_VALIDOS.includes(fila.tipo) ? fila.tipo : "ESTATICO";

      const existente = await prisma.panel.findUnique({ where: { codigo } });
      if (existente && existente.tipo !== tipo) {
        resultados.errores.push({
          codigo,
          error: `Ya existe como tipo ${existente.tipo}; la importación no puede cambiarlo a ${tipo}`,
        });
        continue;
      }

      const data = {
        nombre:           fila.nombre   || null,
        distrito:         DISTRITOS_VALIDOS.includes(fila.distrito) ? fila.distrito : null,
        tipo,
        ubicacion:        fila.ubicacion || null,
        lat:              toFloat(fila.lat),
        lng:              toFloat(fila.lng),
        ancho:            toFloat(fila.ancho),
        alto:             toFloat(fila.alto),
        costoProduccion:  toFloatD(fila.costoProduccion),
        costoInstalacion: toFloatD(fila.costoInstalacion),
        precioMes:        toFloat(fila.precioMes),
        activo:           true,
      };
      // El estado se deriva de las reservas activas; solo se sobrescribe si el CSV trae
      // un valor explícito y válido. Si no, un panel existente NO debe resetearse a LIBRE
      // (solo un panel nuevo, sin historial, arranca en LIBRE).
      const estadoCsv = ESTADOS_VALIDOS.includes(fila.estado) ? fila.estado : undefined;
      const propiedadCsv = PROPIEDAD_VALIDOS.includes(fila.propiedad) ? fila.propiedad : undefined;

      try {
        await prisma.panel.upsert({
          where:  { codigo },
          update: { ...data, estado: estadoCsv, propiedad: propiedadCsv },
          create: { codigo, ...data, estado: estadoCsv ?? "LIBRE", propiedad: propiedadCsv ?? "PROPIO" },
        });
        if (existente) resultados.actualizados++;
        else resultados.creados++;
      } catch (err) {
        resultados.errores.push({ codigo, error: err.message });
      }
    }

    res.json(resultados);
  } catch (e) {
    res.status(500).json({ message: "Error al importar paneles", error: e.message });
  }
};
