// Orden de compra en PDF (A4) para enviar al proveedor: identidad de Zaazmago,
// datos del proveedor, ítems con precio sin IGV, totales, condición de pago,
// entrega y quién la aprobó en Finanzas.
const fs = require("fs");
const { colores: C, logoPath } = require("../config/marca");

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fechaLarga = (d) => new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "long", year: "numeric" }).format(new Date(d));
const fechaIso = (iso) => (iso ? iso.split("-").reverse().join("/") : "");
const num = (v, dec = 2) => Number(v || 0).toLocaleString("es-PE", { minimumFractionDigits: dec, maximumFractionDigits: Math.max(dec, 4) });
const ESTADO = {
  PENDIENTE: "Pendiente de validación", APROBADA: "Aprobada", RECHAZADA: "Rechazada",
  RECIBIDA_PARCIAL: "Recibida en parte", RECIBIDA: "Recibida",
};

let logoCache;
function logoDataUrl() {
  if (logoCache === undefined) {
    try {
      logoCache = `data:image/png;base64,${fs.readFileSync(logoPath).toString("base64")}`;
    } catch {
      logoCache = null;
    }
  }
  return logoCache;
}

module.exports = function ordenCompraPdf({ oc, emisor }) {
  const sim = oc.moneda === "USD" ? "US$" : "S/";
  const M = (v) => `${sim} ${num(v)}`;
  const p = oc.proveedor;
  const logo = logoDataUrl();
  const fila = (label, valor) => (valor ? `<tr><td class="lbl">${label}</td><td>${valor}</td></tr>` : "");
  const items = oc.items.map((l, i) => `
    <tr class="${i % 2 ? "z" : ""}">
      <td>${i + 1}</td>
      <td><strong>${esc(l.item.nombre)}</strong><div class="cod">${esc(l.item.codigo)}</div></td>
      <td class="n">${num(l.cantidad, 0)} ${esc(l.item.unidad)}</td>
      <td class="n">${M(l.precioUnitario)}</td>
      <td class="n b">${M(l.subtotal)}</td>
    </tr>`).join("");
  const condicion = oc.condicionPago === "CREDITO" ? `Crédito a ${oc.diasCredito} días` : "Contado";

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>${esc(oc.numero)}</title><style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { background: #fff; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 9.5pt; color: ${C.carbon}; margin: 0; }
  .franja { background: ${C.carbon}; color: #fff; padding: 18px 14mm 16px; display: flex; align-items: center; justify-content: space-between; border-bottom: 4px solid ${C.naranja}; }
  .franja img { height: 32px; }
  .franja h1 { font-size: 17pt; margin: 0; text-align: right; }
  .franja .meta { color: #C9CED6; font-size: 8.5pt; text-align: right; margin-top: 3px; }
  .cuerpo { padding: 14px 14mm; }
  .bloques { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
  .bloque { border: 1px solid ${C.borde}; border-radius: 4px; padding: 8px 10px; }
  .bloque h3 { font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.5px; color: ${C.texto3}; margin: 0 0 5px; }
  .bloque .nom { font-size: 10.5pt; font-weight: bold; margin-bottom: 3px; }
  .mini td { padding: 1px 0; vertical-align: top; font-size: 8.5pt; }
  .mini .lbl { color: ${C.texto3}; width: 92px; }
  table { width: 100%; border-collapse: collapse; }
  .items th { background: ${C.naranja}; color: #fff; text-align: left; padding: 5px 6px; font-size: 8.5pt; }
  .items td { padding: 5px 6px; border-bottom: 1px solid ${C.borde}; vertical-align: top; }
  .items tr.z td { background: ${C.fondo}; }
  .cod { color: ${C.texto3}; font-size: 7.5pt; }
  .n { text-align: right; white-space: nowrap; }
  .b { font-weight: bold; }
  .pie { display: flex; justify-content: space-between; gap: 16px; margin-top: 10px; }
  .totales { width: 250px; }
  .totales td { padding: 3px 6px; }
  .totales .tot td { font-weight: bold; font-size: 11pt; border-top: 2px solid ${C.naranja}; }
  .notas { flex: 1; font-size: 8.5pt; color: ${C.texto2}; }
  .firma { margin-top: 36px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
  .firma div { border-top: 1px solid ${C.carbon}; padding-top: 4px; text-align: center; font-size: 8.5pt; }
  .firma span { display: block; color: ${C.texto3}; font-size: 7.5pt; }
  .aviso { margin-top: 18px; font-size: 7.5pt; color: ${C.texto3}; }
</style></head><body>
  <div class="franja">
    ${logo ? `<img src="${logo}" alt="Zaazmago">` : `<strong>Zaazmago</strong>`}
    <div>
      <h1>Orden de compra ${esc(oc.numero)}</h1>
      <div class="meta">${fechaLarga(oc.enviadaAt || oc.createdAt)} · ${esc(ESTADO[oc.estado] || oc.estado)}</div>
    </div>
  </div>
  <div class="cuerpo">
    <div class="bloques">
      <div class="bloque">
        <h3>Comprador</h3>
        <div class="nom">${esc(emisor.razonSocial || "Zaazmago")}</div>
        <table class="mini">
          ${fila("RUC", esc(emisor.ruc))}
          ${fila("Dirección", esc([emisor.direccion?.linea, emisor.direccion?.distrito, emisor.direccion?.provincia].filter(Boolean).join(", ")))}
          ${fila("Emitida por", esc(oc.creadoPor?.nombre))}
        </table>
      </div>
      <div class="bloque">
        <h3>Proveedor</h3>
        <div class="nom">${esc(p.razonSocial)}</div>
        <table class="mini">
          ${fila(p.tipoDocIdentidad === "DNI" ? "DNI" : "RUC", esc(p.ruc))}
          ${fila("Dirección", esc(p.direccion))}
          ${fila("Contacto", esc([p.contacto, p.telefono, p.email].filter(Boolean).join(" · ")))}
        </table>
      </div>
    </div>

    <div class="bloques">
      <div class="bloque">
        <h3>Condiciones</h3>
        <table class="mini">
          ${fila("Pago", condicion)}
          ${fila("Moneda", oc.moneda === "USD" ? "Dólares" : "Soles")}
          ${fila("Entrega", oc.fechaEntrega ? fechaIso(oc.fechaEntrega) : "A coordinar")}
          ${fila("Proyecto", esc(oc.proyecto?.nombre))}
        </table>
      </div>
      <div class="bloque">
        <h3>Pago al proveedor</h3>
        <table class="mini">
          ${fila("Banco", esc(p.banco) || "—")}
          ${fila("N.° de cuenta", esc(p.numeroCuenta) || "—")}
          ${fila("CCI", esc(p.cci) || "—")}
        </table>
      </div>
    </div>

    <table class="items">
      <thead><tr><th style="width:24px">#</th><th>Descripción</th><th class="n">Cantidad</th><th class="n">P. unit. (sin IGV)</th><th class="n">Subtotal</th></tr></thead>
      <tbody>${items}</tbody>
    </table>

    <div class="pie">
      <div class="notas">${oc.notas ? `<strong>Notas:</strong> ${esc(oc.notas)}` : ""}</div>
      <table class="totales">
        <tr><td>Valor de venta</td><td class="n">${M(oc.valorVenta)}</td></tr>
        <tr><td>IGV (18%)</td><td class="n">${M(oc.igv)}</td></tr>
        <tr class="tot"><td>Total</td><td class="n">${M(oc.total)}</td></tr>
      </table>
    </div>

    <div class="firma">
      <div>${esc(oc.creadoPor?.nombre || "")}<span>Solicitado por</span></div>
      <div>${esc(oc.aprobadoPor && oc.estado !== "RECHAZADA" ? oc.aprobadoPor.nombre : "")}<span>Aprobado por Finanzas${oc.aprobadoAt && oc.estado !== "RECHAZADA" ? ` · ${fechaLarga(oc.aprobadoAt)}` : ""}</span></div>
    </div>
    <div class="aviso">Indique el número ${esc(oc.numero)} en su guía de remisión y en su factura.</div>
  </div>
</body></html>`;
};
