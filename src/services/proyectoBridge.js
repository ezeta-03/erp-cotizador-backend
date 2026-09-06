const { getFirestoreProyectos } = require("../config/firebaseAdmin");
const { Timestamp, FieldValue } = require("firebase-admin/firestore");

const DIAS_PLAZO_DEFAULT = 30;

// Construye el Proyecto de seguimiento-actividades a partir de una cotización recién
// aprobada. gerenteResponsable/jefeResponsable quedan vacíos a propósito: el vendedor
// (dueño de la cotización en erp) no es lo mismo que esos roles, así que se guarda
// aparte como dato de trazabilidad (vendedorNombre/vendedorEmail) hasta que Gerencia
// asigne un jefe/gerente real para el proyecto en seguimiento-actividades.
function construirDatosProyecto({ cotizacion, cliente, vendedor }) {
  const hoy = new Date();
  const fin = new Date(hoy);
  fin.setDate(fin.getDate() + DIAS_PLAZO_DEFAULT);

  const visiblePara = [vendedor.email].filter(Boolean);

  return {
    nombre: `Cotización ${cotizacion.numero} — ${cliente.nombreComercial}`,
    descripcion: `Proyecto generado automáticamente al aprobar la cotización ${cotizacion.numero} (cliente: ${cliente.nombreComercial}, total: S/ ${cotizacion.total.toFixed(2)}).`,
    gerenteResponsable: "",
    jefeResponsable: "",
    colaboradores: [],
    estado: "Planificación",
    prioridad: "Media",
    categoria: "",
    fechaInicio: Timestamp.fromDate(hoy),
    fechaFin: Timestamp.fromDate(fin),
    presupuestoEstimado: cotizacion.total,
    presupuestoEjecutado: 0,
    imprevistos: 0,
    avanceGeneral: 0,
    visiblePara,
    fechaCreacion: FieldValue.serverTimestamp(),
    ultimaActualizacion: FieldValue.serverTimestamp(),
    // Trazabilidad hacia erp — no la usa (todavía) la UI de seguimiento-actividades.
    origenErp: {
      cotizacionId: cotizacion.id,
      cotizacionNumero: cotizacion.numero,
      vendedorNombre: vendedor.nombre,
      vendedorEmail: vendedor.email,
    },
  };
}

// Nunca lanza: la aprobación de la cotización en erp no debe fallar porque
// Firestore esté caído. Devuelve { id } en éxito o { error } en fallo, para que
// el llamador decida qué guardar en Cotizacion.proyectoExterno{Id,Error}.
async function crearProyectoDesdeCotizacion({ cotizacion, cliente, vendedor }) {
  try {
    const db = getFirestoreProyectos();
    const datos = construirDatosProyecto({ cotizacion, cliente, vendedor });
    const ref = await db.collection("proyectos").add(datos);
    return { id: ref.id };
  } catch (error) {
    console.error("❌ Error creando Proyecto en Firestore desde cotización:", error);
    return { error: error.message };
  }
}

module.exports = { crearProyectoDesdeCotizacion };
