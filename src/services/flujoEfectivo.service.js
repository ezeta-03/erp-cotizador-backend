// Estado de Flujo de Efectivo (método directo): solo dinero que entró o salió
// de verdad, por la fecha del cobro o pago, en soles y con una columna por mes.
//  - Entradas: cobros a clientes y detracciones depositadas en nuestra cuenta
//    del Banco de la Nación, con detalle por cliente. Las retenciones no son
//    dinero que entra (el cliente las paga a SUNAT) y quedan fuera.
//  - Salidas: pagos y detracciones a proveedores por categoría de gasto (con
//    detalle por proveedor) y cuotas de alquiler de paneles pagadas.
//  - Salidas por línea de negocio: lo pagado a cada proveedor repartido según
//    sus porcentajes.
// Los montos en dólares se pasan a soles con el tipo de cambio del pago (si la
// cuenta era en soles) o el del documento.
const prisma = require("../config/prisma");
const { r2 } = require("./cobros.service");
const { fechaLima } = require("./antiguedad.service");
const { repartosPorProveedor, acumuladorLineas } = require("./lineasNegocio.service");

const MAXIMO_MESES = 24;
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];

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

// Monto en soles de un cobro/pago. monedaPago: la del documento (la detracción
// siempre es en soles).
function enSoles({ monto, monedaPago, tipoCambioCuenta, tipoCambioDocumento }) {
  if (monedaPago !== "USD") return monto;
  return r2(monto * (tipoCambioCuenta || tipoCambioDocumento || 1));
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

async function flujoEfectivo(desde, hasta) {
  const meses = mesesEntre(desde, hasta);
  const rango = { gte: inicioDia(desde), lte: finDia(hasta) };
  const [cobros, pagos, cuotas, categorias, repartos] = await Promise.all([
    prisma.pagoComprobante.findMany({
      where: { fecha: rango },
      select: {
        tipo: true, fecha: true, monto: true, tipoCambioCuenta: true,
        comprobante: { select: { moneda: true, tipoCambio: true, clienteNombre: true } },
      },
    }),
    prisma.pagoCuentaPorPagar.findMany({
      where: { fecha: rango, cuenta: { anulado: false } },
      select: {
        tipo: true, fecha: true, monto: true, tipoCambioCuenta: true,
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
      select: { fechaPago: true, monto: true, igv: true, proveedor: { select: { nombre: true, razonSocial: true } } },
    }),
    prisma.categoriaGasto.findMany({ include: { padre: { select: { nombre: true } } } }),
    repartosPorProveedor(),
  ]);

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
    entradas.sumar(p.tipo, TIPO_ENTRADA[p.tipo] || p.tipo, fechaLima(p.fecha).slice(0, 7), monto, p.comprobante.clienteNombre);
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
    salidas.sumar(clave, nombreCategoria.get(c.categoriaGastoId) || "Sin categoría", ym, monto, c.proveedor.razonSocial);
    for (const parte of lineas.agregar(c.proveedorId, monto)) porLinea.sumar(parte.clave, parte.nombre, ym, parte.monto);
  }
  for (const q of cuotas) {
    const ym = fechaLima(q.fechaPago).slice(0, 7);
    const monto = r2(q.monto + q.igv);
    salidas.sumar(alquiler ? `C${alquiler.id}` : "PANELES", "Alquiler de paneles", ym, monto, q.proveedor.razonSocial || q.proveedor.nombre);
    for (const parte of lineas.agregar(null, monto)) porLinea.sumar(parte.clave, parte.nombre, ym, parte.monto);
  }

  const ent = entradas.cerrar(meses);
  const sal = salidas.cerrar(meses);
  // Líneas por monto, con "Sin línea de negocio" al final.
  const lin = porLinea.cerrar(meses, (a, b) => (a.clave === "SIN") - (b.clave === "SIN") || b.total - a.total);

  const neto = { total: r2(ent.totales.total - sal.totales.total), meses: {} };
  const acumulado = {};
  let corrido = 0;
  for (const m of meses) {
    neto.meses[m] = r2(ent.totales.meses[m] - sal.totales.meses[m]);
    corrido = r2(corrido + neto.meses[m]);
    acumulado[m] = corrido;
  }

  return {
    desde, hasta,
    meses: meses.map((m) => ({ clave: m, etiqueta: etiquetaMes(m) })),
    entradas: ent, salidas: sal, salidasPorLinea: lin,
    neto, acumulado,
    retencionesExcluidas: r2(retenciones),
  };
}

module.exports = { flujoEfectivo, MAXIMO_MESES, mesesEntre };
