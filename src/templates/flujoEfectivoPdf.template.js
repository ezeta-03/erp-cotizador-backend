// HTML del Estado de Flujo de Efectivo para imprimir (A4 horizontal) con la
// identidad de Zaazmago: franja carbón con el logo, indicadores del periodo,
// tabla por mes (entradas, salidas, neto y acumulado) y salidas por línea de negocio.
const fs = require("fs");
const { colores: C, logoPath } = require("../config/marca");

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fecha = (iso) => iso.split("-").reverse().join("/");
const num = (v) => (v ? Number(v).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "");
const mon = (v) => `S/ ${Number(v || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

function bloque(meses, titulo, color, datos, conDetalle = true) {
  const celdas = (x) => meses.map((m) => `<td class="n">${num(x.meses[m.clave])}</td>`).join("");
  const filas = datos.filas.map((f, i) => `
    <tr class="${i % 2 ? "z" : ""}"><td class="b">${esc(f.nombre)}</td>${celdas(f)}<td class="n b">${num(f.total)}</td><td class="n">${f.porcentaje.toFixed(1)}%</td></tr>
    ${conDetalle ? f.detalle.map((d) => `
      <tr class="det"><td>${esc(d.nombre)}</td>${celdas(d)}<td class="n">${num(d.total)}</td><td class="n">${f.total ? ((d.total / f.total) * 100).toFixed(1) : "0.0"}%</td></tr>`).join("") : ""}`).join("");
  return `
    <tr class="tit"><td colspan="${meses.length + 3}" style="color:${color}">${titulo}</td></tr>
    ${filas || `<tr><td colspan="${meses.length + 3}" class="vacio">Sin movimientos en el periodo</td></tr>`}
    <tr class="tot"><td>Total ${titulo.toLowerCase()}</td>${meses.map((m) => `<td class="n">${num(datos.totales.meses[m.clave]) || "0.00"}</td>`).join("")}<td class="n">${num(datos.totales.total) || "0.00"}</td><td class="n">${datos.totales.total ? "100%" : ""}</td></tr>`;
}

module.exports = function flujoEfectivoPdf(m) {
  const { desde, hasta, meses, entradas, salidas, salidasPorLinea, neto, acumulado, retencionesExcluidas, empresa, ruc } = m;
  const logo = logoDataUrl();
  const cab = `<thead><tr><th>Concepto</th>${meses.map((x) => `<th class="n">${x.etiqueta}</th>`).join("")}<th class="n">Total</th><th class="n">%</th></tr></thead>`;
  const kpi = (etiqueta, valor, color) => `
    <div class="kpi" style="border-top-color:${color}"><div class="kpi-l">${etiqueta}</div><div class="kpi-v" style="color:${color}">${mon(valor)}</div></div>`;

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Flujo de Efectivo</title>
<style>
  @page { size: A4 landscape; margin: 10mm 0 12mm 0; }
  @page :first { margin-top: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { background: #fff; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 7.6pt; color: ${C.carbon}; margin: 0; }
  .franja { background: ${C.carbon}; color: #fff; padding: 14px 10mm 12px; display: flex; align-items: center; justify-content: space-between; border-bottom: 4px solid ${C.naranja}; }
  .franja img { height: 28px; }
  .franja .tit { text-align: right; }
  .franja h1 { font-size: 16pt; margin: 0; }
  .franja .meta { color: #C9CED6; font-size: 8pt; margin-top: 3px; }
  .cuerpo { padding: 10px 10mm 0; }
  .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 2px 0 10px; }
  .kpi { background: ${C.superficie2}; border-top: 3px solid ${C.naranja}; border-radius: 4px; padding: 6px 9px; }
  .kpi-l { font-size: 6.8pt; font-weight: bold; color: ${C.texto3}; text-transform: uppercase; letter-spacing: 0.4px; }
  .kpi-v { font-size: 12pt; font-weight: bold; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 2.5px 4px; border-bottom: 1px solid ${C.borde}; text-align: left; vertical-align: top; }
  th { background: ${C.naranja}; color: #fff; font-weight: bold; border-bottom: 2px solid ${C.naranjaTexto}; white-space: nowrap; }
  .n { text-align: right; white-space: nowrap; }
  .b { font-weight: bold; }
  tr.z td { background: ${C.fondo}; }
  .det td { color: ${C.texto2}; font-size: 6.9pt; }
  .det td:first-child { padding-left: 14px; }
  .tit td { font-weight: bold; font-size: 8.5pt; text-transform: uppercase; padding-top: 8px; border-bottom: none; }
  .tot td { background: ${C.naranjaClaro}; font-weight: bold; border-top: 1px solid ${C.naranja}; white-space: nowrap; }
  .neto td { background: ${C.carbon}; color: #fff; font-weight: bold; font-size: 8.2pt; }
  .neg { color: ${C.peligro}; }
  .acum td { font-style: italic; color: ${C.texto2}; }
  .vacio { color: ${C.texto3}; text-align: center; }
  .seccion { font-size: 10pt; margin: 14px 0 5px; padding-bottom: 3px; border-bottom: 2px solid ${C.naranja}; }
  .nota { font-size: 7pt; color: ${C.texto3}; margin-top: 5px; }
  tr { page-break-inside: avoid; }
  thead { display: table-header-group; }
</style></head>
<body>
  <div class="franja">
    ${logo ? `<img src="${logo}" alt="Zaazmago">` : `<strong>Zaazmago</strong>`}
    <div class="tit">
      <h1>Estado de Flujo de Efectivo</h1>
      <div class="meta">${esc(empresa || "")}${ruc ? ` · RUC ${esc(ruc)}` : ""}<br>Del ${fecha(desde)} al ${fecha(hasta)} · en soles</div>
    </div>
  </div>
  <div class="cuerpo">
    <section class="kpis">
      ${kpi("Entradas", entradas.totales.total, C.exito)}
      ${kpi("Salidas", salidas.totales.total, C.peligro)}
      ${kpi("Flujo neto", neto.total, neto.total < 0 ? C.peligro : C.naranjaTexto)}
    </section>
    <table>
      ${cab}
      <tbody>
        ${bloque(meses, "Entradas", C.exito, entradas)}
        ${bloque(meses, "Salidas", C.peligro, salidas)}
        <tr class="neto"><td>Flujo neto del periodo</td>${meses.map((x) => `<td class="n">${num(neto.meses[x.clave]) || "0.00"}</td>`).join("")}<td class="n">${num(neto.total) || "0.00"}</td><td></td></tr>
        <tr class="acum"><td>Flujo acumulado</td>${meses.map((x) => `<td class="n ${acumulado[x.clave] < 0 ? "neg" : ""}">${num(acumulado[x.clave]) || "0.00"}</td>`).join("")}<td></td><td></td></tr>
      </tbody>
    </table>
    <div class="nota">Solo dinero que entró o salió, por la fecha del cobro o pago; montos en dólares convertidos a soles.${retencionesExcluidas ? ` No incluye retenciones de clientes (${mon(retencionesExcluidas)}): no son dinero que entra.` : ""}</div>

    <h2 class="seccion">Salidas por línea de negocio</h2>
    <table>
      ${cab}
      <tbody>${bloque(meses, "Salidas", C.peligro, salidasPorLinea, false)}</tbody>
    </table>
    <div class="nota">Lo pagado a cada proveedor repartido según sus % por línea de negocio; sin reparto (o cuotas de paneles) va a "Sin línea de negocio".</div>
  </div>
</body></html>`;
};

module.exports.piePagina = `
  <div style="width:100%;font-family:Arial,sans-serif;font-size:7px;color:${C.texto3};padding:0 10mm;display:flex;justify-content:space-between;">
    <span>Zaazmago · Estado de Flujo de Efectivo · generado por el ERP</span>
    <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
  </div>`;
