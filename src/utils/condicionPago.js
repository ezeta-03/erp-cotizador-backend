// Condición de pago de clientes, cotizaciones y proveedores de compras:
// CONTADO, o CREDITO a N días (vence N días después de la emisión).
const CONDICIONES = ["CONTADO", "CREDITO"];

// Devuelve { condicionPago, diasCredito } validado, o lanza un Error con
// status 400. Sin datos en el body devuelve null (no cambia nada).
function leerCondicion(body = {}) {
  if (body.condicionPago === undefined && body.diasCredito === undefined) return null;
  const condicionPago = String(body.condicionPago || "CONTADO").toUpperCase();
  if (!CONDICIONES.includes(condicionPago)) {
    const e = new Error("condicionPago debe ser CONTADO o CREDITO");
    e.status = 400;
    throw e;
  }
  if (condicionPago === "CONTADO") return { condicionPago, diasCredito: null };
  const diasCredito = Number(body.diasCredito);
  if (!Number.isInteger(diasCredito) || diasCredito < 1 || diasCredito > 365) {
    const e = new Error("Los días de crédito deben ser un número entero entre 1 y 365");
    e.status = 400;
    throw e;
  }
  return { condicionPago, diasCredito };
}

module.exports = { CONDICIONES, leerCondicion };
