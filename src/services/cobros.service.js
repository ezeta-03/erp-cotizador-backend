// Cuentas por cobrar de comprobantes emitidos: cuánto debe pagar el cliente
// (total − detracción − notas de crédito parciales + notas de débito), cuánto
// falta, cuánto de la detracción está depositado, la retención y si alguna
// cuota ya venció. Los montos van en la moneda del comprobante, salvo la
// detracción, que SUNAT fija en soles.
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

const TIPOS_PAGO = ["COBRO", "DETRACCION", "RETENCION"];
const MEDIOS_PAGO = ["TRANSFERENCIA", "DEPOSITO", "EFECTIVO", "YAPE_PLIN", "CHEQUE", "OTRO"];
const TOLERANCIA = 0.009;
// Motivos de nota de crédito que anulan el comprobante completo (catálogo 09).
const MOTIVOS_NC_TOTAL = ["01", "02", "06"];

const hoyLima = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
const suma = (lista) => r2(lista.reduce((a, x) => a + x.monto, 0));

// Detracción expresada en la moneda del comprobante (en soles es la misma).
const detraccionEnMoneda = (c) =>
  !c.detraccionMonto ? 0 : c.moneda === "PEN" ? c.detraccionMonto : r2(c.total * c.detraccionPorcentaje / 100);

// c: comprobante; pagos [{ tipo, monto }]; notas aceptadas que lo modifican [{ tipo, motivoCodigo, total }].
// Devuelve null para lo que no se cobra (notas, no aceptados).
function resumenCobro(c, pagos, notas = []) {
  if (!["FACTURA", "BOLETA"].includes(c.tipo) || c.estado !== "ACEPTADO") return null;

  const anulado = notas.some((n) => n.tipo === "NOTA_CREDITO" && MOTIVOS_NC_TOTAL.includes(n.motivoCodigo));
  const creditos = r2(notas.filter((n) => n.tipo === "NOTA_CREDITO").reduce((a, n) => a + n.total, 0));
  const debitos = r2(notas.filter((n) => n.tipo === "NOTA_DEBITO").reduce((a, n) => a + n.total, 0));

  const netoCliente = r2(c.total - detraccionEnMoneda(c) - creditos + debitos);
  const cobrado = suma(pagos.filter((p) => p.tipo === "COBRO"));
  const retenido = suma(pagos.filter((p) => p.tipo === "RETENCION"));
  const detraccionPagada = suma(pagos.filter((p) => p.tipo === "DETRACCION"));
  const saldo = r2(Math.max(netoCliente - cobrado - retenido, 0));
  const saldoDetraccion = r2(Math.max((c.detraccionMonto || 0) - detraccionPagada, 0));
  const retencionEsperada = c.agenteRetencion ? r2(c.total * 0.03) : 0;

  // Próximo vencimiento: la primera cuota que lo cobrado aún no cubre.
  let proximoVencimiento = null;
  if (c.formaPago === "CREDITO" && Array.isArray(c.cuotas)) {
    let acumulado = 0;
    for (const q of c.cuotas) {
      acumulado = r2(acumulado + q.monto);
      if (acumulado > cobrado + retenido + TOLERANCIA) { proximoVencimiento = q.fechaVencimiento; break; }
    }
  }

  let estado;
  if (anulado) estado = "ANULADO";
  else if (saldo <= TOLERANCIA && saldoDetraccion <= TOLERANCIA) estado = "PAGADO";
  else if (proximoVencimiento && proximoVencimiento < hoyLima()) estado = "VENCIDO";
  else if (cobrado > 0 || retenido > 0 || detraccionPagada > 0) estado = "PARCIAL";
  else estado = "PENDIENTE";

  return {
    estado, moneda: c.moneda, netoCliente, cobrado, retenido, retencionEsperada, saldo,
    notasCredito: creditos, notasDebito: debitos,
    detraccion: c.detraccionMonto || 0, detraccionPagada, saldoDetraccion, proximoVencimiento,
  };
}

module.exports = { resumenCobro, TIPOS_PAGO, MEDIOS_PAGO, MOTIVOS_NC_TOTAL, TOLERANCIA, hoyLima, r2 };
