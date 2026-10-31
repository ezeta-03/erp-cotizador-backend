// Datos del emisor (la empresa que factura) y del PSE.
// Todo sale del entorno para no versionar datos tributarios ni credenciales.

const emisor = {
  ruc: process.env.EMISOR_RUC,
  razonSocial: process.env.EMISOR_RAZON_SOCIAL,
  nombreComercial: process.env.EMISOR_NOMBRE_COMERCIAL || process.env.EMISOR_RAZON_SOCIAL,
  direccion: {
    ubigeo: process.env.EMISOR_UBIGEO,                   // ej. 120101 (Huancayo)
    codigoLocal: process.env.EMISOR_CODIGO_LOCAL || "0000", // establecimiento anexo SUNAT
    urbanizacion: process.env.EMISOR_URBANIZACION || "-",
    departamento: process.env.EMISOR_DEPARTAMENTO,
    provincia: process.env.EMISOR_PROVINCIA,
    distrito: process.env.EMISOR_DISTRITO,
    linea: process.env.EMISOR_DIRECCION,
  },
};

// Series por tipo. Las de nota de crédito dependen del comprobante que modifican:
// SUNAT exige que empiecen con F (si modifica factura) o B (si modifica boleta).
const series = {
  FACTURA: process.env.SERIE_FACTURA || "F001",
  BOLETA: process.env.SERIE_BOLETA || "B001",
  NOTA_CREDITO_FACTURA: process.env.SERIE_NC_FACTURA || "FC01",
  NOTA_CREDITO_BOLETA: process.env.SERIE_NC_BOLETA || "BC01",
  NOTA_DEBITO_FACTURA: process.env.SERIE_ND_FACTURA || "FD01",
  NOTA_DEBITO_BOLETA: process.env.SERIE_ND_BOLETA || "BD01",
};

// Retención del IGV que aplica un cliente agente de retención (sobre el total).
const RETENCION_PORCENTAJE = 3;

const smartpse = {
  url: (process.env.SMARTPSE_URL || "https://panel.smartpse.pe").replace(/\/+$/, ""),
  usuario: process.env.SMARTPSE_USUARIO,
  password: process.env.SMARTPSE_PASSWORD,
  // "demo" usa /generar-demo y /enviar-demo (SUNAT beta); "produccion" los reales.
  modo: process.env.SMARTPSE_MODO === "produccion" ? "produccion" : "demo",
};

// Detracción (SPOT). Por defecto 037 "Demás servicios gravados con el IGV" al 12%,
// aplicable a facturas cuyo importe total supere S/ 700. Al emitir se puede
// quitar o elegir otro código de este catálogo (54) con su porcentaje.
const CODIGOS_DETRACCION = [
  { codigo: "037", descripcion: "Demás servicios gravados con el IGV", porcentaje: 12 },
  { codigo: "019", descripcion: "Arrendamiento de bienes", porcentaje: 10 },
  { codigo: "022", descripcion: "Otros servicios empresariales", porcentaje: 12 },
  { codigo: "020", descripcion: "Mantenimiento y reparación de bienes muebles", porcentaje: 12 },
  { codigo: "030", descripcion: "Contratos de construcción", porcentaje: 4 },
];

const detraccion = {
  codigo: process.env.DETRACCION_CODIGO || "037",
  porcentaje: Number(process.env.DETRACCION_PORCENTAJE || 12),
  montoMinimo: Number(process.env.DETRACCION_MONTO_MINIMO || 700),
  medioPago: "001", // catálogo 59: depósito en cuenta
  cuenta: process.env.EMISOR_CTA_DETRACCIONES, // cuenta de detracciones del Banco de la Nación
  codigos: CODIGOS_DETRACCION,
};

// Migo (https://api.migo.pe): consulta de RUC/DNI y validez de comprobantes en SUNAT.
const migo = {
  url: (process.env.MIGO_URL || "https://api.migo.pe/api/v2").replace(/\/+$/, ""),
  token: process.env.MIGO_TOKEN,
};

function validarConfiguracion() {
  const faltan = [];
  if (!emisor.ruc) faltan.push("EMISOR_RUC");
  if (!emisor.razonSocial) faltan.push("EMISOR_RAZON_SOCIAL");
  if (!emisor.direccion.ubigeo) faltan.push("EMISOR_UBIGEO");
  if (!emisor.direccion.linea) faltan.push("EMISOR_DIRECCION");
  if (!smartpse.usuario) faltan.push("SMARTPSE_USUARIO");
  if (!smartpse.password) faltan.push("SMARTPSE_PASSWORD");
  return faltan;
}

module.exports = { emisor, series, smartpse, detraccion, migo, RETENCION_PORCENTAJE, validarConfiguracion };
