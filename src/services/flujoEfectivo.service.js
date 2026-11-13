// Estado de Flujo de Efectivo (método directo): solo dinero que entró o salió
// de verdad, por la fecha del cobro o pago, y con una columna por mes.
//  - Entradas: cobros a clientes y detracciones depositadas en nuestra cuenta
//    del Banco de la Nación, con detalle por cliente. Las retenciones no son
//    dinero que entra (el cliente las paga a SUNAT) y quedan fuera.
//  - Salidas: pagos y detracciones a proveedores por categoría de gasto (con
//    detalle por proveedor) y cuotas de alquiler de paneles pagadas.
//  - Salidas por línea de negocio: lo pagado a cada proveedor repartido según
//    sus porcentajes.
// Dos vistas:
//  - Nivel superior (entradas, salidas, neto, acumulado): en soles, como antes.
//    Los montos en dólares se pasan a soles con el tipo de cambio del pago.
//  - `monedas.PEN` y `monedas.USD`: cada moneda por separado, con el monto en
//    la moneda de la cuenta donde entró o salió el dinero, y saldo inicial y
//    final de cada mes según el saldo de las cuentas de esa moneda (Caja y
//    Bancos). Si una cuenta de esa moneda aún no tiene saldo inicial a esa
//    fecha, el saldo de ese mes queda en null (en blanco).
const prisma = require("../config/prisma");
const { r2 } = require("./cobros.service");
const { fechaLima } = require("./antiguedad.service");
const { repartosPorProveedor, acumuladorLineas } = require("./lineasNegocio.service");
const { movimientosDe } = require("./cajaBancos.service");

const MAXIMO_MESES = 24;
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];
const MONEDAS_FLUJO = ["PEN", "USD"];

const inicioDia = (f) => new Date(`${f}T00:00:00-05:00`);
const finDia = (f) => new Date(`${f}T23:59:59.999-05:00`);

// ["2026-01", "2026-02", …] entre dos fechas aaaa-mm-dd.
function mesesEntre(desde, hasta) {
  const lista = [];
  let [a, m] = desde.slice(0, 7).split("-").map(Number);
  const fin = hasta.slice(0, 7);
  for (;;) {
    const ym = `${a}-${String(m).padStart(2, "0")}`;
    lista.push(ym);
    if (ym >= fin) break;
    m += 1;
    if (m > 12) { m = 1; a += 1; }
  }
  return lista;
}
const etiquetaMes = (ym) => `${MESES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`;

// Mes anterior de "aaaa-mm" y último día de "aaaa-mm" como "aaaa-mm-dd".
function mesAnterior(ym) {
  let [a, m] = ym.split("-").map(Number);
  m -= 1;
  if (m === 0) { m = 12; a -= 1; }
  return `${a}-${String(m).padStart(2, "0")}`;
}
const ultimoDia = (ym) => {
  const [a, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
};

// Monto en soles de un cobro/pago. monedaPago: la del documento (la detracción
// siempre es en soles).
function enSoles({ monto, monedaPago, tipoCambioCuenta, tipoCambioDocumento }) {
  if (monedaPago !== "USD") return monto;
  return r2(monto * (tipoCambioCuenta || tipoCambioDocumento || 1));
}

// Moneda y monto de un movimiento según la cuenta donde entró o salió.
// Sin cuenta (movimientos anteriores a Caja y Bancos): se toma en soles.
function enMonedaCuenta(p, montoSoles, montoOriginal) {
  if (p.cuentaFinanciera) return { moneda: p.cuentaFinanciera.moneda, monto: r2(p.montoCuenta ?? montoOriginal) };
  return { moneda: "PEN", monto: montoSoles };
}

// Agrupador de filas con columnas por mes y un detalle (cliente o proveedor).
function agrupador() {
  const filas = new Map();
  return {
    sumar(clave, nombre, ym, monto, detalle) {
      if (!filas.has(clave)) filas.set(clave, { clave, nombre, meses: {}, total: 0, detalle: new Map() });
      const f = filas.get(clave);
      f.meses[ym] = (f.meses[ym] || 0) + monto;
      f.total += monto;
      if (detalle) {
        if (!f.detalle.has(detalle)) f.detalle.set(detalle, { nombre: detalle, meses: {}, total: 0 });
        const d = f.detalle.get(detalle);
        d.meses[ym] = (d.meses[ym] || 0) + monto;
        d.total += monto;
      }
    },
    // Filas ordenadas por total, con % sobre el total del bloque y los montos redondeados.
    cerrar(meses, orden = null) {
      const redondear = (x) => ({ ...x, total: r2(x.total), meses: Object.fromEntries(meses.map((m) => [m, r2(x.meses[m] || 0)])) });
      const lista = [...filas.values()].map((f) => ({
        ...redondear(f),
        detalle: [...f.detalle.values()].map(redondear).sort((a, b) => b.total - a.total),
      }));
      const total = r2(lista.reduce((a, f) => a + f.total, 0));
      const conPct = (x) => ({ ...x, porcentaje: total ? r2((x.total / total) * 100) : 0 });
      const ordenadas = orden ? lista.sort(orden) : lista.sort((a, b) => b.total - a.total);
      return {
        filas: ordenadas.map((f) => ({ ...conPct(f), detalle: f.detalle.map(conPct) })),
        totales: { total, meses: Object.fromEntries(meses.map((m) => [m, r2(lista.reduce((a, f) => a + (f.meses[m] || 0), 0))])) },
      };
    },
  };
}

// Saldo de una cuenta al cierre de un mes ("aaaa-mm"). Null si la cuenta aún no
// tiene saldo inicial a esa fecha.
function cierreDe(cuenta, movs, ym) {
  const fin = ultimoDia(ym);
  if (cuenta.corte > fin) return null;
  let saldo = cuenta.saldoInicial;
  for (const m of movs) if (m.fecha <= fin) saldo += m.ingreso - m.egreso;
  return r2(saldo);
}

// Saldo de todas las cuentas de una moneda al cierre de un mes. Null si no hay
// cuentas en esa moneda o alguna todavía no tiene saldo inicial.
function saldoAlCierre(cuentasMoneda, movsPorCuenta, ym) {
  if (!cuentasMoneda.length) return null;
  let total = 0;
  for (const c of cuentasMoneda) {
    const v = cierreDe(c, movsPorCuenta.get(c.id), ym);
    if (v === null) return null;
    total += v;
  }
  return r2(total);
}

async function flujoEfectivo(desde, hasta) {
  const meses = mesesEntre(desde, hasta);
  const rango = { gte: inicioDia(desde), lte: finDia(hasta) };
  const [cobros, pagos, cuotas, categorias, repartos, cuentasDb] = await Promise.all([
    prisma.pagoComprobante.findMany({
      where: { fecha: rango },
      select: {
        tipo: true, fecha: true, monto: true, tipoCambioCuenta: true, montoCuenta: true,
        cuentaFinanciera: { select: { moneda: true } },
        comprobante: { select: { moneda: true, tipoCambio: true, clienteNombre: true } },
      },
    }),
    prisma.pagoCuentaPorPagar.findMany({
      where: { fecha: rango, cuenta: { anulado: false } },
      select: {
        tipo: true, fecha: true, monto: true, tipoCambioCuenta: true, montoCuenta: true,
        cuentaFinanciera: { select: { moneda: true } },
        cuenta: {
          select: {
            moneda: true, tipoCambio: true, proveedorId: true, categoriaGastoId: true,
            proveedor: { select: { razonSocial: true } },
          },
        },
      },
    }),
    prisma.proveedorCuota.findMany({
      where: { estado: "CANCELADO", fechaPago: rango },
      select: {
        fechaPago: true, monto: true, igv: true, montoCuenta: true,
        cuentaFinanciera: { select: { moneda: true } },
        proveedor: { select: { nombre: true, razonSocial: true } },
      },
    }),
    prisma.categoriaGasto.findMany({ include: { padre: { select: { nombre: true } } } }),
    repartosPorProveedor(),
    prisma.cuentaFinanciera.findMany({ select: { id: true, moneda: true, saldoInicial: true, fechaSaldoInicial: true } }),
  ]);

  // ── Cuentas: saldo al cierre de cada mes, por moneda ──
  const cuentas = await Promise.all(cuentasDb.map(async (c) => ({
    id: c.id,
    moneda: c.moneda,
    saldoInicial: c.saldoInicial,
    corte: fechaLima(c.fechaSaldoInicial),
    movs: await movimientosDe(c, { hasta }),
  })));
  const movsPorCuenta = new Map(cuentas.map((c) => [c.id, c.movs]));

  // Bloques por moneda (vista PEN/USD) además del consolidado en soles.
  const porMoneda = Object.fromEntries(MONEDAS_FLUJO.map((mon) => [mon, {
    entradas: agrupador(), salidas: agrupador(), porLinea: agrupador(), lineas: acumuladorLineas(repartos),
  }]));
  const bloqueDe = (mon) => porMoneda[mon] || (porMoneda[mon] = {
    entradas: agrupador(), salidas: agrupador(), porLinea: agrupador(), lineas: acumuladorLineas(repartos),
  });

  // ── Entradas ──
  const entradas = agrupador();
  let retenciones = 0;
  const TIPO_ENTRADA = { COBRO: "Cobros a clientes", DETRACCION: "Detracciones recibidas (Banco de la Nación)" };
  for (const p of cobros) {
    const monto = enSoles({
      monto: p.monto, monedaPago: p.tipo === "DETRACCION" ? "PEN" : p.comprobante.moneda,
      tipoCambioCuenta: p.tipoCambioCuenta, tipoCambioDocumento: p.comprobante.tipoCambio,
    });
    if (p.tipo === "RETENCION") {
      retenciones += monto;
      continue;
    }
    const ym = fechaLima(p.fecha).slice(0, 7);
    entradas.sumar(p.tipo, TIPO_ENTRADA[p.tipo] || p.tipo, ym, monto, p.comprobante.clienteNombre);
    const mon = enMonedaCuenta(p, monto, p.monto);
    bloqueDe(mon.moneda).entradas.sumar(p.tipo, TIPO_ENTRADA[p.tipo] || p.tipo, ym, mon.monto, p.comprobante.clienteNombre);
  }

  // ── Salidas ──
  const nombreCategoria = new Map(categorias.map((c) => [c.id, c.padre ? `${c.padre.nombre} › ${c.nombre}` : c.nombre]));
  const alquiler = categorias.find((c) => !c.padreId && c.nombre === "Alquiler de paneles");
  const salidas = agrupador();
  const lineas = acumuladorLineas(repartos);
  const porLinea = agrupador();
  for (const p of pagos) {
    const c = p.cuenta;
    const ym = fechaLima(p.fecha).slice(0, 7);
    const monto = enSoles({
      monto: p.monto, monedaPago: p.tipo === "DETRACCION" ? "PEN" : c.moneda,
      tipoCambioCuenta: p.tipoCambioCuenta, tipoCambioDocumento: c.tipoCambio,
    });
    const clave = c.categoriaGastoId ? `C${c.categoriaGastoId}` : "SIN";
    const nombre = nombreCategoria.get(c.categoriaGastoId) || "Sin categoría";
    salidas.sumar(clave, nombre, ym, monto, c.proveedor.razonSocial);
    for (const parte of lineas.agregar(c.proveedorId, monto)) porLinea.sumar(parte.clave, parte.nombre, ym, parte.monto);

    const mon = enMonedaCuenta(p, monto, p.monto);
    const b = bloqueDe(mon.moneda);
    b.salidas.sumar(clave, nombre, ym, mon.monto, c.proveedor.razonSocial);
    for (const parte of b.lineas.agregar(c.proveedorId, mon.monto)) b.porLinea.sumar(parte.clave, parte.nombre, ym, parte.monto);
  }
  for (const q of cuotas) {
    const ym = fechaLima(q.fechaPago).slice(0, 7);
    const monto = r2(q.monto + q.igv);
    const clave = alquiler ? `C${alquiler.id}` : "PANELES";
    const proveedor = q.proveedor.razonSocial || q.proveedor.nombre;
    salidas.sumar(clave, "Alquiler de paneles", ym, monto, proveedor);
    for (const parte of lineas.agregar(null, monto)) porLinea.sumar(parte.clave, parte.nombre, ym, parte.monto);

    const mon = enMonedaCuenta(q, monto, monto);
    const b = bloqueDe(mon.moneda);
    b.salidas.sumar(clave, "Alquiler de paneles", ym, mon.monto, proveedor);
    for (const parte of b.lineas.agregar(null, mon.monto)) b.porLinea.sumar(parte.clave, parte.nombre, ym, parte.monto);
  }

  const ent = entradas.cerrar(meses);
  const sal = salidas.cerrar(meses);
  // Líneas por monto, con "Sin línea de negocio" al final.
  const ordenLineas = (a, b) => (a.clave === "SIN") - (b.clave === "SIN") || b.total - a.total;
  const lin = porLinea.cerrar(meses, ordenLineas);

  const neto = { total: r2(ent.totales.total - sal.totales.total), meses: {} };
  const acumulado = {};
  let corrido = 0;
  for (const m of meses) {
    neto.meses[m] = r2(ent.totales.meses[m] - sal.totales.meses[m]);
    corrido = r2(corrido + neto.meses[m]);
    acumulado[m] = corrido;
  }

  // ── Vista por moneda ──
  const monedas = {};
  for (const mon of MONEDAS_FLUJO) {
    const b = bloqueDe(mon);
    const e = b.entradas.cerrar(meses);
    const s = b.salidas.cerrar(meses);
    const l = b.porLinea.cerrar(meses, ordenLineas);
    const netoMon = { total: r2(e.totales.total - s.totales.total), meses: {} };
    for (const m of meses) netoMon.meses[m] = r2(e.totales.meses[m] - s.totales.meses[m]);

    const cuentasMon = cuentas.filter((c) => c.moneda === mon);
    const saldoInicial = {};
    const saldoFinal = {};
    for (const m of meses) {
      // El saldo inicial del mes es el saldo de las cuentas al cierre del mes anterior.
      saldoInicial[m] = saldoAlCierre(cuentasMon, movsPorCuenta, mesAnterior(m));
      saldoFinal[m] = saldoInicial[m] === null ? null : r2(saldoInicial[m] + netoMon.meses[m]);
    }
    monedas[mon] = {
      cuentas: cuentasMon.length,
      saldoInicial, saldoFinal,
      entradas: e, salidas: s, salidasPorLinea: l, neto: netoMon,
    };
  }

  return {
    desde, hasta,
    meses: meses.map((m) => ({ clave: m, etiqueta: etiquetaMes(m) })),
    entradas: ent, salidas: sal, salidasPorLinea: lin,
    neto, acumulado,
    monedas,
    retencionesExcluidas: r2(retenciones),
  };
}

module.exports = { flujoEfectivo, MAXIMO_MESES, mesesEntre };
