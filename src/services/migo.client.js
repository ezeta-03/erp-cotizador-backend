// Cliente de Migo (https://docs.migo.pe/v2): datos de RUC/DNI y validez de
// comprobantes en SUNAT. Autenticación con token Bearer que no expira.
const { migo } = require("../config/emisor");

class ErrorMigo extends Error {
  constructor(mensaje, status) {
    super(mensaje);
    this.name = "ErrorMigo";
    this.status = status;
  }
}

async function llamar(ruta) {
  if (!migo.token) throw new ErrorMigo("Consulta de RUC/DNI sin configurar: falta MIGO_TOKEN", 503);

  let res;
  try {
    res = await fetch(`${migo.url}${ruta}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${migo.token}` },
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    throw new ErrorMigo(`No se pudo conectar con Migo: ${e.message}`, 502);
  }

  const json = await res.json().catch(() => ({}));
  if (res.status === 404) throw new ErrorMigo(json.message || "No se encontraron datos", 404);
  if (res.status === 401 || res.status === 403) throw new ErrorMigo("Token de Migo inválido o sin créditos", 502);
  if (!res.ok || json.success === false) {
    // 422 trae el detalle por campo en "errors": se incluye para saber qué corregir.
    const detalle = Object.values(json.errors || {}).flat().join(" ");
    const mensaje = [json.message || `Migo respondió HTTP ${res.status}`, detalle].filter(Boolean).join(" ");
    throw new ErrorMigo(mensaje, res.status === 422 ? 400 : 502);
  }
  return json;
}

// Datos del contribuyente listos para el comprobante. "advertencia" avisa si
// SUNAT no lo tiene ACTIVO/HABIDO (facturar a un no habido es riesgoso para el IGV).
async function consultarRuc(ruc) {
  const r = await llamar(`/ruc/${encodeURIComponent(ruc)}`);
  const estado = r.estado_del_contribuyente || null;
  const condicion = r.condicion_de_domicilio || null;
  const advertencias = [];
  if (estado && estado !== "ACTIVO") advertencias.push(`Contribuyente ${estado}`);
  if (condicion && condicion !== "HABIDO") advertencias.push(`Domicilio ${condicion}`);
  return {
    tipoDoc: "6",
    numDoc: r.ruc,
    nombre: r.nombre_o_razon_social,
    direccion: r.direccion || r.direccion_simple || null,
    ubigeo: r.ubigeo || null,
    estado,
    condicion,
    advertencia: advertencias.join(" · ") || null,
  };
}

async function consultarDni(dni) {
  const r = await llamar(`/dni/${encodeURIComponent(dni)}`);
  return { tipoDoc: "1", numDoc: r.dni, nombre: r.nombre, direccion: null, advertencia: null };
}

// ¿El RUC es agente de retención del IGV? null si no se pudo consultar (no bloquea la emisión).
async function consultarAgenteRetencion(ruc) {
  try {
    const r = await llamar(`/ruc/${encodeURIComponent(ruc)}/agente-retencion`);
    return { esAgente: true, desde: r.a_partir_del || null, resolucion: r.resolucion || null };
  } catch (e) {
    if (e.status === 404) return { esAgente: false };
    console.error("⚠️ No se pudo consultar agente de retención:", e.message);
    return null;
  }
}

// Tipo de cambio venta SUNAT (USD) de una fecha aaaa-mm-dd. SUNAT no publica
// algunos días (feriados/fines de semana): entonces se usa el último publicado.
async function tipoCambioVenta(fecha) {
  let r;
  try {
    r = await llamar(`/tipo-cambio/sunat?${new URLSearchParams({ fecha })}`);
  } catch (e) {
    if (e.status !== 404) throw e;
    r = await llamar("/tipo-cambio/sunat/ultimo");
  }
  const venta = Number(r.precio_venta);
  if (!(venta > 0)) throw new ErrorMigo("Migo no devolvió el tipo de cambio de venta", 502);
  return { fecha: r.fecha, venta };
}

// Códigos de la consulta integrada de SUNAT (Migo devuelve el código).
const ESTADO_CPE = { 0: "NO EXISTE", 1: "ACEPTADO", 2: "ANULADO", 3: "AUTORIZADO", 4: "NO AUTORIZADO" };
const ESTADO_CONTRIBUYENTE = {
  "00": "ACTIVO", "01": "BAJA PROVISIONAL", "02": "BAJA PROV. POR OFICIO", "03": "SUSPENSION TEMPORAL",
  10: "BAJA DEFINITIVA", 11: "BAJA DE OFICIO", 22: "INHABILITADO-VENT.UNICA",
};
const CONDICION_DOMICILIO = { "00": "HABIDO", "09": "PENDIENTE", 11: "POR VERIFICAR", 12: "NO HABIDO", 20: "NO HALLADO" };
const traducir = (tabla, v) => tabla[v] ?? tabla[Number(v)] ?? v ?? null;

// fechaEmision en formato dd-mm-aaaa (la v2 de Migo exige guiones, no barras).
async function validarComprobante({ rucEmisor, tipoComprobante, serie, numero, fechaEmision, monto }) {
  const q = new URLSearchParams({
    ruc_emisor: rucEmisor,
    tipo_comprobante: tipoComprobante,
    serie,
    numero: String(numero),
    fecha_emision: fechaEmision,
    ...(monto !== undefined && { monto: Number(monto).toFixed(2) }),
  });
  const r = await llamar(`/cpe?${q}`);
  const obs = r.observaciones;
  return {
    estadoComprobante: traducir(ESTADO_CPE, r.estado_comprobante),
    estadoContribuyente: traducir(ESTADO_CONTRIBUYENTE, r.estado_contribuyente),
    condicionDomicilio: traducir(CONDICION_DOMICILIO, r.condicion_domicilio),
    observaciones: Array.isArray(obs) ? obs : obs ? [obs] : [],
  };
}

module.exports = { consultarRuc, consultarDni, consultarAgenteRetencion, tipoCambioVenta, validarComprobante, ErrorMigo };
