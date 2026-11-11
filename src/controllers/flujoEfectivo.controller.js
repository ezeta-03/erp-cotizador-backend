const { flujoEfectivo, MAXIMO_MESES, mesesEntre } = require("../services/flujoEfectivo.service");
const { hoyLima } = require("../services/cobros.service");
const { htmlAPdf } = require("../services/pdf.service");
const { emisor } = require("../config/emisor");
const flujoEfectivoPdf = require("../templates/flujoEfectivoPdf.template");
const { flujoEfectivoExcel } = require("../services/flujoEfectivoExcel");

// Estado de Flujo de Efectivo: GET /?desde&hasta[&formato=xlsx|pdf].
// Por defecto, del 1 de enero al día de hoy.
function periodo(query) {
  const hoy = hoyLima();
  const valida = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || "");
  const desde = valida(query.desde) ? query.desde : `${hoy.slice(0, 4)}-01-01`;
  const hasta = valida(query.hasta) ? query.hasta : hoy;
  if (desde > hasta) throw Object.assign(new Error("La fecha inicial es posterior a la final"), { status: 400 });
  if (mesesEntre(desde, hasta).length > MAXIMO_MESES) {
    throw Object.assign(new Error(`El periodo puede abarcar como máximo ${MAXIMO_MESES} meses`), { status: 400 });
  }
  return { desde, hasta };
}

exports.obtener = async (req, res) => {
  try {
    const { desde, hasta } = periodo(req.query);
    const f = await flujoEfectivo(desde, hasta);
    const nombre = `flujo-de-efectivo-${desde}-al-${hasta}`;
    if (req.query.formato === "xlsx") {
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${nombre}.xlsx"`);
      return res.send(await flujoEfectivoExcel(f, { empresa: emisor.razonSocial, ruc: emisor.ruc }));
    }
    if (req.query.formato === "pdf") {
      const pdf = await htmlAPdf(flujoEfectivoPdf({ ...f, empresa: emisor.razonSocial, ruc: emisor.ruc }), {
        preferCSSPageSize: true, displayHeaderFooter: true, headerTemplate: "<div></div>", footerTemplate: flujoEfectivoPdf.piePagina,
      });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${nombre}.pdf"`);
      return res.send(pdf);
    }
    res.json(f);
  } catch (error) {
    if (Number.isInteger(error.status) && error.status < 600) return res.status(error.status).json({ message: error.message });
    console.error("❌ Error generando el flujo de efectivo:", error);
    res.status(500).json({ message: "Error generando el flujo de efectivo", error: error.message });
  }
};
