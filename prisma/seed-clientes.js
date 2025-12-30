const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Creando clientes de prueba...");

  await prisma.cliente.createMany({
    data: [
      {
        nombre: "Cliente Demo SAC",
        documento: "20123456789",
        telefono: "999888777",
        correo: "cliente@demo.com",
        direccion: "Av. Principal 123"
      }
    ],
    skipDuplicates: true
  });

  console.log("✅ Clientes creados");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
