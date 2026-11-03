const { libroMayor } = require("../services/libroMayor.service");
const { hoyLima } = require("../services/cobros.service");
const { htmlAPdf } = require("../services/pdf.service");
const { emisor } = require("../config/emisor");
const libroMayorPdf = require("../templates/libroMayorPdf.template");
const { libroMayorExcel } = require("../services/libroMayorExcel");

// Libro Mayor: GET /?desde&hasta[&formato=xlsx|pdf]. Por defecto, el mes actual.

function periodo(query) {
  const hoy = hoyLima();
  const valida = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || "");
  const desde = valida(query.desde) ? query.desde : `${hoy.slice(0, 7)}-01`;
  const hasta = valida(query.hasta) ? query.hasta : hoy;
  if (desde > hasta) throw Object.assign(new Error("La fecha inicial es posterior a la final"), { status: 400 });
  if (desde.slice(0, 4) !== hasta.slice(0, 4)) throw Object.assign(new Error("El periodo debe estar dentro de un mismo año"), { status: 400 });
  return { desde, hasta };
}

exports.obtener = async (req, res) => {
  try {
    const { desde, hasta } = periodo(req.query);
    const m = await libroMayor(desde, hasta);
    const nombre = `libro-mayor-${desde}-al-${hasta}`;
    if (req.query.formato === "xlsx") {
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${nombre}.xlsx"`);
      return res.send(await libroMayorExcel(m, { empresa: emisor.razonSocial, ruc: emisor.ruc }));
    }
    if (req.query.formato === "pdf") {
      const pdf = await htmlAPdf(libroMayorPdf({ ...m, empresa: emisor.razonSocial, ruc: emisor.ruc }), {
        preferCSSPageSize: true, displayHeaderFooter: true, headerTemplate: "<div></div>", footerTemplate: libroMayorPdf.piePagina,
      });
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
