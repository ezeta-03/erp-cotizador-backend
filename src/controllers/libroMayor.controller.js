const XLSX = require("xlsx");
const { libroMayor } = require("../services/libroMayor.service");
const { hoyLima } = require("../services/cobros.service");
const { htmlAPdf } = require("../services/pdf.service");
const { emisor } = require("../config/emisor");
const libroMayorPdf = require("../templates/libroMayorPdf.template");

// Libro Mayor: GET /?desde&hasta[&formato=xlsx|pdf]. Por defecto, el mes actual.

const GRUPO_LABEL = { CAJA_BANCOS: "Caja y Bancos", INGRESOS: "Ingresos", COSTO_VENTA: "Costo de venta", GASTO_OPERATIVO: "Gasto operativo" };

function periodo(query) {
  const hoy = hoyLima();
  const valida = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || "");
  const desde = valida(query.desde) ? query.desde : `${hoy.slice(0, 7)}-01`;
  const hasta = valida(query.hasta) ? query.hasta : hoy;
  if (desde > hasta) throw Object.assign(new Error("La fecha inicial es posterior a la final"), { status: 400 });
  if (desde.slice(0, 4) !== hasta.slice(0, 4)) throw Object.assign(new Error("El periodo debe estar dentro de un mismo año"), { status: 400 });
  return { desde, hasta };
}

const fechaDMA = (iso) => iso.split("-").reverse().join("/");

// Nombre de hoja de Excel: máximo 31 caracteres, sin []:*?/\ y sin repetir.
function nombreHoja(nombre, usados) {
  const base = nombre.replace(/[[\]:*?/\\]/g, "-").slice(0, 28);
  let n = base;
  for (let i = 2; usados.has(n); i++) n = `${base.slice(0, 26)} ${i}`;
  usados.add(n);
  return n;
}

function libroExcel(m) {
  const wb = XLSX.utils.book_new();
  const resumen = [
    [`Libro Mayor — ${emisor.razonSocial || ""}`],
    [`Del ${fechaDMA(m.desde)} al ${fechaDMA(m.hasta)}`],
    [],
    ["Grupo", "Cuenta", "Moneda", "Saldo anterior", "Debe", "Haber", "Saldo final"],
    ...m.cuentas.map((c) => [GRUPO_LABEL[c.grupo], c.nombre, c.moneda, c.saldoAnterior, c.debe, c.haber, c.saldoFinal]),
    [],
    ["Resultado del periodo (ventas − costo de venta − gasto operativo, S/)", "", "", "", "", "", m.resultadoPeriodo],
  ];
  const hojaResumen = XLSX.utils.aoa_to_sheet(resumen);
  hojaResumen["!cols"] = [{ wch: 18 }, { wch: 40 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, hojaResumen, "Resumen");

  const usados = new Set(["Resumen"]);
  for (const c of m.cuentas) {
    const filas = [
      [c.nombre, "", "", "", "", "", c.moneda],
      [],
      ["Fecha", "Documento", "Concepto", "Cliente / proveedor", "Debe", "Haber", "Saldo"],
      ["", "", "Saldo anterior", "", "", "", c.saldoAnterior],
      ...c.movimientos.map((x) => [fechaDMA(x.fecha), x.documento || "", x.concepto || "", x.tercero || "", x.debe || 0, x.haber || 0, x.saldo]),
      ["", "", "Totales del periodo", "", c.debe, c.haber, c.saldoFinal],
    ];
    const hoja = XLSX.utils.aoa_to_sheet(filas);
    hoja["!cols"] = [{ wch: 11 }, { wch: 18 }, { wch: 44 }, { wch: 32 }, { wch: 12 }, { wch: 12 }, { wch: 13 }];
    XLSX.utils.book_append_sheet(wb, hoja, nombreHoja(c.nombre, usados));
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

exports.obtener = async (req, res) => {
  try {
    const { desde, hasta } = periodo(req.query);
    const m = await libroMayor(desde, hasta);
    const nombre = `libro-mayor-${desde}-al-${hasta}`;
    if (req.query.formato === "xlsx") {
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${nombre}.xlsx"`);
      return res.send(libroExcel(m));
    }
    if (req.query.formato === "pdf") {
      const pdf = await htmlAPdf(libroMayorPdf({ ...m, empresa: emisor.razonSocial, ruc: emisor.ruc }));
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${nombre}.pdf"`);
      return res.send(pdf);
    }
    res.json(m);
  } catch (error) {
    if (Number.isInteger(error.status) && error.status < 600) return res.status(error.status).json({ message: error.message });
    console.error("❌ Error generando el libro mayor:", error);
    res.status(500).json({ message: "Error generando el libro mayor", error: error.message });
  }
};
