/**
 * Corre los datos de PRV-007..PRV-010 → PRV-008..PRV-011
 * para hacer espacio en PRV-007.
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function copiarProveedor(fromId, toId) {
  // Leer origen (con cuotas)
  const src = await prisma.proveedor.findUnique({
    where: { id: fromId },
    include: { cuotas: { orderBy: { numero: "asc" } } },
  });
  if (!src) throw new Error(`No existe PRV-${fromId}`);

  // Actualizar destino con los datos del origen
  await prisma.proveedor.update({
    where: { id: toId },
    data: {
      nombre:              src.nombre,
      ciudad:              src.ciudad,
      ubicacion:           src.ubicacion,
      tipoContrato:        src.tipoContrato,
      elementos:           src.elementos,
      inicio:              src.inicio,
      fin:                 src.fin,
      costoMensual:        src.costoMensual,
      costoLuzMes:         src.costoLuzMes,
      numeroCuenta:        src.numeroCuenta,
      nombreCuenta:        src.nombreCuenta,
      relevanciaComercial: src.relevanciaComercial,
      razonSocial:         src.razonSocial,
      estadoOverride:      src.estadoOverride,
      activo:              true,
    },
  });

  // Reemplazar cuotas del destino
  await prisma.proveedorCuota.deleteMany({ where: { proveedorId: toId } });
  for (const c of src.cuotas) {
    await prisma.proveedorCuota.create({
      data: {
        proveedorId: toId,
        numero:      c.numero,
        monto:       c.monto,
        igv:         c.igv,
        fecha:       c.fecha,
        fechaCobro:  c.fechaCobro,
        estado:      c.estado,
        detalle:     c.detalle,
      },
    });
  }

  const code = (id) => `PRV-${String(id).padStart(3, "0")}`;
  console.log(`  ✓ ${code(fromId)} → ${code(toId)}  (${src.ubicacion})`);
}

async function main() {
  console.log("Corriendo datos PRV-007..010 → PRV-008..011\n");

  // Orden: de mayor a menor para no pisar datos
  await copiarProveedor(10, 11);
  await copiarProveedor(9,  10);
  await copiarProveedor(8,  9);
  await copiarProveedor(7,  8);

  // Limpiar PRV-007 (queda como placeholder para el próximo seed)
  await prisma.proveedor.update({
    where: { id: 7 },
    data: {
      nombre:              "PROVEEDOR PENDIENTE",
      ciudad:              "HUANCAYO",
      ubicacion:           "PENDIENTE DE CARGA",
      tipoContrato:        "ALQUILER",
      elementos:           null,
      inicio:              new Date("2026-03-12"),
      fin:                 new Date("2027-03-11"),
      costoMensual:        0,
      costoLuzMes:         0,
      numeroCuenta:        null,
      nombreCuenta:        null,
      relevanciaComercial: "ALTO",
      razonSocial:         null,
      estadoOverride:      null,
      activo:              true,
    },
  });
  await prisma.proveedorCuota.deleteMany({ where: { proveedorId: 7 } });
  console.log("  ✓ PRV-007 limpiado como placeholder");

  // Resumen final
  const todos = await prisma.proveedor.findMany({
    where: { activo: true },
    select: { id: true, nombre: true, ubicacion: true },
    orderBy: { id: "asc" },
  });
  console.log(`\nEstado final (${todos.length} proveedores):`);
  todos.forEach((r) => {
    console.log(`  PRV-${String(r.id).padStart(3,"0")}  ${r.ubicacion}`);
  });
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
