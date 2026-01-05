// backend/prisma/seed-clientes.js
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function seedClientes() {
  try {
    console.log("🌱 Iniciando seed de clientes...\n");

    const clientes = [
      {
        nombreComercial: "Constructora Andina SAC",
        documento: "20123456789", // RUC
        nombreContacto: "Carlos Ramírez",
        telefono: "987654321",
        email: "contacto@andina.com",
        direccion: "Av. Javier Prado Este 1234, San Isidro, Lima",
      },
      {
        nombreComercial: "Publicidad Creativa EIRL",
        documento: "20456789123", // RUC
        nombreContacto: "Ana Torres",
        telefono: "912345678",
        email: "ventas@creativa.pe",
        direccion: "Jr. Los Próceres 456, El Tambo, Huancayo",
      },
      {
        nombreComercial: "Eventos Globales SAC",
        documento: "20567891234", // RUC
        nombreContacto: "Pedro Gutiérrez",
        telefono: "956789123",
        email: "info@eventosglobales.com",
        direccion: "Av. Ejército 789, Cayma, Arequipa",
      },
      {
        nombreComercial: "Distribuidora Central SAC",
        documento: "20678912345", // RUC
        nombreContacto: "María López",
        telefono: "934567890",
        email: "compras@central.pe",
        direccion: "Av. La Cultura 1500, Wanchaq, Cusco",
      },
      {
        nombreComercial: "Servicios Integrales SRL",
        documento: "20789123456", // RUC
        nombreContacto: "José Fernández",
        telefono: "945678901",
        email: "servicios@integrales.com",
        direccion: "Calle Los Pinos 123, Urb. El Golf, Trujillo",
      },
    ];

    let creados = 0;
    for (const c of clientes) {
      await prisma.cliente.upsert({
        where: { documento: c.documento }, // clave única
        update: {
          nombreComercial: c.nombreComercial,
          nombreContacto: c.nombreContacto,
          telefono: c.telefono,
          email: c.email,
          direccion: c.direccion,
        },
        create: {
          nombreComercial: c.nombreComercial,
          documento: c.documento,
          nombreContacto: c.nombreContacto,
          telefono: c.telefono,
          email: c.email,
          direccion: c.direccion,
        },
      });
      creados++;
    }

    console.log(`✅ ${creados} clientes creados/actualizados exitosamente\n`);
    const total = await prisma.cliente.count();
    console.log(`📊 Total clientes en BD: ${total}`);
    console.log("\n🎉 Seed de clientes completado!\n");
  } catch (error) {
    console.error("❌ Error en seed de clientes:", error);
  } finally {
    await prisma.$disconnect();
  }
}

seedClientes();
