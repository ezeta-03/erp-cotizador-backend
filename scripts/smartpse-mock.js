// Simulador local de SmartPSE y de Migo para probar la facturación sin cuentas reales.
// Replica los endpoints y formatos de https://panel.smartpse.pe y algunas
// validaciones de SUNAT (no firma de verdad ni valida contra el XSD), y la
// consulta RUC/DNI/CPE de https://api.migo.pe (la consulta CPE responde según
// lo que este mismo simulador aceptó, como haría SUNAT).
//
//   node scripts/smartpse-mock.js            (puerto 4900)
//   SMARTPSE_URL=http://localhost:4900
//   MIGO_URL=http://localhost:4900/migo/api/v2  MIGO_TOKEN=cualquiera
const express = require("express");
const crypto = require("crypto");
const { zipUnArchivo } = require("../src/utils/zip");

const app = express();
app.use(express.json({ limit: "10mb" }));
const PORT = process.env.MOCK_PORT || 4900;
const recibidos = new Map(); // nombre de archivo → { fecha, total }

const tag = (xml, nombre) => xml.match(new RegExp(`<cbc:${nombre}[^>]*>([^<]*)<`))?.[1];
const num = (s) => Number(s || 0);

function auth(req, res, next) {
  if (!/^Bearer mock-/.test(req.headers.authorization || "")) {
    return res.status(401).json({ estado: 401, mensaje: "Token inválido o expirado" });
  }
  next();
}

app.post("/api/auth/cpe/token", (req, res) => {
  const { usuario, password } = req.body || {};
  if (!usuario || !password || password === "incorrecto") {
    return res.status(401).json({ estado: 401, mensaje: "0102 Usuario o contraseña incorrectos" });
  }
  res.json({ token_acceso: `mock-${crypto.randomUUID()}`, expira_en: 600 });
});

function generar(req, res) {
  const { nombre_archivo, contenido_archivo } = req.body || {};
  if (!/^\d{11}-(01|03|07|08)-[FB][A-Z0-9]{3}-\d{1,8}$/.test(nombre_archivo || "")) {
    return res.status(422).json({ estado: 422, mensaje: "nombre_archivo mal formado" });
  }
  const xml = Buffer.from(contenido_archivo || "", "base64").toString("utf8");
  if (!xml.includes("<ext:ExtensionContent")) {
    return res.status(422).json({ estado: 422, mensaje: "contenido_archivo no es un XML UBL válido" });
  }
  const [ruc, , serie, numero] = nombre_archivo.split("-");
  const rucXml = xml.match(/<cac:AccountingSupplierParty>[\s\S]*?<cbc:ID schemeID="6">(\d+)</)?.[1];
  if (tag(xml, "ID") !== `${serie}-${numero}` || rucXml !== ruc) {
    return res.status(422).json({ estado: 422, mensaje: "El nombre del archivo no coincide con el RUC/serie/número del XML" });
  }

  const digest = crypto.createHash("sha256").update(xml).digest("base64");
  const firma = `<ds:Signature Id="SignatureSP"><ds:SignedInfo><ds:Reference URI=""><ds:DigestValue>${digest}</ds:DigestValue></ds:Reference></ds:SignedInfo><ds:SignatureValue>MOCK</ds:SignatureValue></ds:Signature>`;
  const firmado = xml.replace(/<ext:ExtensionContent\s*\/>|<ext:ExtensionContent>\s*<\/ext:ExtensionContent>/, `<ext:ExtensionContent>${firma}</ext:ExtensionContent>`);

  res.json({
    estado: 200,
    mensaje: "XML firmado correctamente",
    xml: zipUnArchivo(`${nombre_archivo}.xml`, Buffer.from(firmado, "utf8")).toString("base64"),
    codigo_hash: digest,
  });
}

// Algunas reglas reales de SUNAT, con sus códigos de error.
function validarSunat(xml, tipo) {
  const lineas = [...xml.matchAll(/<cac:(?:Invoice|CreditNote|DebitNote)Line>([\s\S]*?)<\/cac:(?:Invoice|CreditNote|DebitNote)Line>/g)].map((m) => m[1]);
  if (lineas.length === 0) return "2023 El comprobante debe tener al menos un ítem";

  const totales = xml.match(/<cac:(?:Legal|Requested)MonetaryTotal>([\s\S]*?)<\/cac:(?:Legal|Requested)MonetaryTotal>/)?.[1] || "";
  const valorVenta = num(tag(totales, "LineExtensionAmount"));
  const total = num(tag(totales, "PayableAmount"));
  const igv = num(xml.match(/<\/cac:AccountingCustomerParty>[\s\S]*?<cac:TaxTotal>\s*<cbc:TaxAmount[^>]*>([^<]+)</)?.[1]);
  const sumaLineas = lineas.reduce((a, l) => a + num(tag(l, "LineExtensionAmount")), 0);

  if (Math.abs(sumaLineas - valorVenta) > 1) return "3280 La sumatoria del valor de venta de los ítems no coincide con el total";
  if (Math.abs(valorVenta + igv - total) > 1) return "3277 El importe total no coincide con la suma de valor de venta más tributos";
  if (Math.abs(valorVenta * 0.18 - igv) > 1) return "3291 El IGV no corresponde a la tasa vigente";

  const tipoDocCliente = xml.match(/<cac:AccountingCustomerParty>[\s\S]*?schemeID="(\w+)"/)?.[1];
  if (tipo === "01") {
    if (tipoDocCliente !== "6") return "2800 El tipo de documento del receptor no está permitido para facturas";
    if (!xml.includes("<cbc:ID>FormaPago</cbc:ID>")) return "3244 Debe consignar la forma de pago";
  }
  const listId = xml.match(/<cbc:InvoiceTypeCode listID="(\d+)"/)?.[1];
  if (listId === "1001") {
    if (!xml.includes("<cbc:ID>Detraccion</cbc:ID>") || !xml.includes("<cac:PayeeFinancialAccount>")) {
      return "3127 Operación sujeta a detracción: debe consignar cuenta, bien/servicio y monto de detracción";
    }
    if (total <= 700) return "3128 Operación sujeta a detracción con importe menor o igual a S/ 700";
    if (!xml.includes('languageLocaleID="2006"')) return "3129 Debe consignar la leyenda 2006 de detracción";
  }
  if (xml.includes("<cbc:PaymentMeansID>Credito</cbc:PaymentMeansID>")) {
    const bloques = [...xml.matchAll(/<cac:PaymentTerms>([\s\S]*?)<\/cac:PaymentTerms>/g)].map((m) => m[1]);
    const neto = num(tag(bloques.find((b) => b.includes(">Credito<")) || "", "Amount"));
    const cuotas = bloques.filter((b) => /<cbc:PaymentMeansID>Cuota\d{3}</.test(b));
    if (cuotas.length === 0) return "3249 Factura a crédito sin cuotas";
    const suma = cuotas.reduce((a, b) => a + num(tag(b, "Amount")), 0);
    if (Math.abs(suma - neto) > 0.01) return "3265 La suma de las cuotas no coincide con el monto neto pendiente de pago";
    const emision = tag(xml, "IssueDate");
    if (cuotas.some((b) => tag(b, "PaymentDueDate") <= emision)) return "3267 La fecha de vencimiento de la cuota debe ser posterior a la de emisión";
  }
  if (tipo === "07" || tipo === "08") {
    const ref = xml.match(/<cac:InvoiceDocumentReference>\s*<cbc:ID>([^<]+)</)?.[1];
    if (!ref) return "2524 La nota de crédito debe referenciar un comprobante";
    if (ref[0] !== tag(xml, "ID")[0]) return "2116 La serie de la nota no corresponde al tipo de comprobante que modifica";
  }
  return null;
}

function enviar(req, res) {
  const { nombre_xml_firmado, contenido_xml_firmado } = req.body || {};
  const xml = Buffer.from(contenido_xml_firmado || "", "base64").toString("utf8");
  if (!xml.includes("<ds:Signature")) {
    return res.status(422).json({ estado: 422, mensaje: "El XML no está firmado" });
  }
  if (recibidos.has(nombre_xml_firmado)) {
    return res.json({ estado: 200, mensaje: "1033 El comprobante fue registrado previamente con otros datos", cdr: null, rechazado: true, ticket: null });
  }

  const [, tipo, serie, numero] = nombre_xml_firmado.split("-");
  const error = validarSunat(xml, tipo);
  const codigo = error ? error.slice(0, 4) : "0";
  const descripcion = error
    ? `El comprobante ${serie}-${numero} ha sido rechazado: ${error}`
    : `La ${{ "07": "Nota de Credito", "08": "Nota de Debito", "03": "Boleta" }[tipo] || "Factura"} numero ${serie}-${numero}, ha sido aceptada`;
  if (!error) {
    const total = num(tag(xml.match(/<cac:(?:Legal|Requested)MonetaryTotal>([\s\S]*?)<\/cac:(?:Legal|Requested)MonetaryTotal>/)?.[1] || "", "PayableAmount"));
    recibidos.set(nombre_xml_firmado, { fecha: tag(xml, "IssueDate"), total });
  }

  const ahora = new Date().toISOString();
  const cdr = `<?xml version="1.0" encoding="UTF-8"?>
<ar:ApplicationResponse xmlns:ar="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:UBLVersionID>2.0</cbc:UBLVersionID>
  <cbc:ID>${Date.now()}</cbc:ID>
  <cbc:IssueDate>${ahora.slice(0, 10)}</cbc:IssueDate>
  <cbc:ResponseDate>${ahora.slice(0, 10)}</cbc:ResponseDate>
  <cbc:Note>SIMULADOR LOCAL - NO VALIDO ANTE SUNAT</cbc:Note>
  <cac:DocumentResponse>
    <cac:Response>
      <cbc:ReferenceID>${serie}-${numero}</cbc:ReferenceID>
      <cbc:ResponseCode>${codigo}</cbc:ResponseCode>
      <cbc:Description>${descripcion}</cbc:Description>
    </cac:Response>
    <cac:DocumentReference><cbc:ID>${serie}-${numero}</cbc:ID></cac:DocumentReference>
  </cac:DocumentResponse>
</ar:ApplicationResponse>
`;
  console.log(`[smartpse-mock] ${nombre_xml_firmado} → ${error ? "RECHAZADO " + codigo : "ACEPTADO"}`);
  res.json({
    estado: 200,
    mensaje: error ? `Rechazado por SUNAT: ${error}` : "Aceptado por SUNAT",
    cdr: Buffer.from(cdr, "utf8").toString("base64"),
    rechazado: !!error,
    ticket: null,
  });
}

app.post(["/api/cpe/generar", "/api/cpe/generar-demo"], auth, generar);
app.post(["/api/cpe/enviar", "/api/cpe/enviar-demo"], auth, enviar);

// ── Migo (api.migo.pe/api/v2) ──────────────────────────────────────────────
const RUCS = {
  "20140344801": {
    nombre_o_razon_social: "CORPORACION APEC SOCIEDAD ANONIMA CERRADA", estado_del_contribuyente: "ACTIVO",
    condicion_de_domicilio: "HABIDO", ubigeo: "120101", departamento: "JUNIN", provincia: "HUANCAYO", distrito: "HUANCAYO",
    direccion: "CAL. REAL 125 BAJADA PUENTE CENTENARIO UNIV CONTINENTA JUNIN HUANCAYO HUANCAYO",
  },
  "20999999991": {
    nombre_o_razon_social: "EMPRESA NO HABIDA S.A.C.", estado_del_contribuyente: "SUSPENSION TEMPORAL",
    condicion_de_domicilio: "NO HABIDO", ubigeo: "150101", departamento: "LIMA", provincia: "LIMA", distrito: "LIMA",
    direccion: "AV. DESCONOCIDA 000 LIMA LIMA LIMA",
  },
};

function migoAuth(req, res, next) {
  if (!/^Bearer \S+/.test(req.headers.authorization || "")) {
    return res.status(403).json({ success: false, message: "Unauthorized" });
  }
  next();
}

app.get("/migo/api/v2/ruc/:ruc", migoAuth, (req, res) => {
  const { ruc } = req.params;
  if (!/^\d{11}$/.test(ruc)) return res.status(422).json({ success: false, message: "El ruc debe tener 11 dígitos", errors: {} });
  // RUC desconocido terminado en 0: no existe (para probar el caso "no encontrado").
  const datos = RUCS[ruc] || (ruc.endsWith("0") ? null : {
    nombre_o_razon_social: `EMPRESA DE PRUEBA ${ruc.slice(-4)} S.A.C.`, estado_del_contribuyente: "ACTIVO",
    condicion_de_domicilio: "HABIDO", ubigeo: "120101", departamento: "JUNIN", provincia: "HUANCAYO", distrito: "EL TAMBO",
    direccion: `AV. PRUEBA ${ruc.slice(-3)} JUNIN HUANCAYO EL TAMBO`,
  });
  if (!datos) return res.status(404).json({ success: false, message: "No se encontraron resultados" });
  res.json({ success: true, ruc, ...datos, actualizado_en: new Date().toISOString().slice(0, 10) });
});

app.get("/migo/api/v2/dni/:dni", migoAuth, (req, res) => {
  const { dni } = req.params;
  if (!/^\d{8}$/.test(dni)) return res.status(422).json({ success: false, message: "El dni debe tener 8 dígitos", errors: {} });
  res.json({ success: true, dni, nombre: `PERSONA DE PRUEBA ${dni.slice(-4)}` });
});

app.get("/migo/api/v2/cpe", migoAuth, (req, res) => {
  const { ruc_emisor, tipo_comprobante, serie, numero, fecha_emision } = req.query;
  if (!ruc_emisor || !tipo_comprobante || !serie || !numero || !fecha_emision) {
    return res.status(422).json({ success: false, message: "Faltan parámetros", errors: {} });
  }
  const nombre = `${ruc_emisor}-${tipo_comprobante}-${serie}-${String(numero).padStart(8, "0")}`;
  const doc = recibidos.get(nombre);
  const [d, m, a] = String(fecha_emision).split("-");
  const coincide = doc && doc.fecha === `${a}-${m}-${d}`;
  res.json({
    success: true,
    estado_comprobante: coincide ? "1" : "0",
    estado_contribuyente: "00",
    condicion_domicilio: "00",
    observaciones: coincide ? [] : ["El comprobante no ha sido informado a SUNAT"],
  });
});

app.listen(PORT, () => console.log(`[smartpse-mock] escuchando en http://localhost:${PORT}`));
