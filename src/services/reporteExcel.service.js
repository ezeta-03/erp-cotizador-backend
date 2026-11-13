// Excel genérico para los reportes analíticos (misma identidad que el Libro Mayor).
// Recibe el objeto que devuelve reportesAnaliticos.service: titulo, subtitulo,
// columnas [{ clave, titulo, formato }] y filas.
const ExcelJS = require("exceljs");
const { colores, logoPath } = require("../config/marca");
const { piezas } = require("./libroMayorExcel");

const { argb, relleno, encabezado, cabecera, filaDatos, filaTotal } = piezas;

const FORMATO_NUMERO = {
  texto: null,
  moneda: '"S/" #,##0.00;[Red]-"S/" #,##0.00',
  porcentaje: '0.0"%"',
  entero: "#,##0",
};

async function reporteExcel(reporte, { empresa, ruc, fecha }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ERP Zaazmago";
  wb.created = new Date();
  const ws = wb.addWorksheet(reporte.titulo.slice(0, 31), {
    views: [{ state: "frozen", xSplit: 1, ySplit: 6, showGridLines: false }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
    properties: { tabColor: { argb: argb(colores.naranja) } },
  });
  try {
    wb.__logoId = wb.addImage({ filename: logoPath, extension: "png" });
  } catch {
    wb.__logoId = undefined;
  }

  const n = reporte.columnas.length;
  ws.columns = reporte.columnas.map((c, i) => ({ width: i === 0 ? 34 : 18 }));
  const subtitulo = `${empresa || ""}${ruc ? ` · RUC ${ruc}` : ""} · ${reporte.subtitulo}${fecha ? ` · ${fecha}` : ""}`;
  encabezado(wb, ws, Math.max(n, 4), reporte.titulo, subtitulo);
  cabecera(ws, 6, reporte.columnas.map((c) => c.titulo));
  ws.getRow(6).eachCell((c, col) => { if (col > 1) c.alignment = { horizontal: "right", vertical: "middle" }; });

  const monedas = reporte.columnas.map((c, i) => (c.formato === "texto" ? null : i + 1)).filter(Boolean);
  let fila = 7;
  reporte.filas.forEach((f, i) => {
    const row = ws.getRow(fila++);
    row.values = reporte.columnas.map((c) => (f[c.clave] === undefined ? null : f[c.clave]));
    filaDatos(row, i % 2 === 1, monedas, "PEN");
    reporte.columnas.forEach((c, idx) => {
      if (FORMATO_NUMERO[c.formato]) row.getCell(idx + 1).numFmt = FORMATO_NUMERO[c.formato];
    });
  });
  if (!reporte.filas.length) {
    const row = ws.getRow(fila++);
    row.getCell(1).value = "Sin movimientos en el periodo";
    row.getCell(1).font = { italic: true, color: { argb: argb(colores.texto3) } };
  }

  // Totales de las columnas de monto (no de porcentajes ni textos).
  const sumables = reporte.columnas.filter((c) => c.total === true);
  if (sumables.length && reporte.filas.length) {
    const tot = ws.getRow(fila++);
    tot.values = reporte.columnas.map((c, idx) => (idx === 0 ? "Total" : sumables.includes(c) ? reporte.filas.reduce((a, f) => a + (Number(f[c.clave]) || 0), 0) : null));
    filaTotal(tot, monedas, "PEN");
    reporte.columnas.forEach((c, idx) => {
      if (FORMATO_NUMERO[c.formato]) tot.getCell(idx + 1).numFmt = FORMATO_NUMERO[c.formato];
    });
  }

  ws.getRow(6).getCell(1).fill = relleno(colores.naranja);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

module.exports = { reporteExcel };
