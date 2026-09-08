/**
 * Importa el inventario real de Almacén desde data/ALMACEN_INVENTARIO1.xlsx
 * (hoja "INVENTARIO ALMACEN") hacia el modelo ItemAlmacen.
 *
 * Alcance (confirmado con el usuario):
 *  - BTL/Outdoor (código "Z"): solo Insumos y Productos Terminados —
 *    Herramientas/Maquinaria/Muebles quedan fuera, son activos fijos.
 *  - Netwise (código "N"): Netwise no tiene insumos ni productos terminados
 *    propios en el Excel — todo su inventario es Herramientas y Maquinaria
 *    y Equipos, así que esas dos SÍ entran para Netwise (aunque para
 *    BTL/Outdoor queden excluidas). Muebles y Enseres queda fuera para
 *    ambas empresas.
 *  - Sin receta/BOM (no existe en el Excel): cada ítem entra tal cual con
 *    su stock actual de hoy; no se importa el historial de movimientos
 *    (el stock actual ya es el neto de esa historia).
 *
 * Idempotente por `codigo` (upsert): correrlo de nuevo actualiza cantidades
 * en vez de duplicar filas.
 *
 * Ejecutar: node scripts/import-almacen-excel.js
 */

require("dotenv").config();
const path = require("path");
const XLSX = require("xlsx");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const ARCHIVO = path.join(__dirname, "..", "data", "ALMACEN_INVENTARIO1.xlsx");

const TIPO_POR_CATEGORIA = {
  "Insumos": "INSUMO",
  "Productos Terminados": "PRODUCTO_TERMINADO",
  "Herramientas": "HERRAMIENTA",
  "Maquinaria y Equipos": "MAQUINARIA_EQUIPO",
};

const ABREV_POR_CATEGORIA = {
  "Insumos": "INS",
  "Productos Terminados": "PTR",
  "Herramientas": "HER",
  "Maquinaria y Equipos": "MAQ",
};

// Categorías que entran al Almacén, por empresa (código Z / N).
const CATEGORIAS_PERMITIDAS = {
  Z: ["Insumos", "Productos Terminados"],
  N: ["Herramientas", "Maquinaria y Equipos", "Insumos", "Productos Terminados"],
};

const EMPRESA_POR_PREFIJO = { Z: "BTL_OUTDOOR", N: "NETWISE" };

function limpiarMoneda(v) {
  if (!v) return 0;
  // "S/.21.42" -> "21.42" (quitar el prefijo de moneda entero, no filtrar
  // carácter por carácter — el punto de "S/." se confundía con el decimal).
  const limpio = String(v).replace(/S\/\.?/gi, "").replace(/,/g, "").trim();
  const n = parseFloat(limpio);
  return isNaN(n) ? 0 : n;
}

function limpiarNumero(v) {
  const n = parseFloat(String(v).replace(",", "."));
  return isNaN(n) ? 0 : n;
}

// Sub-categoría (ej. "PVC", "Vinil", "Monitor", "Martillos") a partir del
// número de sub-categoría embebido en el código (ej. "ZOPEINS003-01" -> "003"),
// cruzado con la hoja "Categoría" que mapea número -> nombre, por categoría.
function construirMapaSubcategorias(wb) {
  const sheet = wb.Sheets["Categoría"];
  const json = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
  const filaAbrev = json[2]; // ["", "MUE", "", "", "MAQ ", "", "", "HER", "", "", "INS", "", "", "PTR", ...]

  const columnasPorAbrev = {};
  filaAbrev.forEach((val, col) => {
    const abrev = String(val).trim();
    if (abrev) columnasPorAbrev[abrev] = col; // columna del nombre; el número queda en col+1
  });

  const mapa = {}; // { INS: { "003": "PVC" }, MAQ: { "001": "Monitor" }, ... }
  for (const abrev of ["INS", "PTR", "MAQ", "HER"]) {
    const col = columnasPorAbrev[abrev];
    mapa[abrev] = {};
    if (col === undefined) continue;
    for (let f = 4; f < json.length; f++) {
      const nombre = String(json[f][col] ?? "").trim();
      const numero = String(json[f][col + 1] ?? "").trim();
      if (nombre && numero) mapa[abrev][numero] = nombre;
    }
  }
  return mapa;
}

function subcategoriaDe(codigo, categoriaExcel, mapaSubcat) {
  const abrev = ABREV_POR_CATEGORIA[categoriaExcel];
  const m = codigo.match(/(\d{3})-\d+$/);
  const nombre = m && mapaSubcat[abrev]?.[m[1]];
  return nombre || categoriaExcel;
}

async function main() {
  const wb = XLSX.readFile(ARCHIVO);
  const mapaSubcat = construirMapaSubcategorias(wb);

  const sheet = wb.Sheets["INVENTARIO ALMACEN"];
  const json = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
  const filas = json.slice(11).filter((r) => r[0]);

  const relevantes = filas.filter((r) => {
    const prefijo = String(r[0])[0];
    const permitidas = CATEGORIAS_PERMITIDAS[prefijo];
    return permitidas && permitidas.includes(r[2]);
  });

  console.log(`Filas en el Excel: ${filas.length} — relevantes (BTL/Outdoor + Netwise, categorías permitidas): ${relevantes.length}`);

  const codigosVistos = new Set();
  let creados = 0, actualizados = 0, renombrados = 0;

  for (const r of relevantes) {
    let codigo = String(r[0]).trim();
    const [, descripcion, categoriaExcel, ubicacion, stockMinimo, stockMaximo, cantidad, unidad, costoUnitario, , proveedor] = r;

    // Código duplicado en el Excel (mismo código, distinta descripción) — se
    // desambigua con un sufijo para no perder la fila, y se deja constancia.
    if (codigosVistos.has(codigo)) {
      const original = codigo;
      let n = 2;
      while (codigosVistos.has(`${original}-DUP${n}`)) n++;
      codigo = `${original}-DUP${n}`;
      renombrados++;
      console.log(`  ⚠️  Código duplicado "${original}" -> renombrado a "${codigo}" ("${descripcion}")`);
    }
    codigosVistos.add(codigo);

    const empresa = EMPRESA_POR_PREFIJO[codigo[0]];
    const tipo = TIPO_POR_CATEGORIA[categoriaExcel];
    const categoria = subcategoriaDe(codigo, categoriaExcel, mapaSubcat);

    const data = {
      nombre: String(descripcion).trim(),
      tipo,
      empresa,
      categoria,
      unidad: String(unidad).trim() || "Unidad",
      ubicacion: String(ubicacion).trim() || null,
      stockMinimo: limpiarNumero(stockMinimo),
      stockMaximo: limpiarNumero(stockMaximo),
      stockActual: limpiarNumero(cantidad),
      costoUnitario: limpiarMoneda(costoUnitario),
      proveedorNombre: String(proveedor).trim() || null,
    };

    const existente = await prisma.itemAlmacen.findUnique({ where: { codigo } });
    if (existente) {
      await prisma.itemAlmacen.update({ where: { codigo }, data });
      actualizados++;
    } else {
      await prisma.itemAlmacen.create({ data: { codigo, ...data } });
      creados++;
    }
  }

  console.log(`\n✅ Importación completa: ${creados} creados, ${actualizados} actualizados, ${renombrados} códigos duplicados renombrados.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
