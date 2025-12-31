const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Creando cotizaciones de prueba...");

  // Obtener vendedores
  const vendedores = await prisma.usuario.findMany({
    where: { role: "VENTAS", activo: true },
  });

  if (vendedores.length === 0) {
    console.log("❌ No hay vendedores. Ejecuta primero seed-vendedores.js");
    return;
  }

  // Obtener o crear un cliente
  let cliente = await prisma.cliente.findFirst();
  if (!cliente) {
    cliente = await prisma.cliente.create({
      data: {
        nombre: "Cliente Demo SAC",
        documento: "20123456789",
        email: "demo@cliente.com",
      },
    });
  }

  // Obtener o crear un producto
  let producto = await prisma.producto.findFirst();
  if (!producto) {
    producto = await prisma.producto.create({
      data: {
        nombre: "Producto Demo",
        precio_material: 100,
        precio_mano_obra: 50,
      },
    });
  }

  const now = new Date();
  const mesActual = now.getMonth();
  const anioActual = now.getFullYear();

  let contador = 1;

  // Crear 10 cotizaciones distribuidas en el mes para cada vendedor
  for (const vendedor of vendedores) {
    console.log(`\n📝 Creando cotizaciones para ${vendedor.nombre}...`);

    for (let i = 1; i <= 10; i++) {
      const dia = Math.floor(Math.random() * 28) + 1;
      const fecha = new Date(anioActual, mesActual, dia);

      // Alternar estados: 40% FACTURADA, 30% APROBADA, 20% PENDIENTE, 10% RECHAZADA
      const rand = Math.random();
      let estado;
      if (rand < 0.4) estado = "FACTURADA";
      else if (rand < 0.7) estado = "APROBADA";
      else if (rand < 0.9) estado = "PENDIENTE";
      else estado = "RECHAZADA";

      const total = Math.floor(Math.random() * 10000) + 2000;

      await prisma.cotizacion.create({
        data: {
          numero: `COT-${String(contador++).padStart(4, "0")}`,
          margen: 0.3,
          total,
          estado,
          createdAt: fecha,
          clienteId: cliente.id,
          usuarioId: vendedor.id,
          items: {
            create: [
              {
                productoId: producto.id,
                cantidad: 1,
                precio: total,
                subtotal: total,
              },
            ],
          },
        },
      });
    }

    console.log(`   ✅ 10 cotizaciones creadas`);
  }

  console.log("\n🎉 ¡Datos de prueba creados exitosamente!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });