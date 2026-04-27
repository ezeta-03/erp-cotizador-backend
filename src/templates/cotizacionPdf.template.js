module.exports = (cotizacion) => {
  const { cliente, items, total, numero, createdAt, estado, conIgv: rawConIgv } = cotizacion;

  const conIgv = rawConIgv !== undefined ? rawConIgv : true;

  const fecha = createdAt
    ? new Date(createdAt).toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" })
    : "N/A";

  const S = (v) => `S/ ${(v || 0).toFixed(2)}`;

  const valorVenta = conIgv ? parseFloat((( total || 0) / 1.18).toFixed(2)) : (total || 0);
  const igvMonto   = conIgv ? parseFloat(((total || 0) - valorVenta).toFixed(2)) : 0;

  const itemsHtml = items && items.length > 0
    ? items.map((item, i) => {
        const nombre = item.producto?.nombre || item.producto?.servicio || item.producto?.material || "Producto";
        const glosa  = item.descripcion || item.glosa || "";
        return `
          <tr>
            <td class="td-num">${i + 1}</td>
            <td class="td-desc">
              <span class="item-name">${nombre}</span>
              ${glosa ? `<br/><span class="item-glosa">${glosa}</span>` : ""}
            </td>
            <td class="td-center">${parseFloat(item.cantidad || 0)}</td>
            <td class="td-right">${S(item.precio)}</td>
            <td class="td-right td-subtotal">${S(item.subtotal)}</td>
          </tr>`;
      }).join("")
    : `<tr><td colspan="5" class="td-empty">Sin ítems</td></tr>`;

  const totalsHtml = conIgv
    ? `<div class="t-row">
         <span>Valor de venta</span>
         <span>${S(valorVenta)}</span>
       </div>
       <div class="t-row t-igv">
         <span>IGV (18%)</span>
         <span>+ ${S(igvMonto)}</span>
       </div>
       <div class="t-divider"></div>`
    : "";

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

  /* ── Header ── */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding-bottom: 28px;
    border-bottom: 2px solid #111;
    margin-bottom: 36px;
  }
  .brand       { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; color: #111; }
  .brand-sub   { font-size: 10px; color: #9ca3af; margin-top: 3px; letter-spacing: 0.04em; text-transform: uppercase; }
  .doc-right   { text-align: right; }
  .doc-numero  { font-size: 11px; font-weight: 700; color: #111; text-transform: uppercase; letter-spacing: 0.05em; }
  .doc-fecha   { font-size: 10px; color: #6b7280; margin-top: 4px; }
  .doc-estado  {
    display: inline-block; margin-top: 7px;
    font-size: 9px; font-weight: 700; padding: 2px 8px; border-radius: 99px;
    text-transform: uppercase; letter-spacing: 0.04em;
    background: #f3f4f6; color: #374151;
  }

  /* ── Cliente ── */
  .section       { margin-bottom: 36px; }
  .field-label   { font-size: 9px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 5px; }
  .client-name   { font-size: 15px; font-weight: 700; color: #111; }
  .client-sub    { font-size: 10px; color: #6b7280; margin-top: 2px; }

  /* ── Tabla ── */
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
  .item-name   { font-weight: 600; color: #111; }
  .item-glosa  { font-size: 9.5px; color: #6b7280; margin-top: 1px; }
  .td-center   { text-align: center; width: 42px; color: #374151; }
  .td-right    { text-align: right; width: 88px; color: #374151; }
  .td-subtotal { font-weight: 600; color: #111; padding-right: 0; }
  .td-empty    { text-align: center; color: #9ca3af; padding: 20px 0; }

  /* ── Totales ── */
  .totals-wrap  { display: flex; justify-content: flex-end; margin-top: 24px; }
  .totals-inner { width: 250px; }
  .t-row {
    display: flex; justify-content: space-between;
    padding: 4px 0; font-size: 11px; color: #374151;
  }
  .t-igv      { color: #1d4ed8; }
  .t-divider  { border-top: 1px solid #e5e7eb; margin: 8px 0; }
  .t-grand {
    display: flex; justify-content: space-between; align-items: baseline;
    font-size: 15px; font-weight: 800; color: #111;
  }
  .igv-badge {
    display: inline-block; font-size: 8px; font-weight: 700;
    padding: 2px 6px; border-radius: 99px; margin-left: 7px;
    vertical-align: middle;
  }
  .igv-badge.con { background: #dcfce7; color: #166534; }
  .igv-badge.sin { background: #f3f4f6; color: #6b7280; }

  /* ── Footer ── */
  .footer {
    margin-top: 52px; padding-top: 18px;
    border-top: 1px solid #e5e7eb;
    display: flex; justify-content: space-between; align-items: center;
  }
  .footer-note  { font-size: 9px; color: #9ca3af; }
  .footer-brand { font-size: 10px; font-weight: 800; color: #d1d5db; letter-spacing: 0.05em; }

  /* ── IGV Notice ── */
  .igv-notice {
    display: inline-block; margin-bottom: 22px;
    font-size: 9.5px; font-weight: 600; padding: 4px 10px; border-radius: 4px;
  }
  .igv-notice.con { background: #dcfce7; color: #166534; }
  .igv-notice.sin { background: #f3f4f6; color: #6b7280; }
</style>
</head>
<body>

<div class="header">
  <div>
    <div class="brand">ZAAZMAGO</div>
    <div class="brand-sub">Publicidad &amp; Diseño</div>
  </div>
  <div class="doc-right">
    <div class="doc-numero">Cotización ${numero || "N/A"}</div>
    <div class="doc-fecha">${fecha}</div>
    <div class="doc-estado">${estado || "PENDIENTE"}</div>
  </div>
</div>

<div class="section">
  <div class="field-label">Para</div>
  <div class="client-name">${cliente?.nombreComercial || "N/A"}</div>
  ${cliente?.nombreContacto ? `<div class="client-sub">${cliente.nombreContacto}</div>` : ""}
  ${cliente?.email ? `<div class="client-sub">${cliente.email}</div>` : ""}
</div>

<div class="igv-notice ${conIgv ? "con" : "sin"}">
  ${conIgv ? "✓ Precios con IGV incluido (18%)" : "· Precios sin IGV — valor de venta"}
</div>

<table>
  <thead>
    <tr class="thead-row">
      <th>#</th>
      <th>Descripción</th>
      <th class="th-center">Cant.</th>
      <th class="th-right">Precio unit.</th>
      <th class="th-right">Subtotal</th>
    </tr>
  </thead>
  <tbody>
    ${itemsHtml}
  </tbody>
</table>

<div class="totals-wrap">
  <div class="totals-inner">
    ${totalsHtml}
    <div class="t-grand">
      <span>
        Total
        <span class="igv-badge ${conIgv ? "con" : "sin"}">${conIgv ? "Con IGV" : "Sin IGV"}</span>
      </span>
      <span>${S(total)}</span>
    </div>
  </div>
</div>

<div class="footer">
  <div class="footer-note">Cotización válida por 15 días hábiles desde la fecha de emisión.</div>
  <div class="footer-brand">ZAAZMAGO</div>
</div>

</body>
</html>`;
};
