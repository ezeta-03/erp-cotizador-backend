module.exports = (orden) => {
  const { id, tipo, ordenServicio, cliente, proyecto, proyectoExternoId, usuario, notas, fecha, items } = orden;
  const proyectoNombre = proyecto?.nombre || proyectoExternoId || null;

  const fechaStr = fecha
    ? new Date(fecha).toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" })
    : "N/A";

  const S = (v) => `S/ ${(v || 0).toFixed(2)}`;
  const tituloTipo = tipo === "ENTRADA" ? "Orden de Ingreso de Almacén" : "Orden de Salida de Almacén";

  const total = (items || []).reduce((s, i) => s + i.cantidad * i.precioUnitario, 0);

  const itemsHtml = items && items.length > 0
    ? items.map((linea, i) => `
        <tr>
          <td class="td-num">${i + 1}</td>
          <td class="td-desc">
            <span class="item-code">${linea.item?.codigo || ""}</span>
            <br/><span class="item-name">${linea.item?.nombre || "Ítem"}</span>
          </td>
          <td class="td-center">${linea.cantidad} ${linea.item?.unidad || ""}</td>
          <td class="td-right">${S(linea.precioUnitario)}</td>
          <td class="td-right td-subtotal">${S(linea.cantidad * linea.precioUnitario)}</td>
        </tr>`).join("")
    : `<tr><td colspan="5" class="td-empty">Sin ítems</td></tr>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: -apple-system, Arial, Helvetica, sans-serif;
    font-size: 11px;
    color: #1a1a1a;
    background: #fff;
    padding: 52px 60px;
    line-height: 1.5;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding-bottom: 28px;
    border-bottom: 2px solid #111;
    margin-bottom: 32px;
  }
  .brand      { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; color: #111; }
  .brand-sub  { font-size: 10px; color: #9ca3af; margin-top: 3px; letter-spacing: 0.04em; text-transform: uppercase; }
  .doc-right  { text-align: right; }
  .doc-numero { font-size: 11px; font-weight: 700; color: #111; text-transform: uppercase; letter-spacing: 0.05em; }
  .doc-fecha  { font-size: 10px; color: #6b7280; margin-top: 4px; }
  .doc-estado {
    display: inline-block; margin-top: 7px;
    font-size: 9px; font-weight: 700; padding: 2px 8px; border-radius: 99px;
    text-transform: uppercase; letter-spacing: 0.04em;
    background: ${tipo === "ENTRADA" ? "#dbeafe" : "#ffedd5"}; color: ${tipo === "ENTRADA" ? "#1e40af" : "#9a3412"};
  }

  .datos-grid {
    display: grid; grid-template-columns: repeat(3, 1fr);
    gap: 18px; margin-bottom: 32px;
    padding-bottom: 24px; border-bottom: 1px solid #e5e7eb;
  }
  .field-label { font-size: 9px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 5px; }
  .field-value { font-size: 12.5px; font-weight: 600; color: #111; }
  .field-value.muted { color: #9ca3af; font-weight: 400; font-style: italic; }

  table { width: 100%; border-collapse: collapse; }
  .thead-row { border-bottom: 1px solid #111; }
  th {
    font-size: 9px; font-weight: 700; color: #6b7280;
    text-transform: uppercase; letter-spacing: 0.07em;
    padding: 0 12px 10px 0; text-align: left;
  }
  th.th-right  { text-align: right; padding-right: 0; }
  th.th-center { text-align: center; }

  tbody tr { border-bottom: 1px solid #f3f4f6; }
  tbody tr:last-child { border-bottom: none; }
  td { padding: 10px 12px 10px 0; vertical-align: top; }

  .td-num      { width: 24px; color: #9ca3af; font-size: 10px; }
  .td-desc     { padding-right: 16px; }
  .item-code   { font-size: 9.5px; color: #9ca3af; font-family: monospace; }
  .item-name   { font-weight: 600; color: #111; }
  .td-center   { text-align: center; width: 100px; color: #374151; }
  .td-right    { text-align: right; width: 88px; color: #374151; }
  .td-subtotal { font-weight: 600; color: #111; padding-right: 0; }
  .td-empty    { text-align: center; color: #9ca3af; padding: 20px 0; }

  .totals-wrap  { display: flex; justify-content: flex-end; margin-top: 24px; }
  .t-grand {
    display: flex; justify-content: space-between; align-items: baseline; gap: 24px;
    font-size: 15px; font-weight: 800; color: #111;
  }

  .firma-row { display: flex; justify-content: space-between; margin-top: 72px; }
  .firma-box { width: 220px; text-align: center; }
  .firma-linea { border-top: 1px solid #9ca3af; padding-top: 6px; font-size: 9.5px; color: #6b7280; }

  .footer {
    margin-top: 40px; padding-top: 18px;
    border-top: 1px solid #e5e7eb;
    display: flex; justify-content: space-between; align-items: center;
  }
  .footer-note  { font-size: 9px; color: #9ca3af; }
  .footer-brand { font-size: 10px; font-weight: 800; color: #d1d5db; letter-spacing: 0.05em; }
</style>
</head>
<body>

<div class="header">
  <div>
    <div class="brand">ZAAZMAGO</div>
    <div class="brand-sub">Almacén</div>
  </div>
  <div class="doc-right">
    <div class="doc-numero">${tituloTipo} · ALM-${String(id).padStart(5, "0")}</div>
    <div class="doc-fecha">${fechaStr}</div>
    <div class="doc-estado">${tipo}</div>
  </div>
</div>

<div class="datos-grid">
  <div>
    <div class="field-label">Orden de servicio</div>
    <div class="field-value ${ordenServicio ? "" : "muted"}">${ordenServicio || "Sin especificar"}</div>
  </div>
  <div>
    <div class="field-label">Cliente</div>
    <div class="field-value ${cliente ? "" : "muted"}">${cliente?.nombreComercial || "Sin cliente directo"}</div>
  </div>
  <div>
    <div class="field-label">Proyecto</div>
    <div class="field-value ${proyectoNombre ? "" : "muted"}">${proyectoNombre || "Sin proyecto asociado"}</div>
  </div>
</div>

<table>
  <thead>
    <tr class="thead-row">
      <th class="th-num"></th>
      <th>Ítem</th>
      <th class="th-center">Cantidad</th>
      <th class="th-right">P. Unitario</th>
      <th class="th-right">Total</th>
    </tr>
  </thead>
  <tbody>
    ${itemsHtml}
  </tbody>
</table>

<div class="totals-wrap">
  <div class="t-grand">
    <span>Total</span>
    <span>${S(total)}</span>
  </div>
</div>

${notas ? `<div style="margin-top:20px;"><div class="field-label">Notas</div><div class="field-value" style="font-weight:400;">${notas}</div></div>` : ""}

<div class="firma-row">
  <div class="firma-box"><div class="firma-linea">Entregado por</div></div>
  <div class="firma-box"><div class="firma-linea">Recibido por</div></div>
</div>

<div class="footer">
  <div class="footer-note">Generado por ${usuario?.nombre || "Sistema"} — erp-zaazmago</div>
  <div class="footer-brand">ZAAZMAGO</div>
</div>

</body>
</html>`;
};
