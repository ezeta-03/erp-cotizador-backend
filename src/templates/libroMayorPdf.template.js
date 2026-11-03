// HTML del Libro Mayor para imprimir (A4) con la identidad de Zaazmago:
// franja carbón con el logo, métricas del periodo (resultado, márgenes,
// composición del gasto, saldos de Caja y Bancos), resumen por cuenta y el
// detalle de cada cuenta. La numeración de páginas va en el pie (puppeteer).
const fs = require("fs");
const { colores: C, logoPath } = require("../config/marca");

const GRUPO_LABEL = { CAJA_BANCOS: "Caja y Bancos", INGRESOS: "Ingresos", COSTO_VENTA: "Costo de venta", GASTO_OPERATIVO: "Gasto operativo" };
const GRUPO_COLOR = { CAJA_BANCOS: C.info, INGRESOS: C.exito, COSTO_VENTA: C.violeta, GASTO_OPERATIVO: C.advertencia };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fecha = (iso) => iso.split("-").reverse().join("/");
const num = (v) => (v ? Number(v).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "");
const mon = (moneda, v) => `${moneda === "USD" ? "US$" : "S/"} ${Number(v || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (v) => `${(v * 100).toFixed(1)}%`;

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

// Movimiento neto del periodo según la naturaleza de la cuenta.
const netoPeriodo = (c) => (c.naturaleza === "DEUDORA" ? c.debe - c.haber : c.haber - c.debe);

function metricas({ totales, resultadoPeriodo, cuentas, hasta }) {
  const ventas = totales.INGRESOS.periodo;
  const costo = totales.COSTO_VENTA.periodo;
  const gasto = totales.GASTO_OPERATIVO.periodo;
  const margenBruto = ventas ? (ventas - costo) / ventas : null;
  const margenNeto = ventas ? resultadoPeriodo / ventas : null;

  const tarjeta = (etiqueta, valor, color, nota) => `
    <div class="kpi" style="border-top-color:${color}">
      <div class="kpi-l">${etiqueta}</div>
      <div class="kpi-v" style="color:${color === C.naranja ? C.carbon : color}">${valor}</div>
      ${nota ? `<div class="kpi-n">${nota}</div>` : ""}
    </div>`;

  // Composición del gasto del periodo por categoría (las 8 mayores).
  const gastos = cuentas
    .filter((c) => c.grupo === "COSTO_VENTA" || c.grupo === "GASTO_OPERATIVO")
    .map((c) => ({ nombre: c.nombre, grupo: c.grupo, valor: netoPeriodo(c) }))
    .filter((g) => g.valor > 0)
    .sort((a, b) => b.valor - a.valor);
  const maxGasto = gastos[0]?.valor || 1;
  const totalGasto = gastos.reduce((a, g) => a + g.valor, 0) || 1;
  const barras = gastos.slice(0, 8).map((g) => `
    <div class="barra">
      <div class="barra-n">${esc(g.nombre)}</div>
      <div class="barra-t"><div class="barra-f" style="width:${Math.max((g.valor / maxGasto) * 100, 1.5)}%;background:${GRUPO_COLOR[g.grupo]}"></div></div>
      <div class="barra-v">${mon("PEN", g.valor)} <span>${pct(g.valor / totalGasto)}</span></div>
    </div>`).join("");

  // Estructura del resultado: ventas = costo + gasto + resultado (barra apilada).
  const base = Math.max(ventas, costo + gasto, 1);
  const tramo = (v, color, etiqueta) => (v > 0 ? `<div style="width:${(v / base) * 100}%;background:${color}" title="${etiqueta}"></div>` : "");

  const cajas = cuentas.filter((c) => c.grupo === "CAJA_BANCOS");

  return `
    <section class="kpis">
      ${tarjeta("Ventas del periodo", mon("PEN", ventas), C.exito, `Acumulado del año: ${mon("PEN", totales.INGRESOS.saldoFinal)}`)}
      ${tarjeta("Costo de venta", mon("PEN", costo), C.violeta, margenBruto === null ? "" : `Margen bruto ${pct(margenBruto)}`)}
      ${tarjeta("Gasto operativo", mon("PEN", gasto), C.advertencia, ventas ? `${pct(gasto / ventas)} de las ventas` : "")}
      ${tarjeta("Resultado del periodo", mon("PEN", resultadoPeriodo), resultadoPeriodo < 0 ? C.peligro : C.naranja, margenNeto === null ? "" : `Margen neto ${pct(margenNeto)}`)}
    </section>

    <section class="paneles">
      <div class="panel">
        <h3>Composición de las ventas</h3>
        <div class="apilada">${tramo(costo, C.violeta, "Costo de venta")}${tramo(gasto, C.advertencia, "Gasto operativo")}${tramo(Math.max(resultadoPeriodo, 0), C.naranja, "Resultado")}</div>
        <div class="leyenda">
          <span><i style="background:${C.violeta}"></i>Costo de venta ${ventas ? pct(costo / ventas) : ""}</span>
          <span><i style="background:${C.advertencia}"></i>Gasto operativo ${ventas ? pct(gasto / ventas) : ""}</span>
          <span><i style="background:${C.naranja}"></i>${resultadoPeriodo >= 0 ? "Resultado" : "Pérdida"} ${ventas ? pct(Math.abs(resultadoPeriodo) / ventas) : ""}</span>
        </div>
        <h3 style="margin-top:12px">Gasto por categoría</h3>
        ${barras || `<p class="vacio">Sin gastos en el periodo</p>`}
      </div>
      <div class="panel">
        <h3>Caja y Bancos al ${fecha(hasta)}</h3>
        ${cajas.length ? `<table class="mini">
          <tbody>${cajas.map((c) => `
            <tr><td>${esc(c.nombre)}</td><td class="n ${c.saldoFinal < 0 ? "neg" : ""}">${mon(c.moneda, c.saldoFinal)}</td></tr>
            <tr class="det"><td colspan="2">Entró ${mon(c.moneda, c.debe)} · salió ${mon(c.moneda, c.haber)}</td></tr>`).join("")}
          </tbody></table>` : `<p class="vacio">Sin cuentas registradas</p>`}
      </div>
    </section>`;
}

module.exports = function libroMayorPdf({ desde, hasta, cuentas, totales, resultadoPeriodo, empresa, ruc }) {
  const logo = logoDataUrl();
  const resumen = cuentas.map((c, i) => `
    <tr class="${i % 2 ? "z" : ""}">
      <td><span class="grupo" style="color:${GRUPO_COLOR[c.grupo]}">●</span> ${esc(GRUPO_LABEL[c.grupo])}</td><td>${esc(c.nombre)}</td>
      <td class="n">${mon(c.moneda, c.saldoAnterior)}</td><td class="n">${num(c.debe)}</td>
      <td class="n">${num(c.haber)}</td><td class="n b">${mon(c.moneda, c.saldoFinal)}</td>
    </tr>`).join("");

  const detalle = cuentas.map((c) => `
    <section class="cuenta">
      <h2 style="border-left-color:${GRUPO_COLOR[c.grupo]}">${esc(c.nombre)}
        <span>${esc(GRUPO_LABEL[c.grupo])} · ${c.moneda === "USD" ? "Dólares" : "Soles"} · saldo final ${mon(c.moneda, c.saldoFinal)}</span></h2>
      <table>
        <thead><tr><th>Fecha</th><th>Documento</th><th>Concepto</th><th>Cliente / proveedor</th><th class="n">Debe</th><th class="n">Haber</th><th class="n">Saldo</th></tr></thead>
        <tbody>
          <tr class="sub"><td></td><td></td><td>Saldo anterior</td><td></td><td></td><td></td><td class="n">${num(c.saldoAnterior) || "0.00"}</td></tr>
          ${c.movimientos.map((m, i) => `
            <tr class="${i % 2 ? "z" : ""}">
              <td class="nw">${fecha(m.fecha)}</td><td class="nw">${esc(m.documento)}</td><td>${esc(m.concepto)}</td><td>${esc(m.tercero)}</td>
              <td class="n">${num(m.debe)}</td><td class="n">${num(m.haber)}</td><td class="n b">${num(m.saldo) || "0.00"}</td>
            </tr>`).join("") || `<tr><td colspan="7" class="vacio">Sin movimientos en el periodo</td></tr>`}
          <tr class="tot"><td></td><td></td><td>Totales del periodo</td><td></td><td class="n">${num(c.debe)}</td><td class="n">${num(c.haber)}</td><td class="n">${num(c.saldoFinal) || "0.00"}</td></tr>
        </tbody>
      </table>
    </section>`).join("");

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Libro Mayor</title>
<style>
  /* La franja de marca va a sangre en la primera página; las demás llevan margen superior. */
  @page { size: A4; margin: 10mm 0 14mm 0; }
  @page :first { margin-top: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 8.3pt; color: ${C.carbon}; margin: 0; }
  .franja { background: ${C.carbon}; color: #fff; padding: 16px 12mm 14px; display: flex; align-items: center; justify-content: space-between; border-bottom: 4px solid ${C.naranja}; }
  .franja img { height: 30px; }
  .franja .tit { text-align: right; }
  .franja h1 { font-size: 17pt; margin: 0; letter-spacing: 0.3px; }
  .franja .meta { color: #C9CED6; font-size: 8.5pt; margin-top: 3px; }
  .cuerpo { padding: 10px 12mm 0; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 4px 0 10px; }
  .kpi { background: ${C.superficie2}; border-top: 3px solid ${C.naranja}; border-radius: 4px; padding: 7px 9px; }
  .kpi-l { font-size: 6.8pt; font-weight: bold; color: ${C.texto3}; text-transform: uppercase; letter-spacing: 0.4px; }
  .kpi-v { font-size: 12.5pt; font-weight: bold; margin-top: 3px; }
  .kpi-n { font-size: 7pt; color: ${C.texto2}; margin-top: 2px; }
  .paneles { display: grid; grid-template-columns: 1.55fr 1fr; gap: 10px; margin-bottom: 12px; }
  .panel { border: 1px solid ${C.borde}; border-radius: 4px; padding: 8px 10px; }
  .panel h3 { font-size: 8.5pt; margin: 0 0 6px; color: ${C.carbon}; }
  .apilada { display: flex; height: 12px; border-radius: 3px; overflow: hidden; background: ${C.superficie2}; }
  .leyenda { display: flex; gap: 10px; flex-wrap: wrap; font-size: 7pt; color: ${C.texto2}; margin-top: 4px; }
  .leyenda i { display: inline-block; width: 7px; height: 7px; border-radius: 2px; margin-right: 3px; vertical-align: middle; }
  .barra { display: grid; grid-template-columns: 34% 1fr 30%; gap: 6px; align-items: center; margin: 3px 0; font-size: 7.3pt; }
  .barra-n { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .barra-t { background: ${C.superficie2}; height: 8px; border-radius: 2px; }
  .barra-f { height: 8px; border-radius: 2px; }
  .barra-v { text-align: right; white-space: nowrap; }
  .barra-v span { color: ${C.texto3}; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 3px 4px; border-bottom: 1px solid ${C.borde}; text-align: left; vertical-align: top; }
  th { background: ${C.naranja}; color: #fff; font-weight: bold; border-bottom: 2px solid ${C.naranjaTexto}; }
  .mini td { border-bottom: none; padding: 2px 0; }
  .mini tr:not(.det) td { padding-top: 5px; font-weight: bold; }
  .mini .det td { color: ${C.texto3}; font-size: 7pt; border-bottom: 1px solid ${C.borde}; padding-bottom: 4px; }
  .n { text-align: right; white-space: nowrap; }
  .nw { white-space: nowrap; }
  .b { font-weight: bold; }
  .neg { color: ${C.peligro}; }
  tr.z td { background: ${C.fondo}; }
  .sub td { background: ${C.superficie2}; font-style: italic; color: ${C.texto2}; }
  .tot td { background: ${C.naranjaClaro}; font-weight: bold; border-top: 1px solid ${C.naranja}; white-space: nowrap; }
  .vacio { color: ${C.texto3}; text-align: center; font-size: 7.5pt; }
  .seccion { font-size: 10pt; margin: 12px 0 5px; padding-bottom: 3px; border-bottom: 2px solid ${C.naranja}; }
  .resultado { margin-top: 6px; text-align: right; font-size: 9.5pt; font-weight: bold; }
  .resultado span { color: ${resultadoPeriodo < 0 ? C.peligro : C.naranjaTexto}; }
  .cuenta { margin-top: 14px; }
  .cuenta h2 { font-size: 10pt; margin: 0 0 4px; padding-left: 6px; border-left: 4px solid ${C.naranja}; }
  .cuenta h2 span { font-size: 7.5pt; font-weight: normal; color: ${C.texto3}; margin-left: 4px; }
  .grupo { font-size: 9pt; }
  tr { page-break-inside: avoid; }
  thead { display: table-header-group; }
</style></head>
<body>
  <div class="franja">
    ${logo ? `<img src="${logo}" alt="Zaazmago">` : `<strong>Zaazmago</strong>`}
    <div class="tit">
      <h1>Libro Mayor</h1>
      <div class="meta">${esc(empresa || "")}${ruc ? ` · RUC ${esc(ruc)}` : ""}<br>Del ${fecha(desde)} al ${fecha(hasta)}</div>
    </div>
  </div>
  <div class="cuerpo">
    ${metricas({ totales, resultadoPeriodo, cuentas, hasta })}

    <h2 class="seccion">Resumen por cuenta</h2>
    <table>
      <thead><tr><th>Grupo</th><th>Cuenta</th><th class="n">Saldo anterior</th><th class="n">Debe</th><th class="n">Haber</th><th class="n">Saldo final</th></tr></thead>
      <tbody>${resumen || `<tr><td colspan="6" class="vacio">Sin cuentas con movimientos</td></tr>`}</tbody>
    </table>
    <div class="resultado">Resultado del periodo (ventas − costo de venta − gasto operativo): <span>${mon("PEN", resultadoPeriodo)}</span></div>

    <h2 class="seccion">Detalle por cuenta</h2>
    ${detalle}
  </div>
</body></html>`;
};

// Pie de página de puppeteer: marca y numeración.
module.exports.piePagina = `
  <div style="width:100%;font-family:Arial,sans-serif;font-size:7px;color:${C.texto3};padding:0 12mm;display:flex;justify-content:space-between;">
    <span>Zaazmago · Libro Mayor · generado por el ERP</span>
    <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
  </div>`;
