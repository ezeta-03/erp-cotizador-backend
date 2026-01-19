const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testConnection() {
  console.log('🔍 Diagnóstico de conexión a base de datos\n');

  try {
    console.log('🔌 Probando conexión...');
    await prisma.$connect();
    console.log('✅ Conexión exitosa a la base de datos');

    // Verificar tablas
    console.log('\n📋 Verificando tablas...');

    const tables = [
      { name: 'Usuario', model: 'usuario' },
      { name: 'Cliente', model: 'cliente' },
      { name: 'Producto', model: 'producto' },
      { name: 'Cotizacion', model: 'cotizacion' },
      { name: 'Configuracion', model: 'configuracion' }
    ];

    for (const table of tables) {
      try {
        const count = await prisma[table.model].count();
        console.log(`✅ Tabla ${table.name}: ${count} registros`);
      } catch (error) {
        console.log(`❌ Tabla ${table.name}: Error - ${error.message}`);
      }
    }

    // Verificar usuario admin
    console.log('\n👤 Verificando usuario admin...');
    try {
      const adminUser = await prisma.usuario.findFirst({
        where: { role: 'ADMIN' }
      });

      if (adminUser) {
        console.log(`✅ Usuario admin encontrado: ${adminUser.nombre} (${adminUser.username})`);
      } else {
        console.log('❌ No se encontró usuario admin');
      }
    } catch (error) {
      console.log(`❌ Error buscando admin: ${error.message}`);
    }

    // Verificar configuración
    console.log('\n⚙️ Verificando configuración...');
    try {
      const config = await prisma.configuracion.findFirst();
      if (config) {
        console.log('✅ Configuración encontrada');
        console.log(`   - Costo indirecto: ${(config.costo_indirecto * 100).toFixed(1)}%`);
        console.log(`   - Administrativo: ${(config.porcentaje_administrativo * 100).toFixed(1)}%`);
        console.log(`   - Rentabilidad: ${(config.rentabilidad * 100).toFixed(1)}%`);
      } else {
        console.log('❌ No se encontró configuración');
      }
    } catch (error) {
      console.log(`❌ Error obteniendo configuración: ${error.message}`);
    }

  } catch (error) {
    console.error('❌ Error de conexión:', error.message);
    console.error('Stack:', error.stack);

    // Diagnóstico específico para Supabase
    if (error.message.includes('Tenant or user not found')) {
      console.log('\n💡 Diagnóstico Supabase:');
      console.log('   - Verificar que la base de datos existe en Supabase');
      console.log('   - Revisar las credenciales en DATABASE_URL');
      console.log('   - Asegurarse de que el proyecto Supabase esté activo');
      console.log('   - Verificar que las tablas estén creadas (ejecutar: npx prisma migrate deploy)');
    }

    if (error.message.includes('connect ECONNREFUSED')) {
      console.log('\n💡 Diagnóstico de conexión:');
      console.log('   - Verificar que la URL de Supabase sea correcta');
      console.log('   - Revisar la conectividad a internet');
      console.log('   - Verificar que el puerto 5432 esté abierto');
    }

  } finally {
    await prisma.$disconnect();
    console.log('\n🏁 Diagnóstico completado');
  }
}

testConnection();