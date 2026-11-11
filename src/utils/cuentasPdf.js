// Bloque "Cuentas para el pago" de cotizaciones y comprobantes en PDF, a partir
// de la copia de cuentas guardada en el documento.
const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const MONEDA = { PEN: "Soles", USD: "Dólares" };

function etiqueta(c) {
  if (c.tipo === "DETRACCIONES") return "Detracciones — Banco de la Nación";
  return c.banco && !c.nombre.toLowerCase().includes(c.banco.toLowerCase()) ? `${c.nombre} (${c.banco})` : c.nombre;
}

module.exports = function cuentasPdf(cuentas, { titulo = "Cuentas para el pago", clase = "cuentas-pago" } = {}) {
  if (!Array.isArray(cuentas) || !cuentas.length) return "";
  const filas = cuentas.map((c) => `
    <tr>
      <td>${esc(etiqueta(c))}</td>
      <td>${MONEDA[c.moneda] || esc(c.moneda)}</td>
      <td>${esc(c.numero || "—")}</td>
      <td>${esc(c.cci || "—")}</td>
    </tr>`).join("");
  return `
  <div class="${clase}">
    <div class="${clase}-tit">${titulo}</div>
    <table class="${clase}-tabla">
      <tr><th>Cuenta</th><th>Moneda</th><th>N.° de cuenta</th><th>CCI</th></tr>
      ${filas}
    </table>
  </div>`;
};

// Estilos del bloque (se insertan dentro del <style> de cada plantilla).
module.exports.estilos = (clase = "cuentas-pago") => `
  .${clase} { margin-top: 18px; page-break-inside: avoid; }
  .${clase}-tit { font-size: 9px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 6px; }
  .${clase}-tabla { width: 100%; border-collapse: collapse; font-size: 10px; }
  .${clase}-tabla th { text-align: left; font-size: 8.5px; color: #6b7280; font-weight: 700; padding: 4px 8px 4px 0; border-bottom: 1px solid #e5e7eb; text-transform: none; letter-spacing: 0; }
  .${clase}-tabla td { padding: 4px 8px 4px 0; border-bottom: 1px solid #f3f4f6; color: #111; }
`;
