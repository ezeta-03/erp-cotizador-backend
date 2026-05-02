/**
 * Script de reset y carga inicial de usuarios.
 * Ejecutar: node scripts/reset-y-crear-usuarios.js
 */

require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

// Usuarios a CONSERVAR (por email)
const CONSERVAR = [
  "admin@demo.com",      // Admin Principal (id 1)
  "contador1@demo.com",  // Contador1 (id 11)
];

// Nuevos usuarios a crear
const NUEVOS_USUARIOS = [
  { nombre: "Martín Gibbs",      email: "comercial.zaazmago@gmail.com",    role: "ADMIN"  },
  { nombre: "Laura Machado",     email: "subgerencia.zaazmago@gmail.com",  role: "ADMIN"  },
  { nombre: "Lizbeth Machado",   email: "gc1.zaazmago@gmail.com",          role: "VENTAS" },
  { nombre: "Juan José Zárate",  email: "gerencia.zaazmago@gmail.com",     role: "ADMIN"  },
];

const PASSWORD_TEMPORAL = "Zaazmago2025*";

async function main() {
  console.log("🚀 Iniciando reset...\n");

  // 1. Solicitudes de margen
  const sm = await prisma.solicitudMargen.deleteMany({});
  console.log(`✅ SolicitudMargen eliminadas: ${sm.count}`);

  // 2. Adicionales de cotización
  const ca = await prisma.cotizacionAdicional.deleteMany({});
  console.log(`✅ CotizacionAdicional eliminadas: ${ca.count}`);

  // 3. Items de cotización
  const ci = await prisma.cotizacionItem.deleteMany({});
  console.log(`✅ CotizacionItem eliminados: ${ci.count}`);

  // 4. Cotizaciones
  const co = await prisma.cotizacion.deleteMany({});
  console.log(`✅ Cotizaciones eliminadas: ${co.count}`);

  // 5. Desvincular clientes de usuarios (para poder eliminarlos)
  await prisma.cliente.updateMany({ data: { usuarioId: null } });

  // 6. Eliminar todos los clientes
  const cl = await prisma.cliente.deleteMany({});
  console.log(`✅ Clientes eliminados: ${cl.count}`);

  // 7. Metas de usuarios que se van a eliminar
  const usuariosAEliminar = await prisma.usuario.findMany({
    where: { email: { notIn: CONSERVAR } },
    select: { id: true, email: true, nombre: true },
  });
  console.log(`\n📋 Usuarios a eliminar (${usuariosAEliminar.length}):`);
  usuariosAEliminar.forEach((u) => console.log(`   - ${u.nombre} <${u.email}>`));

  const idsEliminar = usuariosAEliminar.map((u) => u.id);

  await prisma.metaMensual.deleteMany({ where: { usuarioId: { in: idsEliminar } } });
  console.log(`✅ MetaMensual de usuarios eliminados limpiadas`);

  // 8. Eliminar usuarios (excepto los conservados)
  const ue = await prisma.usuario.deleteMany({
    where: { id: { in: idsEliminar } },
  });
  console.log(`✅ Usuarios eliminados: ${ue.count}`);

  // 9. Crear nuevos usuarios
  const hash = await bcrypt.hash(PASSWORD_TEMPORAL, 10);
  console.log("\n👤 Creando nuevos usuarios...");

  for (const u of NUEVOS_USUARIOS) {
    const existe = await prisma.usuario.findUnique({ where: { email: u.email } });
    if (existe) {
      console.log(`   ⚠️  Ya existe: ${u.email} — omitido`);
      continue;
    }
    await prisma.usuario.create({
      data: {
        nombre: u.nombre,
        email:  u.email,
        role:   u.role,
        activo: true,
        password: hash,
      },
    });
    console.log(`   ✅ Creado: ${u.nombre} <${u.email}> [${u.role}]`);
  }

  console.log("\n🎉 Reset completado exitosamente.");
  console.log(`\n🔑 Contraseña temporal de todos los nuevos usuarios: ${PASSWORD_TEMPORAL}`);
  console.log("   Por favor, cámbiala al ingresar por primera vez.\n");
}

main()
  .catch((e) => { console.error("❌ Error:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
