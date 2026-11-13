// Estado de Flujo de Efectivo en Excel, con la misma identidad que el Libro
// Mayor. Como la pantalla: una sección por moneda (soles y dólares), cada una con
// saldo inicial del mes, entradas, salidas, flujo neto y saldo final acumulado,
// seguida del detalle por cliente/proveedor. La segunda hoja muestra las salidas
// por línea de negocio, también por moneda.
// Sin agrupación de filas (outline): Excel repara el archivo si el nivel de
// esquema no coincide con las filas.
const ExcelJS = require("exceljs");
const { colores, logoPath } = require("../config/marca");
const { piezas } = require("./libroMayorExcel");

const { argb, relleno, encabezado, cabecera, filaDatos, filaTotal, fechaDMA } = piezas;

const MONEDAS = [
  { codigo: "PEN", titulo: "Soles (PEN)" },
  { codigo: "USD", titulo: "Dólares (USD)" },
];

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

// Título de sección de una moneda (franja clara a todo lo ancho de la tabla).
function bandaMoneda(ws, fila, texto, columnas) {
  const row = ws.getRow(fila);
  row.getCell(1).value = texto.toUpperCase();
  row.getCell(1).font = { bold: true, size: 11, color: { argb: argb(colores.naranjaTexto) } };
  for (let c = 1; c <= columnas; c += 1) row.getCell(c).fill = relleno(colores.naranjaClaro);
  return fila + 1;
}

// Una fila de resumen (saldo inicial, entradas, salidas, neto o saldo final).
function filaResumen(ws, fila, m, mon, monedas, { etiqueta, valores, total = null, color = colores.carbon, negrita = false, total_fila = false }) {
  const row = ws.getRow(fila);
  row.values = [etiqueta, ...m.meses.map((x) => (valores && valores[x.clave] != null ? valores[x.clave] : null)), total, null];
  if (total_fila) filaTotal(row, monedas, mon);
  else filaDatos(row, false, monedas, mon);
  row.getCell(1).font = { bold: negrita || total_fila, color: { argb: argb(color) } };
  return fila + 1;
}

// Escribe un bloque (título, filas con detalle, total) y devuelve la fila siguiente.
function bloque(ws, fila, m, { titulo, color, datos, conDetalle = true, moneda = "PEN" }, monedas) {
  const t = ws.getRow(fila++);
  t.getCell(1).value = titulo.toUpperCase();
  t.getCell(1).font = { bold: true, size: 10, color: { argb: argb(color) } };
  const pct = 2 + m.meses.length + 1;
  datos.filas.forEach((f, i) => {
    const row = ws.getRow(fila++);
    row.values = [f.nombre, ...m.meses.map((x) => f.meses[x.clave] || null), f.total, f.porcentaje / 100];
    filaDatos(row, i % 2 === 1, monedas, moneda);
    row.getCell(1).font = { bold: true, color: { argb: argb(colores.carbon) } };
    row.getCell(pct).numFmt = "0.0%";
    row.getCell(pct).alignment = { horizontal: "right" };
    if (!conDetalle) return;
    for (const d of f.detalle) {
      const r = ws.getRow(fila++);
      r.values = [`    ${d.nombre}`, ...m.meses.map((x) => d.meses[x.clave] || null), d.total, f.total ? d.total / f.total : 0];
      filaDatos(r, false, monedas, moneda);
      r.eachCell({ includeEmpty: true }, (c) => { c.font = { size: 9, color: { argb: argb(colores.texto2) } }; });
      r.getCell(pct).numFmt = "0.0%";
      r.getCell(pct).alignment = { horizontal: "right" };
    }
  });
  if (!datos.filas.length) {
    const row = ws.getRow(fila++);
    row.getCell(1).value = "Sin movimientos en el periodo";
    row.getCell(1).font = { italic: true, color: { argb: argb(colores.texto3) } };
  }
  const tot = ws.getRow(fila++);
  tot.values = [`Total ${titulo.toLowerCase()}`, ...m.meses.map((x) => datos.totales.meses[x.clave]), datos.totales.total, datos.totales.total ? 1 : null];
  filaTotal(tot, monedas, moneda);
  tot.getCell(pct).numFmt = "0.0%";
  tot.getCell(pct).alignment = { horizontal: "right" };
  return fila + 1;
}

// Sección de una moneda en la hoja de flujo: resumen y luego detalle.
function seccionMoneda(ws, fila, m, mon, b, monedas, columnas) {
  fila = bandaMoneda(ws, fila, mon.titulo, columnas);
  if (b.cuentas === 0) {
    const n = ws.getCell(fila, 1);
    n.value = `No hay cuentas en ${mon.codigo === "USD" ? "dólares" : "soles"} en Caja y Bancos: el saldo inicial y el final no se pueden calcular.`;
    n.font = { size: 9, italic: true, color: { argb: argb(colores.texto3) } };
    fila += 1;
  }
  fila = filaResumen(ws, fila, m, mon.codigo, monedas, { etiqueta: "Saldo inicial del mes", valores: b.saldoInicial });
  fila = filaResumen(ws, fila, m, mon.codigo, monedas, { etiqueta: "Entradas", valores: b.entradas.totales.meses, total: b.entradas.totales.total, color: colores.exito });
  fila = filaResumen(ws, fila, m, mon.codigo, monedas, { etiqueta: "Salidas", valores: b.salidas.totales.meses, total: b.salidas.totales.total, color: colores.peligro });
  fila = filaResumen(ws, fila, m, mon.codigo, monedas, { etiqueta: "Flujo neto del mes", valores: b.neto.meses, total: b.neto.total, total_fila: true });
  const ultimo = m.meses[m.meses.length - 1]?.clave;
  fila = filaResumen(ws, fila, m, mon.codigo, monedas, { etiqueta: "Saldo final acumulado", valores: b.saldoFinal, total: ultimo ? b.saldoFinal[ultimo] : null, negrita: true });
  fila += 1;
  fila = bloque(ws, fila, m, { titulo: "Entradas", color: colores.exito, datos: b.entradas, moneda: mon.codigo }, monedas);
  fila = bloque(ws, fila, m, { titulo: "Salidas", color: colores.peligro, datos: b.salidas, moneda: mon.codigo }, monedas);
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
  const subtitulo = `${empresa || ""}${ruc ? ` · RUC ${ruc}` : ""} · Del ${fechaDMA(m.desde)} al ${fechaDMA(m.hasta)} · Soles y dólares por separado`;

  /* ── Flujo por moneda ── */
  const { ws, columnas, monedas } = hoja(wb, "Flujo de efectivo", m, "Estado de Flujo de Efectivo", subtitulo);
  let fila = 7;
  for (const mon of MONEDAS) {
    fila = seccionMoneda(ws, fila, m, mon, m.monedas[mon.codigo], monedas, columnas);
  }

  const notas = [
    "Solo dinero que entró o salió, por la fecha del cobro o pago. Cada moneda usa el monto de la cuenta donde entró o salió.",
    "Saldo inicial del mes = saldo de las cuentas de esa moneda al 1 del mes; en blanco si alguna cuenta aún no tiene saldo inicial a esa fecha.",
    m.retencionesExcluidas ? `No incluye retenciones de clientes (S/ ${m.retencionesExcluidas.toFixed(2)}): no son dinero que entra.` : null,
  ].filter(Boolean);
  notas.forEach((n, i) => {
    const c = ws.getCell(fila + i, 1);
    c.value = n;
    c.font = { size: 9, italic: true, color: { argb: argb(colores.texto3) } };
  });

  /* ── Por línea de negocio, por moneda ── */
  const l = hoja(wb, "Por línea de negocio", m, "Salidas por línea de negocio", subtitulo);
  let filaL = 7;
  for (const mon of MONEDAS) {
    filaL = bandaMoneda(l.ws, filaL, mon.titulo, l.columnas);
    filaL = bloque(l.ws, filaL, m, { titulo: "Salidas", color: colores.peligro, datos: m.monedas[mon.codigo].salidasPorLinea, conDetalle: false, moneda: mon.codigo }, l.monedas);
    filaL += 1;
  }
  const n = l.ws.getCell(filaL, 1);
  n.value = "Lo pagado a cada proveedor repartido según sus % por línea de negocio; sin reparto (o cuotas de paneles) va a \"Sin línea de negocio\".";
  n.font = { size: 9, italic: true, color: { argb: argb(colores.texto3) } };
  l.ws.getRow(6).getCell(1).fill = relleno(colores.naranja);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

module.exports = { flujoEfectivoExcel };
