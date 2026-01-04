const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkEstados() {
  try {
    console.log('🔍 Verificando estados de cotizaciones...\n');

    // Contar por estado
    const pendientes = await prisma.cotizacion.count({ where: { estado: 'PENDIENTE' } });
    const aprobadas = await prisma.cotizacion.count({ where: { estado: 'APROBADA' } });
    const rechazadas = await prisma.cotizacion.count({ where: { estado: 'RECHAZADA' } });
    const facturadas = await prisma.cotizacion.count({ where: { estado: 'FACTURADA' } });

    console.log('📊 Cotizaciones por estado:');
    console.log(`  PENDIENTE:  ${pendientes}`);
    console.log(`  APROBADA:   ${aprobadas}`);
    console.log(`  RECHAZADA:  ${rechazadas}`);
    console.log(`  FACTURADA:  ${facturadas}`);

    // Ver todas las cotizaciones
    const todas = await prisma.cotizacion.findMany({
      select: {
        id: true,
        numero: true,
        estado: true,
        total: true,
        createdAt: true,
        usuario: {
          select: {
            nombre: true,
            role: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    console.log('\n📋 Todas las cotizaciones:');
    console.table(todas.map(c => ({
      Número: c.numero,
      Estado: c.estado,
      Total: c.total,
      Vendedor: c.usuario.nombre,
      Fecha: c.createdAt.toLocaleDateString('es-PE')
    })));

    // Verificar vendedores
    const vendedores = await prisma.usuario.findMany({
      where: { role: 'VENTAS' },
      select: {
        id: true,
        nombre: true,
        email: true,
        _count: {
          select: {
            cotizaciones: true
          }
        }
      }
    });

    console.log('\n👥 Vendedores y sus cotizaciones:');
    console.table(vendedores.map(v => ({
      Nombre: v.nombre,
      Email: v.email,
      Cotizaciones: v._count.cotizaciones
    })));

    // Verificar metas
    const metas = await prisma.metaMensual.findMany({
      include: {
        usuario: {
          select: {
            nombre: true
          }
        }
      }
    });

    console.log('\n🎯 Metas mensuales:');
    if (metas.length === 0) {
      console.log('  ⚠️  No hay metas configuradas');
    } else {
      console.table(metas.map(m => ({
        Vendedor: m.usuario.nombre,
        Monto: m.monto,
        Mes: m.mes,
        Año: m.anio
      })));
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkEstados();