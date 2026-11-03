// Antigüedad de saldos (cuentas por cobrar y por pagar): reparte lo que queda
// pendiente de un documento entre sus vencimientos y clasifica cada parte por
// días de atraso. Lo pagado (y las notas de crédito) cubre primero la cuota
// más antigua.
const { r2, hoyLima } = require("./cobros.service");

const TRAMOS = ["porVencer", "d1_30", "d31_60", "d61_90", "d90mas"];
const tramosVacios = () => Object.fromEntries(TRAMOS.map((t) => [t, 0]));

const fechaLima = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date(d));

// Días entre dos fechas aaaa-mm-dd (positivo si "hasta" es posterior).
const diasEntre = (desde, hasta) =>
  Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86400000);

function tramoDe(diasVencido) {
  if (diasVencido <= 0) return "porVencer";
  if (diasVencido <= 30) return "d1_30";
  if (diasVencido <= 60) return "d31_60";
  if (diasVencido <= 90) return "d61_90";
  return "d90mas";
}

// Cronograma de vencimientos: las cuotas del crédito, o todo al contado en la
// fecha de emisión. cuotas: [{ monto, fechaVencimiento }].
function cronograma({ formaPago, cuotas, fechaEmision, monto }) {
  if (formaPago === "CREDITO" && Array.isArray(cuotas) && cuotas.length) {
    return cuotas.map((q) => ({ monto: q.monto, fecha: String(q.fechaVencimiento).slice(0, 10) }));
  }
  return [{ monto, fecha: fechaLima(fechaEmision) }];
}

// Reparte "saldo" entre las cuotas del cronograma (lo ya cubierto se descuenta
// de las primeras) y devuelve { tramos, vencimiento, diasVencido } donde
// vencimiento es la primera cuota con saldo y diasVencido su atraso.
function antiguedad(cuotas, saldo, hoy = hoyLima()) {
  const tramos = tramosVacios();
  if (!(saldo > 0.009)) return { tramos, vencimiento: null, diasVencido: 0 };

  const programado = r2(cuotas.reduce((a, q) => a + q.monto, 0));
  let cubierto = r2(Math.max(programado - saldo, 0));
  // Si el saldo supera lo programado (p. ej. una nota de débito), el exceso va a la última cuota.
  const exceso = r2(Math.max(saldo - programado, 0));
  let vencimiento = null;

  cuotas.forEach((q, i) => {
    let pendiente = r2(q.monto + (i === cuotas.length - 1 ? exceso : 0));
    const usado = Math.min(cubierto, pendiente);
    cubierto = r2(cubierto - usado);
    pendiente = r2(pendiente - usado);
    if (pendiente <= 0.009) return;
    vencimiento ??= q.fecha;
    const t = tramoDe(diasEntre(q.fecha, hoy));
    tramos[t] = r2(tramos[t] + pendiente);
  });

  return { tramos, vencimiento, diasVencido: vencimiento ? Math.max(diasEntre(vencimiento, hoy), 0) : 0 };
}

// Suma tramos de b en a (in place) y devuelve a.
function sumarTramos(a, b) {
  for (const t of TRAMOS) a[t] = r2(a[t] + (b[t] || 0));
  return a;
}

// Plazo SUNAT para depositar una detracción: 5.º día hábil del mes siguiente
// al de la emisión (aaaa-mm-dd). Cuenta lunes a viernes, sin feriados.
function plazoDetraccion(fechaEmisionIso) {
  const [anio, mes] = fechaEmisionIso.split("-").map(Number);
  const d = new Date(Date.UTC(anio, mes, 1)); // día 1 del mes siguiente
  let habiles = 0;
  for (;;) {
    const dia = d.getUTCDay();
    if (dia !== 0 && dia !== 6 && ++habiles === 5) return d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

module.exports = { TRAMOS, tramosVacios, cronograma, antiguedad, sumarTramos, diasEntre, fechaLima, plazoDetraccion };
