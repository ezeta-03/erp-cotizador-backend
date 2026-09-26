const prisma = require("../config/prisma");

// Secciones de la hoja "Presupuesto y control de costos — BTL & Producción",
// en el orden en que aparecen.
const CATEGORIAS = ["MANO_DE_OBRA", "MATERIALES", "PRODUCCION_GRAFICA", "LOGISTICA", "EQUIPOS", "ADMINISTRATIVOS"];

// Filas con las que arranca el catálogo la primera vez que alguien lo pide.
// Los precios son los del Excel original; el resto queda en 0 para que el
// Admin los complete (o los enlace a un ítem de Almacén).
const PARTIDAS_INICIALES = [
  ["MANO_DE_OBRA", "Operador 1", "día", 63],
  ["MANO_DE_OBRA", "Operador 2", "día", 45],
  ["MANO_DE_OBRA", "Apoyo 1", "día", 0],
  ["MANO_DE_OBRA", "Transporte", "día", 0],
  ["MANO_DE_OBRA", "Otros", "día", 0],
  ["MATERIALES", "Vinil adhesivo impreso", "m²", 0],
  ["MATERIALES", "Banners", "unid.", 0],
  ["MATERIALES", "Módulos / corpóreos", "unid.", 0],
  ["MATERIALES", "Merchandising", "unid.", 0],
  ["MATERIALES", "Insumos de sampling / degustación", "unid.", 0],
  ["PRODUCCION_GRAFICA", "Diseño gráfico", "hrs", 43],
  ["PRODUCCION_GRAFICA", "Impresión", "m²", 0],
  ["PRODUCCION_GRAFICA", "Corte y/o Laminado", "m²", 0],
  ["PRODUCCION_GRAFICA", "Instalación / Insumos / pegado", "m²", 0],
  ["LOGISTICA", "Transporte de materiales", "viaje", 0],
  ["LOGISTICA", "Alquiler de herramientas y otros", "día", 0],
  ["LOGISTICA", "Permisos y seguros", "glob.", 0],
  ["LOGISTICA", "Combustible y viáticos", "día", 0],
  ["EQUIPOS", "Alquiler equipos audiovisuales", "día", 0],
  ["EQUIPOS", "Alquiler de carpa", "día", 230],
  ["EQUIPOS", "Equipo fotográfico / video", "día", 0],
  ["EQUIPOS", "Herramientas y EPP", "glob.", 0],
  ["ADMINISTRATIVOS", "Comunicaciones", "glob.", 0],
  ["ADMINISTRATIVOS", "Papelería y oficina", "glob.", 0],
  ["ADMINISTRATIVOS", "Imprevistos / contingencia", "glob.", 0],
];

const ITEM_ALMACEN_SELECT = { id: true, codigo: true, nombre: true, unidad: true, costoUnitario: true };

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

// Precio efectivo de una partida: si está enlazada a Almacén manda el costo
// del ítem, si no el precio cargado a mano.
const precioPartida = (p) => (p.itemAlmacen ? p.itemAlmacen.costoUnitario : p.precioUnitario);

async function listarCatalogo({ soloActivas }) {
  const total = await prisma.partidaPresupuesto.count();
  if (total === 0) {
    await prisma.partidaPresupuesto.createMany({
      data: PARTIDAS_INICIALES.map(([categoria, nombre, unidad, precioUnitario], orden) => ({
        categoria, nombre, unidad, precioUnitario, orden,
      })),
    });
  }
  const partidas = await prisma.partidaPresupuesto.findMany({
    where: soloActivas ? { activo: true } : {},
    include: { itemAlmacen: { select: ITEM_ALMACEN_SELECT } },
    orderBy: [{ orden: "asc" }, { id: "asc" }],
  });
  return partidas.map((p) => ({ ...p, precioEfectivo: precioPartida(p) }));
}

exports.listarPartidas = async (req, res) => {
  try {
    res.json(await listarCatalogo({ soloActivas: false }));
  } catch (error) {
    console.error("❌ Error al listar partidas de presupuesto:", error);
    res.status(500).json({ message: "Error al listar el catálogo de partidas" });
  }
};

// Reemplaza el catálogo completo con lo que manda el editor: actualiza las
// que traen id, crea las nuevas y borra las que ya no vienen. Los
// presupuestos guardados no se tocan (tienen sus propias filas).
exports.guardarPartidas = async (req, res) => {
  try {
    const { partidas } = req.body;
    if (!Array.isArray(partidas)) return res.status(400).json({ message: "Se esperaba una lista de partidas" });

    for (const p of partidas) {
      if (!CATEGORIAS.includes(p.categoria)) return res.status(400).json({ message: `Categoría inválida: ${p.categoria}` });
      if (!p.nombre || !String(p.nombre).trim()) return res.status(400).json({ message: "Todas las partidas necesitan un nombre" });
    }

    const datos = (p, orden) => ({
      categoria: p.categoria,
      nombre: String(p.nombre).trim(),
      unidad: String(p.unidad || "").trim() || "unid.",
      precioUnitario: num(p.precioUnitario),
      itemAlmacenId: p.itemAlmacenId ? Number(p.itemAlmacenId) : null,
      activo: p.activo !== false,
      orden,
    });

    const idsQueQuedan = partidas.filter((p) => p.id).map((p) => Number(p.id));

    await prisma.$transaction([
      prisma.partidaPresupuesto.deleteMany({ where: { id: { notIn: idsQueQuedan } } }),
      ...partidas.map((p, orden) =>
        p.id
          ? prisma.partidaPresupuesto.update({ where: { id: Number(p.id) }, data: datos(p, orden) })
          : prisma.partidaPresupuesto.create({ data: datos(p, orden) })
      ),
    ]);

    res.json(await listarCatalogo({ soloActivas: false }));
  } catch (error) {
    if (error.code === "P2025") return res.status(404).json({ message: "Una de las partidas ya no existe, recarga el catálogo" });
    console.error("❌ Error al guardar partidas de presupuesto:", error);
    res.status(500).json({ message: "Error al guardar el catálogo de partidas" });
  }
};

const PROYECTO_CABECERA_INCLUDE = {
  cliente: { select: { id: true, nombreComercial: true } },
  cotizacion: { select: { id: true, numero: true } },
  jefeResponsable: { select: { id: true, nombre: true } },
};

// Devuelve el presupuesto guardado o, si todavía no hay, un borrador armado
// desde el catálogo (sin persistir) con las cantidades en 0.
exports.obtenerPresupuesto = async (req, res) => {
  try {
    const proyectoId = Number(req.params.id);
    const proyecto = await prisma.proyecto.findUnique({ where: { id: proyectoId }, include: PROYECTO_CABECERA_INCLUDE });
    if (!proyecto) return res.status(404).json({ message: "Proyecto no encontrado" });

    const guardado = await prisma.presupuestoProyecto.findUnique({
      where: { proyectoId },
      include: { items: { orderBy: [{ orden: "asc" }, { id: "asc" }] } },
    });
    if (guardado) return res.json({ ...guardado, guardado: true, proyecto });

    const partidas = await listarCatalogo({ soloActivas: true });
    res.json({
      guardado: false,
      proyectoId,
      proyecto,
      fecha: new Date(),
      responsable: proyecto.jefeResponsable?.nombre || req.user?.nombre || null,
      tipoServicio: null,
      numeroCotizacion: proyecto.cotizacion?.numero || null,
      margen: 45,
      precioNegociado: null,
      items: partidas.map((p, orden) => ({
        categoria: p.categoria,
        descripcion: p.nombre,
        unidad: p.unidad,
        cantidad: 0,
        precioUnitario: p.precioEfectivo,
        orden,
      })),
    });
  } catch (error) {
    console.error("❌ Error al obtener presupuesto:", error);
    res.status(500).json({ message: "Error al obtener el presupuesto" });
  }
};

exports.guardarPresupuesto = async (req, res) => {
  try {
    const proyectoId = Number(req.params.id);
    const { fecha, responsable, tipoServicio, numeroCotizacion, margen, precioNegociado, items } = req.body;

    if (!Array.isArray(items)) return res.status(400).json({ message: "Se esperaba la lista de filas del presupuesto" });
    const margenNum = num(margen, 45);
    if (margenNum < 0 || margenNum >= 100) return res.status(400).json({ message: "El margen debe estar entre 0% y 99.99%" });
    for (const it of items) {
      if (!CATEGORIAS.includes(it.categoria)) return res.status(400).json({ message: `Categoría inválida: ${it.categoria}` });
      if (!it.descripcion || !String(it.descripcion).trim()) return res.status(400).json({ message: "Todas las filas necesitan una descripción" });
    }

    const proyecto = await prisma.proyecto.findUnique({ where: { id: proyectoId }, select: { id: true } });
    if (!proyecto) return res.status(404).json({ message: "Proyecto no encontrado" });

    const cabecera = {
      fecha: fecha ? new Date(fecha) : null,
      responsable: responsable || null,
      tipoServicio: tipoServicio || null,
      numeroCotizacion: numeroCotizacion || null,
      margen: margenNum,
      precioNegociado: precioNegociado === null || precioNegociado === "" || precioNegociado === undefined ? null : num(precioNegociado),
    };
    const filas = items.map((it, orden) => ({
      categoria: it.categoria,
      descripcion: String(it.descripcion).trim(),
      unidad: String(it.unidad || "").trim() || "unid.",
      cantidad: num(it.cantidad),
      precioUnitario: num(it.precioUnitario),
      orden,
    }));

    // Las filas se reemplazan enteras en cada guardado: es una hoja, no hay
    // nada que referencie a una fila puntual.
    const presupuesto = await prisma.$transaction(async (tx) => {
      const p = await tx.presupuestoProyecto.upsert({
        where: { proyectoId },
        create: { proyectoId, ...cabecera },
        update: cabecera,
      });
      await tx.presupuestoProyectoItem.deleteMany({ where: { presupuestoId: p.id } });
      await tx.presupuestoProyectoItem.createMany({ data: filas.map((f) => ({ ...f, presupuestoId: p.id })) });
      return tx.presupuestoProyecto.findUnique({
        where: { id: p.id },
        include: { items: { orderBy: [{ orden: "asc" }, { id: "asc" }] } },
      });
    });

    const conProyecto = await prisma.proyecto.findUnique({ where: { id: proyectoId }, include: PROYECTO_CABECERA_INCLUDE });
    res.json({ ...presupuesto, guardado: true, proyecto: conProyecto });
  } catch (error) {
    console.error("❌ Error al guardar presupuesto:", error);
    res.status(500).json({ message: "Error al guardar el presupuesto" });
  }
};
