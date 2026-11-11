// Reparto de gastos entre líneas de negocio según los % de cada proveedor de
// compras. Lo que no tiene reparto (proveedor sin %, cuotas de paneles) va a
// "Sin línea de negocio".
const prisma = require("../config/prisma");
const { r2 } = require("./cobros.service");

const SIN_LINEA = { clave: "SIN", nombre: "Sin línea de negocio" };

// proveedorId → [{ clave, nombre, porcentaje }]
async function repartosPorProveedor() {
  const filas = await prisma.proveedorLineaNegocio.findMany({
    include: { lineaNegocio: { select: { id: true, nombre: true } } },
  });
  const mapa = new Map();
  for (const f of filas) {
    if (!mapa.has(f.proveedorId)) mapa.set(f.proveedorId, []);
    mapa.get(f.proveedorId).push({ clave: `L${f.lineaNegocio.id}`, nombre: f.lineaNegocio.nombre, porcentaje: f.porcentaje });
  }
  return mapa;
}

// Acumulador: agrega montos repartidos y devuelve filas ordenadas (las líneas
// por nombre del catálogo, "Sin línea" al final).
function acumuladorLineas(repartos) {
  const totales = new Map();
  const sumar = (linea, valor) => {
    const actual = totales.get(linea.clave) || { clave: linea.clave, nombre: linea.nombre, monto: 0 };
    actual.monto += valor;
    totales.set(linea.clave, actual);
  };
  return {
    // Reparte un monto del proveedor; devuelve [{ clave, nombre, monto }] de este monto.
    agregar(proveedorId, monto) {
      const reparto = (proveedorId && repartos.get(proveedorId)) || null;
      if (!reparto?.length) {
        sumar(SIN_LINEA, monto);
        return [{ ...SIN_LINEA, monto }];
      }
      return reparto.map((l) => {
        const parte = (monto * l.porcentaje) / 100;
        sumar(l, parte);
        return { clave: l.clave, nombre: l.nombre, monto: parte };
      });
    },
    filas() {
      const lista = [...totales.values()].map((l) => ({ ...l, monto: r2(l.monto) })).filter((l) => l.monto);
      const total = r2(lista.reduce((a, l) => a + l.monto, 0));
      return lista
        .sort((a, b) => (a.clave === "SIN") - (b.clave === "SIN") || b.monto - a.monto)
        .map((l) => ({ ...l, porcentaje: total ? r2((l.monto / total) * 100) : 0 }));
    },
  };
}

module.exports = { SIN_LINEA, repartosPorProveedor, acumuladorLineas };
