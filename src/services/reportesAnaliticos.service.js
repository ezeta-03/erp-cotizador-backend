// Reportes analíticos de Zaazmago, cada uno como una tabla exportable:
// { titulo, subtitulo, columnas: [{ clave, titulo, formato }], filas: [obj], grafico: { etiqueta, valor, titulo } }
// formato: "texto" | "moneda" | "porcentaje" | "entero". Montos en soles.
//  - ventas-documentos: facturas, boletas y notas por mes, crédito vs contado.
//  - precios-proveedores: cómo cambió el precio de cada ítem comprado a cada proveedor.
//  - compras-clientes: qué compraron los clientes (líneas de sus facturas y boletas).
//  - mejores-vendedores: facturado por usuario que emitió el documento.
//  - mejores-compradores: órdenes de compra por usuario que las creó.
// Solo Zaazmago en ventas (se excluyen los comprobantes de cotizaciones Netwise).
const prisma = require("../config/prisma");
const { r2 } = require("./cobros.service");

const inicioDia = (f) => new Date(`${f}T00:00:00-05:00`);
const finDia = (f) => new Date(`${f}T23:59:59.999-05:00`);
const rangoDe = (desde, hasta) => ({ gte: inicioDia(desde), lte: finDia(hasta) });
const SOLO_ZAAZMAGO = { OR: [{ cotizacionId: null }, { cotizacion: { marca: "ZAAZMAGO" } }] };
const TIPOS_VENTA = ["FACTURA", "BOLETA"];
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];
const etiquetaMes = (ym) => `${MESES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`;
const mesDe = (fecha) => fecha.toLocaleDateString("en-CA", { timeZone: "America/Lima" }).slice(0, 7);
const enSoles = (monto, moneda, tc) => (moneda === "USD" ? r2(monto * (tc || 1)) : r2(monto));

// ── 1. Ventas por tipo de documento y mes ──────────────────────────────
async function ventasDocumentos(desde, hasta) {
  const docs = await prisma.comprobante.findMany({
    where: { estado: "ACEPTADO", fechaEmision: rangoDe(desde, hasta), tipo: { in: [...TIPOS_VENTA, "NOTA_CREDITO", "NOTA_DEBITO"] }, ...SOLO_ZAAZMAGO },
    select: { tipo: true, moneda: true, tipoCambio: true, total: true, fechaEmision: true, formaPago: true },
  });
  const filas = new Map();
  const fila = (ym) => {
    if (!filas.has(ym)) filas.set(ym, { mes: etiquetaMes(ym), facturas: 0, boletas: 0, notasCredito: 0, notasDebito: 0, ventasNetas: 0, aCredito: 0, alContado: 0, documentos: 0 });
    return filas.get(ym);
  };
  for (const d of docs) {
    const f = fila(mesDe(d.fechaEmision));
    const monto = enSoles(d.total, d.moneda, d.tipoCambio);
    f.documentos += 1;
    if (d.tipo === "FACTURA") f.facturas += monto;
    if (d.tipo === "BOLETA") f.boletas += monto;
    if (d.tipo === "NOTA_CREDITO") f.notasCredito += monto;
    if (d.tipo === "NOTA_DEBITO") f.notasDebito += monto;
    if (TIPOS_VENTA.includes(d.tipo)) {
      if (d.formaPago === "CREDITO") f.aCredito += monto; else f.alContado += monto;
    }
  }
  const claves = [...filas.keys()].sort();
  const lista = claves.map((k) => {
    const f = filas.get(k);
    const neto = r2(f.facturas + f.boletas + f.notasDebito - f.notasCredito);
    return {
      mes: f.mes, facturas: r2(f.facturas), boletas: r2(f.boletas), notasCredito: r2(f.notasCredito), notasDebito: r2(f.notasDebito),
      ventasNetas: neto, aCredito: r2(f.aCredito), alContado: r2(f.alContado), documentos: f.documentos,
    };
  });
  return {
    titulo: "Ventas por documento y mes",
    subtitulo: "Facturas, boletas y notas emitidas por Zaazmago, en soles",
    columnas: [
      { clave: "mes", titulo: "Mes", formato: "texto" },
      { clave: "facturas", titulo: "Facturas", formato: "moneda", total: true },
      { clave: "boletas", titulo: "Boletas", formato: "moneda", total: true },
      { clave: "notasCredito", titulo: "Notas de crédito", formato: "moneda", total: true },
      { clave: "notasDebito", titulo: "Notas de débito", formato: "moneda", total: true },
      { clave: "ventasNetas", titulo: "Ventas netas", formato: "moneda", total: true },
      { clave: "aCredito", titulo: "A crédito", formato: "moneda", total: true },
      { clave: "alContado", titulo: "Al contado", formato: "moneda", total: true },
      { clave: "documentos", titulo: "Documentos", formato: "entero", total: true },
    ],
    filas: lista,
    grafico: { etiqueta: "mes", valor: "ventasNetas", titulo: "Ventas netas por mes" },
  };
}

// ── 2. Cambios de precio de proveedores ───────────────────────────────
async function preciosProveedores(desde, hasta) {
  const items = await prisma.ordenCompraItem.findMany({
    where: { ordenCompra: { createdAt: rangoDe(desde, hasta), estado: { notIn: ["BORRADOR", "RECHAZADA", "CANCELADA"] } } },
    select: {
      cantidad: true, precioUnitario: true,
      item: { select: { codigo: true, nombre: true, unidad: true } },
      ordenCompra: { select: { createdAt: true, moneda: true, tipoCambio: true, proveedor: { select: { razonSocial: true } } } },
    },
  });
  const grupos = new Map();
  for (const it of items) {
    const clave = `${it.item.codigo}|${it.ordenCompra.proveedor.razonSocial}`;
    if (!grupos.has(clave)) grupos.set(clave, { codigo: it.item.codigo, item: it.item.nombre, unidad: it.item.unidad, proveedor: it.ordenCompra.proveedor.razonSocial, precios: [] });
    const precio = enSoles(it.precioUnitario, it.ordenCompra.moneda, it.ordenCompra.tipoCambio);
    grupos.get(clave).precios.push({ fecha: it.ordenCompra.createdAt, precio });
  }
  const filas = [...grupos.values()].map((g) => {
    const ordenados = g.precios.sort((a, b) => a.fecha - b.fecha);
    const primero = ordenados[0].precio;
    const ultimo = ordenados[ordenados.length - 1].precio;
    return {
      codigo: g.codigo,
      item: g.item,
      proveedor: g.proveedor,
      unidad: g.unidad,
      compras: ordenados.length,
      primerPrecio: primero,
      ultimoPrecio: ultimo,
      variacion: primero ? r2(((ultimo - primero) / primero) * 100) : 0,
      ultimaCompra: ordenados[ordenados.length - 1].fecha.toLocaleDateString("en-CA", { timeZone: "America/Lima" }),
    };
  }).sort((a, b) => Math.abs(b.variacion) - Math.abs(a.variacion));
  return {
    titulo: "Cambios de precio de proveedores",
    subtitulo: "Precio unitario sin IGV del primer y último pedido de cada ítem, en soles",
    columnas: [
      { clave: "codigo", titulo: "Código", formato: "texto" },
      { clave: "item", titulo: "Ítem", formato: "texto" },
      { clave: "proveedor", titulo: "Proveedor", formato: "texto" },
      { clave: "unidad", titulo: "Unidad", formato: "texto" },
      { clave: "compras", titulo: "Órdenes", formato: "entero" },
      { clave: "primerPrecio", titulo: "Primer precio", formato: "moneda" },
      { clave: "ultimoPrecio", titulo: "Último precio", formato: "moneda" },
      { clave: "variacion", titulo: "Variación %", formato: "porcentaje" },
      { clave: "ultimaCompra", titulo: "Última compra", formato: "texto" },
    ],
    filas,
    grafico: { etiqueta: "item", valor: "variacion", titulo: "Variación de precio % (mayores cambios)", limite: 10 },
  };
}

// ── 3. Qué compraron los clientes ──────────────────────────────────────
async function comprasClientes(desde, hasta) {
  const lineas = await prisma.comprobanteItem.findMany({
    where: { comprobante: { tipo: { in: TIPOS_VENTA }, estado: "ACEPTADO", fechaEmision: rangoDe(desde, hasta), ...SOLO_ZAAZMAGO } },
    select: {
      descripcion: true, valorVenta: true,
      comprobante: { select: { id: true, clienteNombre: true, clienteNumDoc: true, moneda: true, tipoCambio: true } },
    },
  });
  const clientes = new Map();
  for (const l of lineas) {
    const c = l.comprobante;
    const clave = c.clienteNumDoc;
    if (!clientes.has(clave)) clientes.set(clave, { cliente: c.clienteNombre, documentos: new Set(), lineas: 0, monto: 0, productos: new Map() });
    const g = clientes.get(clave);
    const monto = enSoles(l.valorVenta, c.moneda, c.tipoCambio);
    g.documentos.add(c.id);
    g.lineas += 1;
    g.monto += monto;
    g.productos.set(l.descripcion, (g.productos.get(l.descripcion) || 0) + monto);
  }
  const filas = [...clientes.values()].map((g) => ({
    cliente: g.cliente,
    documentos: g.documentos.size,
    lineas: g.lineas,
    monto: r2(g.monto),
    productos: [...g.productos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([d]) => d).join(", "),
  })).sort((a, b) => b.monto - a.monto);
  return {
    titulo: "Qué compraron los clientes",
    subtitulo: "Venta sin IGV por cliente en facturas y boletas, en soles",
    columnas: [
      { clave: "cliente", titulo: "Cliente", formato: "texto" },
      { clave: "documentos", titulo: "Documentos", formato: "entero" },
      { clave: "lineas", titulo: "Líneas", formato: "entero", total: true },
      { clave: "monto", titulo: "Venta sin IGV", formato: "moneda", total: true },
      { clave: "productos", titulo: "Principales productos", formato: "texto" },
    ],
    filas,
    grafico: { etiqueta: "cliente", valor: "monto", titulo: "Venta por cliente", limite: 10 },
  };
}

// ── 4. Mejores vendedores (equipo de venta) ───────────────────────────
async function mejoresVendedores(desde, hasta) {
  const docs = await prisma.comprobante.findMany({
    where: { tipo: { in: TIPOS_VENTA }, estado: "ACEPTADO", fechaEmision: rangoDe(desde, hasta), ...SOLO_ZAAZMAGO },
    select: { total: true, moneda: true, tipoCambio: true, usuario: { select: { nombre: true } } },
  });
  return ranking(docs.map((d) => ({ persona: d.usuario.nombre, monto: enSoles(d.total, d.moneda, d.tipoCambio) })), {
    titulo: "Mejores vendedores",
    subtitulo: "Facturado por usuario que emitió los documentos, en soles",
    etiquetaOperaciones: "Documentos",
    etiquetaMonto: "Facturado",
    grafico: "Facturado por vendedor",
  });
}

// ── 5. Mejores compradores (equipo de compra) ─────────────────────────
async function mejoresCompradores(desde, hasta) {
  const ocs = await prisma.ordenCompra.findMany({
    where: { createdAt: rangoDe(desde, hasta), estado: { notIn: ["BORRADOR", "RECHAZADA", "CANCELADA"] } },
    select: { total: true, moneda: true, tipoCambio: true, creadoPor: { select: { nombre: true } } },
  });
  return ranking(ocs.map((o) => ({ persona: o.creadoPor.nombre, monto: enSoles(o.total, o.moneda, o.tipoCambio) })), {
    titulo: "Mejores compradores",
    subtitulo: "Compras por usuario que creó la orden de compra, en soles",
    etiquetaOperaciones: "Órdenes",
    etiquetaMonto: "Comprado",
    grafico: "Comprado por usuario",
  });
}

// Agrupa por persona: operaciones, monto y participación.
function ranking(registros, { titulo, subtitulo, etiquetaOperaciones, etiquetaMonto, grafico }) {
  const grupos = new Map();
  for (const r of registros) {
    const g = grupos.get(r.persona) || { persona: r.persona, operaciones: 0, monto: 0 };
    g.operaciones += 1;
    g.monto += r.monto;
    grupos.set(r.persona, g);
  }
  const total = r2([...grupos.values()].reduce((a, g) => a + g.monto, 0));
  const filas = [...grupos.values()]
    .map((g) => ({ persona: g.persona, operaciones: g.operaciones, monto: r2(g.monto), participacion: total ? r2((g.monto / total) * 100) : 0 }))
    .sort((a, b) => b.monto - a.monto);
  return {
    titulo, subtitulo,
    columnas: [
      { clave: "persona", titulo: "Usuario", formato: "texto" },
      { clave: "operaciones", titulo: etiquetaOperaciones, formato: "entero", total: true },
      { clave: "monto", titulo: etiquetaMonto, formato: "moneda", total: true },
      { clave: "participacion", titulo: "Participación %", formato: "porcentaje" },
    ],
    filas,
    grafico: { etiqueta: "persona", valor: "monto", titulo: grafico },
  };
}

// ── 0. Recaudado vs por cobrar (mismo cálculo que el reporte de recaudo) ──
async function recaudo(desde, hasta) {
  const { recaudoVsCobrar } = require("./reportes.service");
  const r = await recaudoVsCobrar(desde, hasta);
  return {
    titulo: "Recaudado vs por cobrar",
    subtitulo: "Zaazmago · facturado, recaudado y saldo por cobrar por mes, en soles",
    columnas: [
      { clave: "mes", titulo: "Mes", formato: "texto" },
      { clave: "facturado", titulo: "Facturado", formato: "moneda", total: true },
      { clave: "recaudado", titulo: "Recaudado", formato: "moneda", total: true },
      { clave: "porCobrar", titulo: "Por cobrar", formato: "moneda", total: true },
    ],
    filas: r.meses.map((m) => ({ clave: m.clave, mes: m.etiqueta, facturado: m.facturado, recaudado: m.recaudado, porCobrar: m.porCobrar })),
    totales: r.totales,
    grafico: {
      etiqueta: "mes",
      series: [{ clave: "recaudado", nombre: "Recaudado", color: "#059669" }, { clave: "porCobrar", nombre: "Por cobrar", color: "#FF6600" }],
      titulo: "Recaudado y por cobrar por mes",
    },
  };
}

const TIPOS = {
  recaudo,
  "ventas-documentos": ventasDocumentos,
  "precios-proveedores": preciosProveedores,
  "compras-clientes": comprasClientes,
  "mejores-vendedores": mejoresVendedores,
  "mejores-compradores": mejoresCompradores,
};

module.exports = { TIPOS };
