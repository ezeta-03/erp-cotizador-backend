// Representación impresa (A4) de factura, boleta y nota de crédito electrónicas.
// Sigue el orden de la representación de SUNAT: emisor y recuadro con RUC/número,
// datos del cliente, ítems, totales, importe en letras, detracción, crédito,
// QR y hash.
const numeroALetras = require("../utils/numeroALetras");
const { numeroDocumento } = require("../services/sunat/ubl");

const TITULO = {
  FACTURA: "FACTURA ELECTRÓNICA", BOLETA: "BOLETA DE VENTA ELECTRÓNICA",
  NOTA_CREDITO: "NOTA DE CRÉDITO ELECTRÓNICA", NOTA_DEBITO: "NOTA DE DÉBITO ELECTRÓNICA",
};
const UNIDAD = { NIU: "UNIDAD", ZZ: "SERVICIO", MTK: "M2", MTR: "METRO", KGM: "KG" };
const DOC = { 6: "RUC", 1: "DNI", 0: "DOC." };
const MONEDA = { PEN: "SOLES", USD: "DÓLARES AMERICANOS" };

const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const dinero = (simbolo) => (v) => `${simbolo} ${Number(v || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const soles = dinero("S/");
const n = (v, dec = 2) => Number(v || 0).toLocaleString("es-PE", { minimumFractionDigits: dec, maximumFractionDigits: 6 });
const fecha = (d) => new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(d));
const fechaIso = (iso) => iso.split("-").reverse().join("/");

module.exports = ({ comprobante: c, emisor, qrDataUrl, detraccionDescripcion, retencionPorcentaje }) => {
  const d = emisor.direccion;
  // Montos en la moneda del comprobante; la detracción siempre en soles.
  const S = dinero(c.moneda === "USD" ? "US$" : "S/");
  const fila = (label, valor) => `<tr><td class="lbl">${label}</td><td>: ${valor}</td></tr>`;

  const items = c.items
    .slice()
    .sort((a, b) => a.orden - b.orden)
    .map((it) => `
      <tr>
        <td class="num">${n(it.cantidad)}</td>
        <td>${UNIDAD[it.unidad] || it.unidad}</td>
        <td>${esc(it.descripcion)}</td>
        <td class="num">${n(it.valorUnitario)}</td>
        <td class="num">${n(it.valorVenta)}</td>
      </tr>`).join("");

  const detraccion = c.detraccionMonto ? `
    <div class="caja">
      <div class="caja-tit">Información de la detracción</div>
      <table class="mini">
        ${fila("Leyenda", "Operación sujeta al Sistema de Pago de Obligaciones Tributarias con el Gobierno Central")}
        ${fila("Bien o Servicio", `${esc(c.detraccionCodigo)} ${esc(detraccionDescripcion || "")}`)}
        ${fila("Medio de pago", "001 Depósito en cuenta")}
        ${fila("Nro. Cta. Banco de la Nación", esc(c.detraccionCuenta))}
        ${fila("Porcentaje de detracción", `${n(c.detraccionPorcentaje)}%`)}
        ${fila("Monto detracción", soles(c.detraccionMonto))}
      </table>
    </div>` : "";

  const cuotas = c.formaPago === "CREDITO" && Array.isArray(c.cuotas) ? `
    <div class="caja">
      <div class="caja-tit">Información del crédito</div>
      <table class="mini">
        ${fila("Monto neto pendiente de pago", S(c.cuotas.reduce((a, q) => a + q.monto, 0)))}
        ${fila("Total de cuotas", c.cuotas.length)}
      </table>
      <table class="cuotas">
        <tr><th>N° Cuota</th><th>Fec. Venc.</th><th class="num">Monto</th></tr>
        ${c.cuotas.map((q, i) => `<tr><td>${i + 1}</td><td>${fechaIso(q.fechaVencimiento)}</td><td class="num">${S(q.monto)}</td></tr>`).join("")}
      </table>
    </div>` : "";

  const retencion = c.agenteRetencion ? `
    <div class="caja">
      <div class="caja-tit">Información de la retención</div>
      Operación sujeta a retención del IGV: el cliente, agente de retención, retiene el ${retencionPorcentaje}% del importe total (${S(c.total * retencionPorcentaje / 100)}).
    </div>` : "";

  const referencia = ["NOTA_CREDITO", "NOTA_DEBITO"].includes(c.tipo) && c.referencia ? `
    ${fila("Documento que modifica", `${c.referencia.tipo === "FACTURA" ? "FACTURA" : "BOLETA"} ${numeroDocumento(c.referencia.serie, c.referencia.correlativo)}`)}
    ${fila("Motivo", `${esc(c.motivoCodigo)} - ${esc(c.motivoDescripcion)}`)}` : "";

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  :root { color-scheme: light; }
  html, body { background: #fff; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: #111; margin: 0; padding: 24px 28px; }
  .cab { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
  .emisor h1 { font-size: 13px; margin: 0 0 4px; }
  .emisor div { line-height: 1.4; }
  .recuadro { border: 1.5px solid #111; padding: 10px 18px; text-align: center; min-width: 230px; }
  .recuadro div { font-size: 13px; font-weight: bold; line-height: 1.5; }
  table { border-collapse: collapse; width: 100%; }
  .datos { margin: 14px 0 10px; border-top: 1px solid #111; padding-top: 8px; }
  .datos .lbl, .mini .lbl { width: 175px; white-space: nowrap; vertical-align: top; }
  .datos td, .mini td { padding: 1.5px 0; vertical-align: top; }
  .items th { border-top: 1px solid #111; border-bottom: 1px solid #111; padding: 4px; text-align: left; font-size: 9.5px; }
  .items td { padding: 3px 4px; vertical-align: top; border-bottom: 1px solid #eee; }
  .num { text-align: right; white-space: nowrap; }
  .pie { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-top: 12px; }
  .son { font-weight: bold; margin-top: 6px; }
  .totales { width: 260px; }
  .totales td { padding: 2px 4px; }
  .totales .imp td { font-weight: bold; font-size: 11.5px; border-top: 1px solid #111; }
  .caja { border: 1px solid #111; padding: 6px 8px; margin-top: 10px; }
  .caja-tit { font-weight: bold; margin-bottom: 4px; }
  .cuotas { width: 320px; margin-top: 6px; }
  .cuotas th, .cuotas td { padding: 2px 4px; border-bottom: 1px solid #ddd; text-align: left; }
  .qr { display: flex; gap: 12px; align-items: center; margin-top: 14px; border-top: 1px solid #111; padding-top: 10px; }
  .qr img { width: 92px; height: 92px; }
  .qr .txt { font-size: 9px; line-height: 1.5; color: #333; }
</style></head><body>
  <div class="cab">
    <div class="emisor">
      <h1>${esc(emisor.razonSocial)}</h1>
      <div>${esc(d.linea)}</div>
      <div>${esc([d.distrito, d.provincia, d.departamento].filter(Boolean).join(" - "))}</div>
    </div>
    <div class="recuadro">
      <div>${TITULO[c.tipo]}</div>
      <div>RUC: ${esc(emisor.ruc)}</div>
      <div>${numeroDocumento(c.serie, c.correlativo)}</div>
    </div>
  </div>

  <table class="datos">
    ${fila("Fecha de Emisión", fecha(c.fechaEmision))}
    ${c.tipo === "FACTURA" ? fila("Forma de pago", c.formaPago === "CREDITO" ? "Crédito" : "Contado") : ""}
    ${fila("Señor(es)", esc(c.clienteNombre))}
    ${fila(DOC[c.clienteTipoDoc] || "Documento", esc(c.clienteNumDoc))}
    ${c.clienteDireccion ? fila("Dirección del Cliente", esc(c.clienteDireccion)) : ""}
    ${fila("Tipo de Moneda", MONEDA[c.moneda] || c.moneda)}
    ${c.moneda === "USD" && c.tipoCambio ? fila("Tipo de cambio (venta SUNAT)", n(c.tipoCambio, 3)) : ""}
    ${referencia}
  </table>

  <table class="items">
    <tr><th class="num" style="width:60px">Cantidad</th><th style="width:70px">Unidad Medida</th><th>Descripción</th><th class="num" style="width:80px">Valor Unitario</th><th class="num" style="width:80px">Valor Venta</th></tr>
    ${items}
  </table>

  <div class="pie">
    <div style="flex:1">
      <div class="son">SON: ${esc(numeroALetras(c.total, c.moneda))}</div>
      ${detraccion}
      ${retencion}
      ${cuotas}
    </div>
    <table class="totales">
      <tr><td>Op. Gravadas</td><td class="num">${S(c.valorVenta)}</td></tr>
      <tr><td>IGV (18%)</td><td class="num">${S(c.igv)}</td></tr>
      <tr class="imp"><td>Importe Total</td><td class="num">${S(c.total)}</td></tr>
    </table>
  </div>

  <div class="qr">
    ${qrDataUrl ? `<img src="${qrDataUrl}" alt="QR">` : ""}
    <div class="txt">
      Representación impresa de la ${TITULO[c.tipo].toLowerCase()}.<br>
      ${c.hash ? `Resumen (hash): ${esc(c.hash)}<br>` : ""}
      Consulte su validez en www.sunat.gob.pe
    </div>
  </div>
</body></html>`;
};
