/**
 * Segunda carga desde data/ALMACEN_INVENTARIO1.xlsx (hoja "INVENTARIO
 * ALMACEN"), solo aditiva:
 *
 *  - Crea los ítems del Excel que todavía no existen en ItemAlmacen. Incluye
 *    las Herramientas, Maquinaria y Equipos y Muebles y Enseres de
 *    BTL/Outdoor que import-almacen-excel.js dejaba fuera a propósito
 *    (activos fijos) — desde sep-2026 también se controlan en el Almacén.
 *  - Copia la columna "Observaciones" a los ítems que ya existen, solo si en
 *    el ERP todavía está vacía.
 *
 * NUNCA toca stock, costo ni ningún otro campo de un ítem existente: su
 * stock ya refleja los movimientos registrados en el ERP y el Excel quedó
 * desactualizado. (Por eso no se vuelve a correr import-almacen-excel.js,
 * que sí pisa el stock.)
 *
 * Idempotente: correrlo de nuevo no crea duplicados.
 *
 * Ejecutar: node scripts/import-almacen-activos.js [--dry-run]
 */

require("dotenv").config();
const path = require("path");
const XLSX = require("xlsx");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const ARCHIVO = path.join(__dirname, "..", "data", "ALMACEN_INVENTARIO1.xlsx");
const DRY_RUN = process.argv.includes("--dry-run");

const TIPO_POR_CATEGORIA = {
  "Insumos": "INSUMO",
  "Productos Terminados": "PRODUCTO_TERMINADO",
  "Herramientas": "HERRAMIENTA",
  "Maquinaria y Equipos": "MAQUINARIA_EQUIPO",
  "Muebles y Enseres": "MUEBLE_ENSER",
};

const ABREV_POR_CATEGORIA = {
  "Insumos": "INS",
  "Productos Terminados": "PTR",
  "Herramientas": "HER",
  "Maquinaria y Equipos": "MAQ",
  "Muebles y Enseres": "MUE",
};

const EMPRESA_POR_PREFIJO = { Z: "BTL_OUTDOOR", N: "NETWISE" };

const DEPARTAMENTO_POR_CODIGO = {
  VEN: "Ventas / Comercial",
  OPE: "Operaciones",
  GER: "Gerencia General",
  DIS: "Diseño",
  OFI: "Toda la empresa",
};

const departamentoDe = (codigo) => DEPARTAMENTO_POR_CODIGO[codigo.slice(1, 4)] || null;

function limpiarMoneda(v) {
  if (!v) return 0;
  const n = parseFloat(String(v).replace(/S\/\.?/gi, "").replace(/,/g, "").trim());
  return isNaN(n) ? 0 : n;
}

function limpiarNumero(v) {
  const n = parseFloat(String(v).replace(",", "."));
  return isNaN(n) ? 0 : n;
}

// Mismo cruce que import-almacen-excel.js: número de subcategoría del código
// (ej. "ZOPEHER018-01" -> "018") contra la hoja "Categoría".
function construirMapaSubcategorias(wb) {
  const json = XLSX.utils.sheet_to_json(wb.Sheets["Categoría"], { header: 1, raw: false, defval: "" });
  const columnasPorAbrev = {};
  json[2].forEach((val, col) => {
    const abrev = String(val).trim();
    if (abrev) columnasPorAbrev[abrev] = col;
  });

  const mapa = {};
  for (const abrev of Object.values(ABREV_POR_CATEGORIA)) {
    const col = columnasPorAbrev[abrev];
    mapa[abrev] = {};
    if (col === undefined) continue;
    for (let f = 4; f < json.length; f++) {
      const nombre = String(json[f][col] ?? "").trim();
      const numero = String(json[f][col + 1] ?? "").trim();
      // La hoja puede traer "3" o "003"; se normaliza a número.
      if (nombre && numero) mapa[abrev][String(Number(numero))] = nombre;
    }
  }
  return mapa;
}

const normalizar = (t) => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// Subcategoría cuyo nombre aparece en la descripción del ítem (la más larga
// si hay varias; "Reflectores" también reconoce "Reflector"), o null.
function subcategoriaPorNombre(nombre, abrev, mapaSubcat) {
  const desc = normalizar(nombre);
  return Object.values(mapaSubcat[abrev] || {})
    .filter((sub) => {
      const n = normalizar(sub);
      const singular = n.replace(/(es|s)$/, "");
      return desc.includes(n) || (singular.length >= 4 && desc.includes(singular));
    })
    .sort((a, b) => b.length - a.length)[0] || null;
}

// En el Excel varios códigos tienen mal el número de subcategoría (ej.
// "ZOPEMAQ022-01" es una Compresora pero 022 es "Tronzadora"). Por eso
// primero se busca la subcategoría por nombre y solo si no aparece ninguna
// se usa el número del código.
function subcategoriaDe(codigo, nombre, categoriaExcel, mapaSubcat) {
  const abrev = ABREV_POR_CATEGORIA[categoriaExcel];
  const porNombre = subcategoriaPorNombre(nombre, abrev, mapaSubcat);
  if (porNombre) return porNombre;
  const m = codigo.match(/(\d{3})-\d+$/);
  return (m && mapaSubcat[abrev]?.[String(Number(m[1]))]) || categoriaExcel;
}

async function main() {
  const wb = XLSX.readFile(ARCHIVO);
  const mapaSubcat = construirMapaSubcategorias(wb);
  const json = XLSX.utils.sheet_to_json(wb.Sheets["INVENTARIO ALMACEN"], { header: 1, raw: false, defval: "" });
  const filas = json.slice(11).filter((r) => String(r[0]).trim());

  const existentes = await prisma.itemAlmacen.findMany({ select: { id: true, codigo: true, nombre: true, categoria: true, observaciones: true } });
  const porCodigo = new Map(existentes.map((i) => [i.codigo, i]));

  const vistos = new Set();
  let creados = 0, conObservacion = 0, omitidos = 0, recategorizados = 0;

  for (const r of filas) {
    const codigo = String(r[0]).trim();
    const [, descripcion, categoriaExcel, ubicacion, stockMinimo, stockMaximo, cantidad, unidad, costoUnitario, , proveedor, observaciones] = r;
    const obs = String(observaciones || "").trim() || null;

    // Código repetido dentro del Excel: la primera carga ya lo resolvió
    // (sufijo -DUP2), no se vuelve a crear.
    if (vistos.has(codigo)) { omitidos++; continue; }
    vistos.add(codigo);

    const existente = porCodigo.get(codigo);
    if (existente) {
      const cambios = {};
      if (obs && !existente.observaciones) {
        cambios.observaciones = obs;
        conObservacion++;
      }
      // Corrige la categoría de ítems ya cargados que la primera importación
      // tomó del número de código equivocado (ej. "Audifonos" en "Compresora
      // de aire"). Solo si el nombre coincide con otra subcategoría.
      const cat = String(categoriaExcel).trim();
      // Solo Maquinaria y Herramientas: ahí están los números mal puestos;
      // en Insumos/Productos las categorías cargadas ya son correctas.
      const corregible = ["Maquinaria y Equipos", "Herramientas"].includes(cat);
      const sugerida = corregible ? subcategoriaDe(codigo, existente.nombre, cat, mapaSubcat) : null;
      if (sugerida && sugerida !== cat && sugerida !== existente.categoria) {
        console.log(`  ~ ${codigo} | ${existente.nombre} | categoría "${existente.categoria}" -> "${sugerida}"`);
        cambios.categoria = sugerida;
        recategorizados++;
      }
      if (Object.keys(cambios).length && !DRY_RUN) {
        await prisma.itemAlmacen.update({ where: { id: existente.id }, data: cambios });
      }
      continue;
    }

    const empresa = EMPRESA_POR_PREFIJO[codigo[0]];
    const tipo = TIPO_POR_CATEGORIA[String(categoriaExcel).trim()];
    if (!empresa || !tipo) {
      console.log(`  ⚠️  Omitido ${codigo} ("${descripcion}"): empresa o categoría "${categoriaExcel}" desconocida`);
      omitidos++;
      continue;
    }

    const data = {
      codigo,
      nombre: String(descripcion).trim(),
      tipo,
      empresa,
      departamento: departamentoDe(codigo),
      categoria: subcategoriaDe(codigo, descripcion, String(categoriaExcel).trim(), mapaSubcat),
      unidad: String(unidad).trim() || "Unidad",
      ubicacion: String(ubicacion).trim() || null,
      stockMinimo: limpiarNumero(stockMinimo),
      stockMaximo: limpiarNumero(stockMaximo),
      stockActual: limpiarNumero(cantidad),
      costoUnitario: limpiarMoneda(costoUnitario),
      proveedorNombre: String(proveedor).trim() || null,
      observaciones: obs,
    };
    if (!DRY_RUN) await prisma.itemAlmacen.create({ data });
    console.log(`  + ${codigo} | ${data.tipo} | ${data.categoria} | ${data.nombre} | stock ${data.stockActual} | S/ ${data.costoUnitario}`);
    creados++;
  }

  // Ítems de Maquinaria/Herramientas que están en el ERP pero no en la hoja
  // de inventario (vinieron de "CODIFICACIÓN" con stock 0): mismo arreglo,
  // buscando el nombre en su lista y, si no aparece, en la de la otra.
  const soloEnErp = await prisma.itemAlmacen.findMany({
    where: { codigo: { notIn: [...vistos] }, tipo: { in: ["MAQUINARIA_EQUIPO", "HERRAMIENTA"] } },
    select: { id: true, codigo: true, nombre: true, tipo: true, categoria: true },
  });
  for (const it of soloEnErp) {
    const [propia, otra] = it.tipo === "HERRAMIENTA" ? ["HER", "MAQ"] : ["MAQ", "HER"];
    // La coincidencia más específica (más larga) entre ambas listas: así
    // "Soporte de celular" gana sobre "Celular".
    const sugerida = [subcategoriaPorNombre(it.nombre, propia, mapaSubcat), subcategoriaPorNombre(it.nombre, otra, mapaSubcat)]
      .filter(Boolean)
      .sort((x, y) => y.length - x.length)[0];
    if (sugerida && sugerida !== it.categoria) {
      console.log(`  ~ ${it.codigo} | ${it.nombre} | categoría "${it.categoria}" -> "${sugerida}"`);
      if (!DRY_RUN) await prisma.itemAlmacen.update({ where: { id: it.id }, data: { categoria: sugerida } });
      recategorizados++;
    }
  }

  console.log(`\n${DRY_RUN ? "🔎 (simulación, no se escribió nada) " : "✅ "}${creados} ítems creados, ${conObservacion} observaciones copiadas a ítems existentes, ${recategorizados} categorías corregidas, ${omitidos} filas omitidas.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
