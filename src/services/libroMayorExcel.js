// Libro Mayor en Excel con la identidad de Zaazmago: franja carbón con el logo,
// indicadores, tablas con cabecera naranja, filtros, paneles fijos y formato
// de moneda. Una hoja Resumen y una hoja por cuenta.
const ExcelJS = require("exceljs");
const { colores, logoPath } = require("../config/marca");

const argb = (hex) => `FF${hex.replace("#", "")}`;
const relleno = (hex) => ({ type: "pattern", pattern: "solid", fgColor: { argb: argb(hex) } });
const fechaDMA = (iso) => iso.split("-").reverse().join("/");
const formatoMoneda = (moneda) => `"${moneda === "USD" ? "US$" : "S/"}" #,##0.00;[Red]-"${moneda === "USD" ? "US$" : "S/"}" #,##0.00`;
const borde = { style: "thin", color: { argb: argb(colores.borde) } };
const NUMERICAS = ["Saldo anterior", "Debe", "Haber", "Saldo final", "Saldo", "Movimientos"];

const GRUPO_LABEL = { CAJA_BANCOS: "Caja y Bancos", INGRESOS: "Ingresos", COSTO_VENTA: "Costo de venta", GASTO_OPERATIVO: "Gasto operativo" };
const GRUPO_COLOR = { CAJA_BANCOS: colores.info, INGRESOS: colores.exito, COSTO_VENTA: colores.violeta, GASTO_OPERATIVO: colores.advertencia };

// Nombre de hoja: máximo 31 caracteres, sin []:*?/\ y sin repetir.
function nombreHoja(nombre, usados) {
  const base = nombre.replace(/[[\]:*?/\\]/g, "-").slice(0, 28);
  let n = base;
  for (let i = 2; usados.has(n.toLowerCase()); i++) n = `${base.slice(0, 26)} ${i}`;
  usados.add(n.toLowerCase());
  return n;
}

// Franja superior: fondo carbón, logo, título y subtítulo. Ocupa las filas 1–4.
function encabezado(wb, ws, columnas, titulo, subtitulo) {
  for (let f = 1; f <= 4; f++) {
    ws.getRow(f).height = f === 4 ? 6 : 22;
    for (let c = 1; c <= columnas; c++) ws.getCell(f, c).fill = relleno(f === 4 ? colores.naranja : colores.carbon);
  }
  const logo = wb.__logoId;
  if (logo !== undefined) ws.addImage(logo, { tl: { col: 0.25, row: 0.45 }, ext: { width: 190, height: 38 } });
  // Título y subtítulo a la derecha del logo (que ocupa las dos primeras columnas).
  const t = ws.getCell(1, 3);
  t.value = titulo;
  t.font = { name: "Calibri", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
  t.alignment = { horizontal: "right", vertical: "middle" };
  ws.mergeCells(1, 3, 1, columnas);
  const s = ws.getCell(2, 3);
  s.value = subtitulo;
  s.font = { name: "Calibri", size: 10, color: { argb: argb("#C9CED6") } };
  s.alignment = { horizontal: "right", vertical: "middle" };
  ws.mergeCells(2, 3, 2, columnas);
}

// Cabecera de tabla naranja en la fila indicada.
function cabecera(ws, fila, titulos) {
  const row = ws.getRow(fila);
  titulos.forEach((t, i) => {
    const c = row.getCell(i + 1);
    c.value = t;
    c.fill = relleno(colores.naranja);
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.alignment = { vertical: "middle", horizontal: NUMERICAS.includes(t) ? "right" : "left" };
    c.border = { bottom: { style: "medium", color: { argb: argb(colores.naranjaTexto) } } };
  });
  row.height = 20;
}

function filaDatos(row, zebra, columnasMoneda, moneda) {
  row.eachCell({ includeEmpty: true }, (c, col) => {
    if (zebra) c.fill = relleno(colores.fondo);
    c.border = { bottom: borde };
    c.font = { ...(c.font || {}), color: { argb: argb(colores.carbon) } };
    if (columnasMoneda.includes(col)) {
      c.numFmt = formatoMoneda(moneda);
      c.alignment = { horizontal: "right" };
    }
  });
}

function filaTotal(row, columnasMoneda, moneda) {
  row.eachCell({ includeEmpty: true }, (c, col) => {
    c.fill = relleno(colores.naranjaClaro);
    c.font = { bold: true, color: { argb: argb(colores.carbon) } };
    c.border = { top: { style: "thin", color: { argb: argb(colores.naranja) } } };
    if (columnasMoneda.includes(col)) {
      c.numFmt = formatoMoneda(moneda);
      c.alignment = { horizontal: "right" };
    }
  });
}

// Indicadores en la hoja Resumen: etiqueta pequeña y valor grande.
function indicadores(ws, fila, items) {
  items.forEach(([etiqueta, valor, color], i) => {
    const col = 1 + i * 2;
    ws.mergeCells(fila, col, fila, col + 1);
    ws.mergeCells(fila + 1, col, fila + 1, col + 1);
    const e = ws.getCell(fila, col);
    e.value = etiqueta.toUpperCase();
    e.font = { size: 8, bold: true, color: { argb: argb(colores.texto3) } };
    const v = ws.getCell(fila + 1, col);
    v.value = valor;
    v.numFmt = formatoMoneda("PEN");
    v.font = { size: 15, bold: true, color: { argb: argb(color || colores.carbon) } };
    v.alignment = { horizontal: "left" };
    for (const f of [fila, fila + 1]) {
      for (const c of [col, col + 1]) {
        const cell = ws.getCell(f, c);
        cell.fill = relleno(colores.superficie2);
        cell.border = { left: c === col ? { style: "thick", color: { argb: argb(color || colores.naranja) } } : undefined };
      }
    }
  });
  ws.getRow(fila).height = 16;
  ws.getRow(fila + 1).height = 26;
}

async function libroMayorExcel(m, { empresa, ruc }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ERP Zaazmago";
  wb.created = new Date();
  try {
    wb.__logoId = wb.addImage({ filename: logoPath, extension: "png" });
  } catch {
    wb.__logoId = undefined;
  }
  const subtitulo = `${empresa || ""}${ruc ? ` · RUC ${ruc}` : ""} · Del ${fechaDMA(m.desde)} al ${fechaDMA(m.hasta)}`;
  const ventas = m.totales.INGRESOS.periodo;

  /* ── Resumen ── */
  const rs = wb.addWorksheet("Resumen", {
    views: [{ state: "frozen", ySplit: 12, showGridLines: false }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
    properties: { tabColor: { argb: argb(colores.naranja) } },
  });
  rs.columns = [{ width: 18 }, { width: 40 }, { width: 9 }, { width: 17 }, { width: 17 }, { width: 17 }, { width: 18 }, { width: 13 }];
  encabezado(wb, rs, 8, "Libro Mayor", subtitulo);
  indicadores(rs, 6, [
    ["Ventas del periodo", ventas, colores.exito],
    ["Costo de venta", m.totales.COSTO_VENTA.periodo, colores.violeta],
    ["Gasto operativo", m.totales.GASTO_OPERATIVO.periodo, colores.advertencia],
    ["Resultado del periodo", m.resultadoPeriodo, m.resultadoPeriodo < 0 ? colores.peligro : colores.naranjaTexto],
  ]);
  const nota = rs.getCell(9, 1);
  nota.value = ventas
    ? `Margen bruto ${(((ventas - m.totales.COSTO_VENTA.periodo) / ventas) * 100).toFixed(1)}% · Margen neto ${((m.resultadoPeriodo / ventas) * 100).toFixed(1)}% · Ventas y gastos en soles, base sin IGV`
    : "Ventas y gastos en soles, base sin IGV";
  nota.font = { size: 9, italic: true, color: { argb: argb(colores.texto3) } };
  rs.mergeCells(9, 1, 9, 8);

  const filaCab = 12;
  cabecera(rs, filaCab, ["Grupo", "Cuenta", "Moneda", "Saldo anterior", "Debe", "Haber", "Saldo final", "Movimientos"]);
  let f = filaCab + 1;
  m.cuentas.forEach((c, i) => {
    const row = rs.getRow(f++);
    row.values = [GRUPO_LABEL[c.grupo], c.nombre, c.moneda, c.saldoAnterior, c.debe, c.haber, c.saldoFinal, c.movimientos.length];
    filaDatos(row, i % 2 === 1, [4, 5, 6, 7], c.moneda);
    row.getCell(1).font = { bold: true, color: { argb: argb(GRUPO_COLOR[c.grupo]) } };
    row.getCell(7).font = { bold: true, color: { argb: argb(colores.carbon) } };
    row.getCell(8).alignment = { horizontal: "right" };
  });
  rs.autoFilter = { from: { row: filaCab, column: 1 }, to: { row: Math.max(f - 1, filaCab), column: 8 } };
  const total = rs.getRow(f + 1);
  total.values = ["", "Resultado del periodo (S/)", "", "", "", "", m.resultadoPeriodo, ""];
  filaTotal(total, [7], "PEN");

  /* ── Una hoja por cuenta ── */
  const usados = new Set(["resumen"]);
  for (const c of m.cuentas) {
    const ws = wb.addWorksheet(nombreHoja(c.nombre, usados), {
      views: [{ state: "frozen", ySplit: 8, showGridLines: false }],
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
      properties: { tabColor: { argb: argb(GRUPO_COLOR[c.grupo]) } },
    });
    ws.columns = [{ width: 12 }, { width: 20 }, { width: 46 }, { width: 34 }, { width: 15 }, { width: 15 }, { width: 16 }];
    encabezado(wb, ws, 7, c.nombre, subtitulo);
    const info = ws.getCell(6, 1);
    info.value = `${GRUPO_LABEL[c.grupo]} · ${c.moneda === "USD" ? "Dólares" : "Soles"} · Saldo anterior ${c.saldoAnterior.toFixed(2)} · Saldo final ${c.saldoFinal.toFixed(2)}`;
    info.font = { size: 10, bold: true, color: { argb: argb(GRUPO_COLOR[c.grupo]) } };
    ws.mergeCells(6, 1, 6, 7);

    cabecera(ws, 8, ["Fecha", "Documento", "Concepto", "Cliente / proveedor", "Debe", "Haber", "Saldo"]);
    const anterior = ws.getRow(9);
    anterior.values = ["", "", "Saldo anterior", "", null, null, c.saldoAnterior];
    filaDatos(anterior, false, [5, 6, 7], c.moneda);
    anterior.getCell(3).font = { italic: true, color: { argb: argb(colores.texto2) } };
    let r = 10;
    c.movimientos.forEach((x, i) => {
      const row = ws.getRow(r++);
      row.values = [fechaDMA(x.fecha), x.documento || "", x.concepto || "", x.tercero || "", x.debe || null, x.haber || null, x.saldo];
      filaDatos(row, i % 2 === 1, [5, 6, 7], c.moneda);
      row.getCell(7).font = { bold: true, color: { argb: argb(colores.carbon) } };
    });
    ws.autoFilter = { from: { row: 8, column: 1 }, to: { row: Math.max(r - 1, 9), column: 7 } };
    const tot = ws.getRow(r + 1);
    tot.values = ["", "", "Totales del periodo", "", c.debe, c.haber, c.saldoFinal];
    filaTotal(tot, [5, 6, 7], c.moneda);
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

module.exports = { libroMayorExcel };
