const { recaudoVsCobrar, MAXIMO_MESES } = require("../services/reportes.service");
const { mesesEntre } = require("../services/flujoEfectivo.service");
const { hoyLima } = require("../services/cobros.service");

// Recaudado vs por cobrar: GET /api/reportes/recaudo?desde&hasta (aaaa-mm-dd).
// Por defecto, del 1 de enero al día de hoy.
exports.recaudo = async (req, res) => {
  try {
    const hoy = hoyLima();
    const valida = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || "");
    const desde = valida(req.query.desde) ? req.query.desde : `${hoy.slice(0, 4)}-01-01`;
    const hasta = valida(req.query.hasta) ? req.query.hasta : hoy;
    if (desde > hasta) return res.status(400).json({ message: "La fecha inicial es posterior a la final" });
    if (mesesEntre(desde, hasta).length > MAXIMO_MESES) {
      return res.status(400).json({ message: `El periodo puede abarcar como máximo ${MAXIMO_MESES} meses` });
    }
    res.json(await recaudoVsCobrar(desde, hasta));
  } catch (error) {
    console.error("❌ Error en reporte de recaudo:", error);
    res.status(500).json({ message: "Error generando el reporte de recaudo", error: error.message });
  }
};
