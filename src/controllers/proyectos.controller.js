const prisma = require("../config/prisma");

const USUARIO_SELECT = { id: true, nombre: true, email: true };

const PROYECTO_INCLUDE_LISTA = {
  cliente: { select: { id: true, nombreComercial: true } },
  cotizacion: { select: { id: true, numero: true, total: true } },
  gerenteResponsable: { select: USUARIO_SELECT },
  jefeResponsable: { select: USUARIO_SELECT },
};

// "Asignado" = lo que realmente salió del Almacén hacia este proyecto (todas
// las SALIDA vinculadas, vengan de una Orden o de /almacen/salidas directo).
// Se calcula aparte en vez de denormalizar porque cambia cada vez que se
// registra un movimiento y no vale la pena mantenerlo sincronizado a mano.
async function calcularAsignado(proyectoId) {
  const resultado = await prisma.movimientoAlmacen.aggregate({
    where: { proyectoId, tipo: "SALIDA" },
    _sum: { precioTotal: true },
  });
  return resultado._sum.precioTotal || 0;
}

exports.listarProyectos = async (req, res) => {
  try {
    const { estado } = req.query;
    const where = {};
    if (estado) where.estado = estado;

    const proyectos = await prisma.proyecto.findMany({
      where,
      include: PROYECTO_INCLUDE_LISTA,
      orderBy: { createdAt: "desc" },
    });

    const conAsignado = await Promise.all(
      proyectos.map(async (p) => ({ ...p, asignado: await calcularAsignado(p.id) }))
    );

    res.json(conAsignado);
  } catch (error) {
    console.error("❌ Error al listar proyectos:", error);
    res.status(500).json({ message: "Error al listar proyectos" });
  }
};

exports.obtenerProyecto = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const proyecto = await prisma.proyecto.findUnique({
      where: { id },
      include: {
        ...PROYECTO_INCLUDE_LISTA,
        ordenes: {
          include: {
            items: { include: { item: { select: { id: true, codigo: true, nombre: true, unidad: true } } } },
          },
          orderBy: { fecha: "desc" },
        },
        movimientos: {
          include: { item: { select: { id: true, codigo: true, nombre: true, unidad: true } } },
          orderBy: { fecha: "desc" },
        },
      },
    });
    if (!proyecto) return res.status(404).json({ message: "Proyecto no encontrado" });

    res.json({ ...proyecto, asignado: await calcularAsignado(id) });
  } catch (error) {
    console.error("❌ Error al obtener proyecto:", error);
    res.status(500).json({ message: "Error al obtener proyecto" });
  }
};

exports.actualizarProyecto = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { estado, gerenteResponsableId, jefeResponsableId, fechaInicio, fechaFin, descripcion } = req.body;

    const data = {};
    if (estado !== undefined) data.estado = estado;
    if (descripcion !== undefined) data.descripcion = descripcion;
    if (fechaInicio !== undefined) data.fechaInicio = new Date(fechaInicio);
    if (fechaFin !== undefined) data.fechaFin = new Date(fechaFin);
    if (gerenteResponsableId !== undefined) {
      data.gerenteResponsableId = gerenteResponsableId ? Number(gerenteResponsableId) : null;
    }
    if (jefeResponsableId !== undefined) {
      data.jefeResponsableId = jefeResponsableId ? Number(jefeResponsableId) : null;
    }

    const proyecto = await prisma.proyecto.update({
      where: { id },
      data,
      include: PROYECTO_INCLUDE_LISTA,
    });

    res.json({ ...proyecto, asignado: await calcularAsignado(id) });
  } catch (error) {
    if (error.code === "P2025") return res.status(404).json({ message: "Proyecto no encontrado" });
    console.error("❌ Error al actualizar proyecto:", error);
    res.status(500).json({ message: "Error al actualizar proyecto" });
  }
};

// Crea el Proyecto interno al aprobar una cotización — nunca lanza, igual que
// el puente hacia Firestore: la aprobación no debe fallar por esto. Si ya
// existe (reintento de aprobación, por ejemplo), lo deja como está.
const DIAS_PLAZO_DEFAULT = 30;

exports.crearDesdeCotizacion = async ({ cotizacion, cliente, proyectoFirestoreId }) => {
  try {
    const hoy = new Date();
    const fin = new Date(hoy);
    fin.setDate(fin.getDate() + DIAS_PLAZO_DEFAULT);

    return await prisma.proyecto.create({
      data: {
        nombre: `Cotización ${cotizacion.numero} — ${cliente.nombreComercial}`,
        descripcion: `Proyecto generado automáticamente al aprobar la cotización ${cotizacion.numero} (total: S/ ${cotizacion.total.toFixed(2)}).`,
        cotizacionId: cotizacion.id,
        clienteId: cliente.id,
        presupuestoEstimado: cotizacion.total,
        fechaInicio: hoy,
        fechaFin: fin,
        proyectoFirestoreId: proyectoFirestoreId || null,
      },
    });
  } catch (error) {
    // P2002: ya existe un Proyecto para esta cotización (unique en cotizacionId).
    if (error.code !== "P2002") {
      console.error("❌ Error creando Proyecto interno desde cotización:", error);
    }
    return null;
  }
};

// Usado por los controllers de Almacén para enlazar un movimiento/orden al
// Proyecto correcto: si ya viene un proyectoId úsalo, si no, intenta
// resolverlo a partir del proyectoExternoId (id de Firestore) que sí manda
// seguimiento-actividades — así ese flujo queda enlazado sin tener que tocar
// ese repo.
exports.resolverProyectoId = async ({ proyectoId, proyectoExternoId }) => {
  if (proyectoId) return Number(proyectoId);
  if (!proyectoExternoId) return null;
  const proyecto = await prisma.proyecto.findFirst({
    where: { proyectoFirestoreId: proyectoExternoId },
    select: { id: true },
  });
  return proyecto?.id ?? null;
};
