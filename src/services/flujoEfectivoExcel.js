// Estado de Flujo de Efectivo en Excel, con la misma identidad que el Libro
// Mayor: una hoja con entradas, salidas, flujo neto y acumulado por mes, y otra
// con las salidas por línea de negocio.
const ExcelJS = require("exceljs");
const { colores, logoPath } = require("../config/marca");
const { piezas } = require("./libroMayorExcel");

const { argb, relleno, encabezado, cabecera, filaDatos, filaTotal, fechaDMA } = piezas;

function hoja(wb, nombre, m, titulo, subtitulo) {
  const columnas = 1 + m.meses.length + 2; // concepto, meses, total, %
  const ws = wb.addWorksheet(nombre, {
    views: [{ state: "frozen", xSplit: 1, ySplit: 6, showGridLines: false }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
    properties: { tabColor: { argb: argb(colores.naranja) } },
  });
  ws.columns = [{ width: 44 }, ...m.meses.map(() => ({ width: 14 })), { width: 16 }, { width: 9 }];
  encabezado(wb, ws, Math.max(columnas, 4), titulo, subtitulo);
  const titulos = ["Concepto", ...m.meses.map((x) => x.etiqueta), "Total", "%"];
  cabecera(ws, 6, titulos);
  ws.getRow(6).eachCell((c, col) => { if (col > 1) c.alignment = { horizontal: "right", vertical: "middle" }; });
  return { ws, columnas, monedas: Array.from({ length: m.meses.length + 1 }, (_, i) => i + 2) };
}

// Escribe un bloque (título, filas con detalle, total) y devuelve la fila siguiente.
function bloque(ws, fila, m, { titulo, color, datos, conDetalle = true }, monedas) {
  const t = ws.getRow(fila++);
  t.getCell(1).value = titulo.toUpperCase();
  t.getCell(1).font = { bold: true, size: 10, color: { argb: argb(color) } };
  const pct = 2 + m.meses.length + 1;
  datos.filas.forEach((f, i) => {
    const row = ws.getRow(fila++);
    row.values = [f.nombre, ...m.meses.map((x) => f.meses[x.clave] || null), f.total, f.porcentaje / 100];
    filaDatos(row, i % 2 === 1, monedas, "PEN");
    row.getCell(1).font = { bold: true, color: { argb: argb(colores.carbon) } };
    row.getCell(pct).numFmt = "0.0%";
    row.getCell(pct).alignment = { horizontal: "right" };
    if (!conDetalle) return;
    for (const d of f.detalle) {
      const r = ws.getRow(fila++);
      r.values = [`    ${d.nombre}`, ...m.meses.map((x) => d.meses[x.clave] || null), d.total, f.total ? d.total / f.total : 0];
      filaDatos(r, false, monedas, "PEN");
      r.eachCell({ includeEmpty: true }, (c) => { c.font = { size: 9, color: { argb: argb(colores.texto2) } }; });
      r.getCell(pct).numFmt = "0.0%";
      r.getCell(pct).alignment = { horizontal: "right" };
      r.outlineLevel = 1;
    }
  });
  if (!datos.filas.length) {
    const row = ws.getRow(fila++);
    row.getCell(1).value = "Sin movimientos en el periodo";
    row.getCell(1).font = { italic: true, color: { argb: argb(colores.texto3) } };
  }
  const tot = ws.getRow(fila++);
  tot.values = [`Total ${titulo.toLowerCase()}`, ...m.meses.map((x) => datos.totales.meses[x.clave]), datos.totales.total, datos.totales.total ? 1 : null];
  filaTotal(tot, monedas, "PEN");
  tot.getCell(pct).numFmt = "0.0%";
  tot.getCell(pct).alignment = { horizontal: "right" };
  return fila + 1;
}

async function flujoEfectivoExcel(m, { empresa, ruc }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ERP Zaazmago";
  wb.created = new Date();
  try {
    wb.__logoId = wb.addImage({ filename: logoPath, extension: "png" });
  } catch {
    wb.__logoId = undefined;
  }
  const subtitulo = `${empresa || ""}${ruc ? ` · RUC ${ruc}` : ""} · Del ${fechaDMA(m.desde)} al ${fechaDMA(m.hasta)} · En soles`;

  /* ── Flujo ── */
  const { ws, monedas } = hoja(wb, "Flujo de efectivo", m, "Estado de Flujo de Efectivo", subtitulo);
  let fila = 7;
  fila = bloque(ws, fila, m, { titulo: "Entradas", color: colores.exito, datos: m.entradas }, monedas);
  fila = bloque(ws, fila, m, { titulo: "Salidas", color: colores.peligro, datos: m.salidas }, monedas);

  const neto = ws.getRow(fila++);
  neto.values = ["Flujo neto del periodo", ...m.meses.map((x) => m.neto.meses[x.clave]), m.neto.total];
  filaTotal(neto, monedas, "PEN");
  neto.getCell(1).font = { bold: true, size: 11, color: { argb: argb(colores.carbon) } };
  const acum = ws.getRow(fila++);
  acum.values = ["Flujo acumulado", ...m.meses.map((x) => m.acumulado[x.clave]), null];
  filaDatos(acum, false, monedas, "PEN");
  acum.getCell(1).font = { italic: true, color: { argb: argb(colores.texto2) } };

  const notas = [
    "Solo dinero que entró o salió, por la fecha del cobro o pago. Montos en dólares convertidos a soles.",
    m.retencionesExcluidas ? `No incluye retenciones de clientes (S/ ${m.retencionesExcluidas.toFixed(2)}): no son dinero que entra.` : null,
  ].filter(Boolean);
  notas.forEach((n, i) => {
    const c = ws.getCell(fila + 1 + i, 1);
    c.value = n;
    c.font = { size: 9, italic: true, color: { argb: argb(colores.texto3) } };
  });
  ws.properties.outlineProperties = { summaryBelow: false };

  /* ── Por línea de negocio ── */
  const l = hoja(wb, "Por línea de negocio", m, "Salidas por línea de negocio", subtitulo);
  const fin = bloque(l.ws, 7, m, { titulo: "Salidas", color: colores.peligro, datos: m.salidasPorLinea, conDetalle: false }, l.monedas);
  const n = l.ws.getCell(fin, 1);
  n.value = "Lo pagado a cada proveedor repartido según sus % por línea de negocio; sin reparto (o cuotas de paneles) va a \"Sin línea de negocio\".";
  n.font = { size: 9, italic: true, color: { argb: argb(colores.texto3) } };
  l.ws.getRow(6).getCell(1).fill = relleno(colores.naranja);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

module.exports = { flujoEfectivoExcel };
