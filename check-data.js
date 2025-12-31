const prisma = require("./src/config/prisma");

async function checkData() {
  console.log("🔍 Verificando datos...\n");

  // Verificar usuarios
  const usuarios = await prisma.usuario.findMany({
    select: {
      id: true,
      nombre: true,
      email: true,
      role: true,
      activo: true,
    },
  });

  console.log("👥 Usuarios:");
  console.table(usuarios);

  // Verificar vendedores activos
  const vendedores = await prisma.usuario.findMany({
    where: {
      role: "VENTAS",
      activo: true,
    },
  });

  console.log(`\n✅ Vendedores activos: ${vendedores.length}`);

  // Verificar cotizaciones
  const cotizaciones = await prisma.cotizacion.findMany({
    select: {
      id: true,
      numero: true,
      estado: true,
      total: true,
      createdAt: true,
      usuario: {
        select: {
          nombre: true,
          role: true,
        },
      },
    },
  });

  console.log(`\n📄 Total cotizaciones: ${cotizaciones.length}`);
  console.table(cotizaciones);

  await prisma.$disconnect();
}

checkData();