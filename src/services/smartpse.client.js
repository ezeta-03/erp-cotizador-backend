// Cliente HTTP de SmartPSE (https://panel.smartpse.pe).
// Flujo: token JWT (dura 10 min) → /cpe/generar (firma el XML) → /cpe/enviar (SUNAT → CDR).
const { smartpse } = require("../config/emisor");
const { unzipPrimerArchivo } = require("../utils/zip");

const TTL_TOKEN_MS = 9 * 60 * 1000; // 1 min de margen sobre los 10 que da el PSE
let tokenCache = { valor: null, expira: 0 };

class ErrorPSE extends Error {
  constructor(mensaje, { status, respuesta } = {}) {
    super(mensaje);
    this.name = "ErrorPSE";
    this.status = status;
    this.respuesta = respuesta;
  }
}

async function llamar(ruta, { method = "POST", body, token } = {}) {
  let res;
  try {
    res = await fetch(`${smartpse.url}${ruta}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(60000),
    });
  } catch (e) {
    throw new ErrorPSE(`No se pudo conectar con el PSE: ${e.message}`);
  }

  const texto = await res.text();
  let json;
  try { json = JSON.parse(texto); } catch { json = { mensaje: texto }; }

  if (!res.ok) {
    throw new ErrorPSE(json.mensaje || json.message || `PSE respondió HTTP ${res.status}`, { status: res.status, respuesta: json });
  }
  return json;
}

async function obtenerToken({ forzar = false } = {}) {
  if (!forzar && tokenCache.valor && Date.now() < tokenCache.expira) return tokenCache.valor;
  const r = await llamar("/api/auth/cpe/token", {
    body: { usuario: smartpse.usuario, password: smartpse.password },
  });
  if (!r.token_acceso) throw new ErrorPSE(r.mensaje || "El PSE no devolvió token", { respuesta: r });
  tokenCache = { valor: r.token_acceso, expira: Date.now() + TTL_TOKEN_MS };
  return r.token_acceso;
}

// Reintenta una vez con token nuevo si el PSE responde 401 (token vencido/revocado).
async function conToken(ruta, body) {
  try {
    return await llamar(ruta, { body, token: await obtenerToken() });
  } catch (e) {
    if (e.status !== 401) throw e;
    return llamar(ruta, { body, token: await obtenerToken({ forzar: true }) });
  }
}

const sufijo = () => (smartpse.modo === "demo" ? "-demo" : "");

// Devuelve { xmlFirmado (string), hash }
async function firmar(nombreArchivo, xml) {
  const r = await conToken(`/api/cpe/generar${sufijo()}`, {
    tipo_integracion: 0,
    nombre_archivo: nombreArchivo,
    contenido_archivo: Buffer.from(xml, "utf8").toString("base64"),
  });
  if (!r.xml) throw new ErrorPSE(r.mensaje || "El PSE no devolvió el XML firmado", { respuesta: r });

  // El PSE devuelve el XML firmado dentro de un ZIP; si algún día lo manda
  // plano también se acepta.
  const buf = Buffer.from(r.xml, "base64");
  const contenido = buf.subarray(0, 2).toString() === "PK" ? unzipPrimerArchivo(buf).contenido : buf;
  return { xmlFirmado: contenido.toString("utf8"), hash: r.codigo_hash || null };
}

// Devuelve { aceptado, mensaje, codigo, cdrXml, ticket }
async function enviar(nombreArchivo, xmlFirmado) {
  const r = await conToken(`/api/cpe/enviar${sufijo()}`, {
    nombre_xml_firmado: nombreArchivo,
    contenido_xml_firmado: Buffer.from(xmlFirmado, "utf8").toString("base64"),
  });
  const cdrXml = r.cdr ? Buffer.from(r.cdr, "base64").toString("utf8") : null;
  const codigoCdr = cdrXml?.match(/<cbc:ResponseCode[^>]*>([^<]+)</)?.[1];
  const codigoMsg = String(r.mensaje || "").match(/\b(\d{4})\b/)?.[1];
  return {
    aceptado: r.rechazado === false && !!cdrXml,
    rechazado: r.rechazado === true,
    mensaje: r.mensaje || null,
    codigo: codigoCdr ?? codigoMsg ?? null,
    cdrXml,
    ticket: r.ticket || null,
  };
}

module.exports = { firmar, enviar, obtenerToken, ErrorPSE };
