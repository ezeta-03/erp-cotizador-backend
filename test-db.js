const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testConnection() {
  try {
    await prisma.$connect();
    console.log('✅ Conexión exitosa a la base de datos');
    
    const users = await prisma.usuario.findMany();
    console.log(`📊 Usuarios encontrados: ${users.length}`);
  } catch (error) {
    console.error('❌ Error de conexión:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();