// backend/prisma/setup-enero-2026.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function setup() {
  try {
    console.log('🚀 Configurando datos para ENERO 2026...\n');

    const mes = 1; // Enero
    const anio = 2026;
    const primerDia = new Date(2026, 0, 1);
    const ultimoDia = new Date(2026, 0, 31, 23, 59, 59);

    // ==================== PASO 1: VENDEDORES ====================
    console.log('👥 PASO 1: Verificando vendedores...');
    const vendedores = await prisma.usuario.findMany({
      where: { role: 'VENTAS', activo: true }
    });

    if (vendedores.length === 0) {
      console.log('⚠️  No hay vendedores. Créalos primero.');
      return;
    }
    vendedores.forEach(v => console.log(`   - ${v.nombre} (${v.email})`));

    // ==================== PASO 2: METAS ====================
    console.log('\n🎯 PASO 2: Configurando metas...');
    const metasConfig = [
      { monto: 50000, vendedorIndex: 0 },
      { monto: 45000, vendedorIndex: 1 },
      { monto: 55000, vendedorIndex: 2 },
    ];

    for (let i = 0; i < vendedores.length; i++) {
      const vendedor = vendedores[i];
      const montoMeta = metasConfig[i]?.monto || 40000;

      await prisma.metaMensual.upsert({
        where: { usuarioId_mes_anio: { usuarioId: vendedor.id, mes, anio } },
        update: { monto: montoMeta },
        create: { usuarioId: vendedor.id, monto: montoMeta, mes, anio }
      });

      console.log(`   ✅ ${vendedor.nombre}: S/ ${montoMeta}`);
    }

    // ==================== PASO 3: CLIENTES Y PRODUCTOS ====================
    console.log('\n📦 PASO 3: Obteniendo clientes y productos...');
    const clientes = await prisma.cliente.findMany();
    const productos = await prisma.producto.findMany();

    if (clientes.length === 0 || productos.length === 0) {
      console.log('⚠️  Necesitas clientes y productos antes de crear cotizaciones.');
      return;
    }
    console.log(`   ✅ ${clientes.length} clientes encontrados`);
    console.log(`   ✅ ${productos.length} productos encontrados`);

    // ==================== PASO 4: COTIZACIONES ====================
    console.log('\n📝 PASO 4: Creando cotizaciones ENERO 2026...');
    let totalCreadas = 0;
    const timestamp = Date.now();

    for (const vendedor of vendedores) {
      console.log(`   📊 Cotizaciones para ${vendedor.nombre}...`);

      for (let i = 1; i <= 10; i++) {
        const dia = Math.floor(Math.random() * 31) + 1;
        const fecha = new Date(2026, 0, dia);

        // Estados distribuidos
        const rand = Math.random();
        let estado;
        if (rand < 0.4) estado = 'FACTURADA';
        else if (rand < 0.7) estado = 'APROBADA';
        else if (rand < 0.9) estado = 'PENDIENTE';
        else estado = 'RECHAZADA';

        // Cliente y producto aleatorio
        const cliente = clientes[Math.floor(Math.random() * clientes.length)];
        const producto = productos[Math.floor(Math.random() * productos.length)];
        const cantidad = Math.floor(Math.random() * 5) + 1;
        const subtotal = producto.precio_final * cantidad;

        const numero = `COT-ENE-${timestamp}-${vendedor.id}-${i}`;

        await prisma.cotizacion.create({
          data: {
            numero,
            total: subtotal,
            estado,
            createdAt: fecha,
            clienteId: cliente.id,
            usuarioId: vendedor.id,
            items: {
              create: [
                {
                  productoId: producto.id,
                  cantidad,
                  precio: producto.precio_final,
                  subtotal,
                }
              ]
            }
          }
        });

        totalCreadas++;
      }
      console.log(`      ✅ 10 cotizaciones creadas`);
    }

    console.log(`\n🎉 Total: ${totalCreadas} cotizaciones creadas para ENERO 2026`);

    // ==================== PASO 5: RESUMEN ====================
    console.log('\n📊 RESUMEN FINAL\n');
    const statsEnero = await Promise.all([
      prisma.cotizacion.count({ where: { estado: 'PENDIENTE', createdAt: { gte: primerDia, lte: ultimoDia } } }),
      prisma.cotizacion.count({ where: { estado: 'APROBADA', createdAt: { gte: primerDia, lte: ultimoDia } } }),
      prisma.cotizacion.count({ where: { estado: 'RECHAZADA', createdAt: { gte: primerDia, lte: ultimoDia } } }),
      prisma.cotizacion.count({ where: { estado: 'FACTURADA', createdAt: { gte: primerDia, lte: ultimoDia } } }),
    ]);

    console.log(`   PENDIENTE:  ${statsEnero[0]}`);
    console.log(`   APROBADA:   ${statsEnero[1]}`);
    console.log(`   RECHAZADA:  ${statsEnero[2]}`);
    console.log(`   FACTURADA:  ${statsEnero[3]}`);

    for (const vendedor of vendedores) {
      const meta = await prisma.metaMensual.findUnique({
        where: { usuarioId_mes_anio: { usuarioId: vendedor.id, mes, anio } }
      });

      const facturado = await prisma.cotizacion.aggregate({
        where: { usuarioId: vendedor.id, estado: 'FACTURADA', createdAt: { gte: primerDia, lte: ultimoDia } },
        _sum: { total: true }
      });

      const avance = facturado._sum.total || 0;
      const metaMonto = meta?.monto || 0;
      const porcentaje = metaMonto > 0 ? ((avance / metaMonto) * 100).toFixed(1) : 0;

      console.log(`\n${vendedor.nombre}:`);
      console.log(`   Meta:      S/ ${metaMonto.toLocaleString('es-PE')}`);
      console.log(`   Facturado: S/ ${avance.toLocaleString('es-PE')}`);
      console.log(`   Progreso:  ${porcentaje}%`);
    }

    console.log('\n✅ ¡Configuración completada exitosamente!\n');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

setup();
