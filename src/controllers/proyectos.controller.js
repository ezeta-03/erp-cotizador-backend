const prisma = require("../config/prisma");
const { getFirestoreProyectos } = require("../config/firebaseAdmin");

const USUARIO_SELECT = { id: true, nombre: true, email: true };

const ESTADO_FIRESTORE_A_ENUM = {
  "Planificación": "PLANIFICACION",
  "En Curso": "EN_CURSO",
  "Pausado": "PAUSADO",
  "Completado": "COMPLETADO",
  "Cancelado": "CANCELADO",
};
const mapearEstadoFirestore = (estado) => ESTADO_FIRESTORE_A_ENUM[estado] || "PLANIFICACION";
const timestampADate = (ts) => ts?.toDate?.() ?? null;

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

// Proyectos de seguimiento-actividades tal cual viven en Firestore, anotados
// con si ya tienen (o no) un Proyecto interno equivalente en el ERP. Es
// deliberadamente de solo lectura: no se editan responsables ni estado desde
// acá, eso se sigue haciendo en seguimiento-actividades.
exports.listarProyectosExternos = async (req, res) => {
  try {
    const snap = await getFirestoreProyectos().collection("proyectos").get();

    const internos = await prisma.proyecto.findMany({
      where: { proyectoFirestoreId: { not: null } },
      select: { id: true, proyectoFirestoreId: true },
    });
    const internoPorFirestoreId = new Map(internos.map((p) => [p.proyectoFirestoreId, p.id]));

    const proyectos = await Promise.all(
      snap.docs.map(async (doc) => {
        const datos = doc.data();
        const proyectoInternoId = internoPorFirestoreId.get(doc.id) ?? null;
        return {
          id: doc.id,
          nombre: datos.nombre || "(sin nombre)",
          descripcion: datos.descripcion || null,
          estado: datos.estado || null,
          gerenteResponsable: datos.gerenteResponsable || null,
          jefeResponsable: datos.jefeResponsable || null,
          presupuestoEstimado: Number(datos.presupuestoEstimado) || 0,
          presupuestoEjecutado: Number(datos.presupuestoEjecutado) || 0,
          fechaInicio: timestampADate(datos.fechaInicio),
          fechaFin: timestampADate(datos.fechaFin),
          fechaCreacionMs: timestampADate(datos.fechaCreacion)?.getTime() || 0,
          origenErp: datos.origenErp || null,
          proyectoInternoId,
          asignado: proyectoInternoId ? await calcularAsignado(proyectoInternoId) : 0,
        };
      })
    );

    proyectos.sort((a, b) => b.fechaCreacionMs - a.fechaCreacionMs);
    res.json(proyectos);
  } catch (error) {
    console.error("❌ Error al listar proyectos de seguimiento-actividades:", error);
    res.status(500).json({ message: "No se pudo conectar con seguimiento-actividades" });
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

// Crear un Proyecto a mano, sin pasar por una cotización — un Proyecto puede
// existir en cualquier momento, en paralelo a las cotizaciones, no solo como
// consecuencia de aprobar una.
exports.crearProyecto = async (req, res) => {
  try {
    const { nombre, descripcion, clienteId, presupuestoEstimado, fechaInicio, fechaFin } = req.body;

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ message: "El nombre del proyecto es obligatorio" });
    }

    const hoy = new Date();
    const finDefault = new Date(hoy);
    finDefault.setDate(finDefault.getDate() + 30);

    const proyecto = await prisma.proyecto.create({
      data: {
        nombre: nombre.trim(),
        descripcion: descripcion || null,
        clienteId: clienteId ? Number(clienteId) : null,
        presupuestoEstimado: presupuestoEstimado !== undefined ? Number(presupuestoEstimado) : 0,
        fechaInicio: fechaInicio ? new Date(fechaInicio) : hoy,
        fechaFin: fechaFin ? new Date(fechaFin) : finDefault,
      },
      include: PROYECTO_INCLUDE_LISTA,
    });

    res.status(201).json({ ...proyecto, asignado: 0 });
  } catch (error) {
    console.error("❌ Error al crear proyecto:", error);
    res.status(500).json({ message: "Error al crear proyecto" });
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

// Si el proyecto de Firestore todavía no tiene Proyecto interno (porque no
// nació de una cotización), se crea un "stub" en cuanto pide algo al
// Almacén — así su consumo también queda registrado y comparable. Nunca
// lanza: si Firestore no responde o el id no existe, el movimiento de
// Almacén sigue sin proyectoId en vez de bloquearse.
async function crearStubDesdeFirestore(proyectoFirestoreId) {
  try {
    const snap = await getFirestoreProyectos().collection("proyectos").doc(proyectoFirestoreId).get();
    if (!snap.exists) return null;
    const datos = snap.data();

    const hoy = new Date();
    const fin = new Date(hoy);
    fin.setDate(fin.getDate() + DIAS_PLAZO_DEFAULT);

    const nuevo = await prisma.proyecto.create({
      data: {
        nombre: datos.nombre || `Proyecto de seguimiento-actividades (${proyectoFirestoreId})`,
        descripcion: "Proyecto de seguimiento-actividades sin cotización asociada en el ERP.",
        estado: mapearEstadoFirestore(datos.estado),
        presupuestoEstimado: Number(datos.presupuestoEstimado) || 0,
        fechaInicio: timestampADate(datos.fechaInicio) || hoy,
        fechaFin: timestampADate(datos.fechaFin) || fin,
        proyectoFirestoreId,
      },
    });
    return nuevo.id;
  } catch (error) {
    if (error.code === "P2002") {
      // Carrera: otro movimiento concurrente ya creó el stub — usamos ese.
      const existente = await prisma.proyecto.findFirst({ where: { proyectoFirestoreId }, select: { id: true } });
      return existente?.id ?? null;
    }
    console.error("❌ Error creando Proyecto stub desde Firestore:", error.message);
    return null;
  }
}

// Usado por los controllers de Almacén para enlazar un movimiento/orden al
// Proyecto correcto: si ya viene un proyectoId úsalo; si no, intenta
// resolverlo a partir del proyectoExternoId (id de Firestore) que sí manda
// seguimiento-actividades, creando el stub de arriba si hace falta — así ese
// flujo queda enlazado sin tener que tocar ese repo.
exports.resolverProyectoId = async ({ proyectoId, proyectoExternoId }) => {
  if (proyectoId) return Number(proyectoId);
  if (!proyectoExternoId) return null;
  const proyecto = await prisma.proyecto.findFirst({
    where: { proyectoFirestoreId: proyectoExternoId },
    select: { id: true },
  });
  if (proyecto) return proyecto.id;
  return crearStubDesdeFirestore(proyectoExternoId);
};
