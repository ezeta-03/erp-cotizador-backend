// HTML del Libro Mayor para imprimir (A4): resumen por cuenta y el detalle de
// cada cuenta con saldo anterior, movimientos del periodo y saldo final.

const GRUPO_LABEL = { CAJA_BANCOS: "Caja y Bancos", INGRESOS: "Ingresos", COSTO_VENTA: "Costo de venta", GASTO_OPERATIVO: "Gasto operativo" };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fecha = (iso) => iso.split("-").reverse().join("/");
const num = (v) => (v ? Number(v).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "");
const mon = (moneda, v) => `${moneda === "USD" ? "US$" : "S/"} ${Number(v || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

module.exports = function libroMayorPdf({ desde, hasta, cuentas, resultadoPeriodo, empresa, ruc }) {
  const resumen = cuentas.map((c) => `
    <tr>
      <td>${esc(GRUPO_LABEL[c.grupo])}</td><td>${esc(c.nombre)}</td>
      <td class="n">${mon(c.moneda, c.saldoAnterior)}</td><td class="n">${num(c.debe)}</td>
      <td class="n">${num(c.haber)}</td><td class="n b">${mon(c.moneda, c.saldoFinal)}</td>
    </tr>`).join("");

  const detalle = cuentas.map((c) => `
    <section class="cuenta">
      <h2>${esc(c.nombre)} <span>${esc(GRUPO_LABEL[c.grupo])} · ${c.moneda === "USD" ? "Dólares" : "Soles"}</span></h2>
      <table>
        <thead><tr><th>Fecha</th><th>Documento</th><th>Concepto</th><th>Cliente / proveedor</th><th class="n">Debe</th><th class="n">Haber</th><th class="n">Saldo</th></tr></thead>
        <tbody>
          <tr class="sub"><td></td><td></td><td>Saldo anterior</td><td></td><td></td><td></td><td class="n">${num(c.saldoAnterior) || "0.00"}</td></tr>
          ${c.movimientos.map((m) => `
            <tr>
              <td class="nw">${fecha(m.fecha)}</td><td class="nw">${esc(m.documento)}</td><td>${esc(m.concepto)}</td><td>${esc(m.tercero)}</td>
              <td class="n">${num(m.debe)}</td><td class="n">${num(m.haber)}</td><td class="n">${num(m.saldo) || "0.00"}</td>
            </tr>`).join("") || `<tr><td colspan="7" class="vacio">Sin movimientos en el periodo</td></tr>`}
          <tr class="sub"><td></td><td></td><td>Totales del periodo</td><td></td><td class="n">${num(c.debe)}</td><td class="n">${num(c.haber)}</td><td class="n">${num(c.saldoFinal) || "0.00"}</td></tr>
        </tbody>
      </table>
    </section>`).join("");

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Libro Mayor</title>
<style>
  @page { size: A4; margin: 14mm 10mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 8.5pt; color: #222; margin: 0; }
  header { border-bottom: 2px solid #222; padding-bottom: 6px; margin-bottom: 10px; }
  h1 { font-size: 14pt; margin: 0; }
  .meta { color: #555; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 3px 4px; border-bottom: 1px solid #ddd; text-align: left; vertical-align: top; }
  th { background: #f1f1f1; font-weight: bold; }
  .n { text-align: right; white-space: nowrap; }
  .b { font-weight: bold; }
  .nw { white-space: nowrap; }
  .sub td { background: #fafafa; font-weight: bold; }
  .vacio { color: #888; text-align: center; }
  .resultado { margin-top: 8px; text-align: right; font-size: 10pt; font-weight: bold; }
  .cuenta { margin-top: 14px; page-break-inside: auto; }
  .cuenta h2 { font-size: 10.5pt; margin: 0 0 4px; }
  .cuenta h2 span { font-size: 8pt; font-weight: normal; color: #666; }
  tr { page-break-inside: avoid; }
</style></head>
<body>
  <header>
    <h1>Libro Mayor</h1>
    <div class="meta">${esc(empresa || "")}${ruc ? ` · RUC ${esc(ruc)}` : ""} · Del ${fecha(desde)} al ${fecha(hasta)}</div>
  </header>
  <table>
    <thead><tr><th>Grupo</th><th>Cuenta</th><th class="n">Saldo anterior</th><th class="n">Debe</th><th class="n">Haber</th><th class="n">Saldo final</th></tr></thead>
    <tbody>${resumen || `<tr><td colspan="6" class="vacio">Sin cuentas con movimientos</td></tr>`}</tbody>
  </table>
  <div class="resultado">Resultado del periodo (ventas − costo de venta − gasto operativo): ${mon("PEN", resultadoPeriodo)}</div>
  ${detalle}
</body></html>`;
};
