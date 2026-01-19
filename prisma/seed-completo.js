const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Iniciando seed completo...");

  const password = await bcrypt.hash("123456", 10);

  // 1. CONFIGURACION
  console.log("📋 Creando configuración...");
  const config = await prisma.configuracion.upsert({
    where: { id: 1 },
    update: {},
    create: {
      costo_indirecto: 0.10,
      porcentaje_administrativo: 0.17,
      rentabilidad: 0.30,
    },
  });

  // Función para calcular precios
  function calcularPrecios(costoMaterial) {
    const costoParcial1 = costoMaterial * (1 + config.costo_indirecto);
    const costoParcial2 = costoParcial1 * (1 + config.porcentaje_administrativo);
    const precioFinal = costoParcial2 * (1 + config.rentabilidad);
    const margen = precioFinal * config.rentabilidad;
    return { costoParcial1, costoParcial2, precioFinal, margen };
  }

  // 2. USUARIOS - ADMINS
  console.log("👤 Creando usuarios admins...");
  const admin1 = await prisma.usuario.upsert({
    where: { email: "admin@demo.com" },
    update: {},
    create: {
      nombre: "Admin Principal",
      email: "admin@demo.com",
      password,
      role: "ADMIN",
    },
  });

  const admin2 = await prisma.usuario.upsert({
    where: { email: "admin2@demo.com" },
    update: {},
    create: {
      nombre: "Admin Secundario",
      email: "admin2@demo.com",
      password,
      role: "ADMIN",
    },
  });

  // 3. USUARIOS - VENDEDORES
  console.log("👥 Creando vendedores...");
  const vendedor1 = await prisma.usuario.upsert({
    where: { email: "juan@ventas.com" },
    update: {},
    create: {
      nombre: "Juan Pérez",
      nombreComercial: "Juan Ventas",
      email: "juan@ventas.com",
      password,
      role: "VENTAS",
    },
  });

  const vendedor2 = await prisma.usuario.upsert({
    where: { email: "ana@ventas.com" },
    update: {},
    create: {
      nombre: "Ana García",
      nombreComercial: "Ana Ventas",
      email: "ana@ventas.com",
      password,
      role: "VENTAS",
    },
  });

  // 4. CLIENTES CON USUARIOS
  console.log("🏢 Creando clientes con usuarios...");
  const clienteUser1 = await prisma.usuario.upsert({
    where: { email: "carlos@cliente.com" },
    update: {},
    create: {
      nombre: "Carlos Rodríguez",
      email: "carlos@cliente.com",
      password,
      role: "CLIENTE",
    },
  });

  const cliente1 = await prisma.cliente.upsert({
    where: { documento: "20123456789" },
    update: {},
    create: {
      nombreComercial: "Carlos SAC",
      documento: "20123456789",
      nombreContacto: "Carlos Rodríguez",
      telefono: "999111111",
      email: "carlos@cliente.com",
      direccion: "Av. Principal 123, Lima",
      usuarioId: clienteUser1.id,
    },
  });
  const clienteUser2 = await prisma.usuario.upsert({
    where: { email: "maria@cliente.com" },
    update: {},
    create: {
      nombre: "María López",
      email: "maria@cliente.com",
      password,
      role: "CLIENTE",
    },
  });

  await prisma.cliente.upsert({
    where: { documento: "20123456788" },
    update: {},
    create: {
      nombreComercial: "María EIRL",
      documento: "20123456788",
      nombreContacto: "María López",
      telefono: "999222222",
      email: "maria@cliente.com",
      direccion: "Jr. Secundario 456, Lima",
      usuarioId: clienteUser2.id,
    },
  });

  // 5. CLIENTES SIN USUARIO
  console.log("🏢 Creando clientes adicionales...");
  const cliente3 = await prisma.cliente.upsert({
    where: { documento: "20123456787" },
    update: {},
    create: {
      nombreComercial: "Empresa XYZ SAC",
      documento: "20123456787",
      nombreContacto: "Luis Martínez",
      telefono: "999333333",
      email: "luis@empresa.com",
      direccion: "Calle Comercio 789, Lima",
    },
  });

  const cliente4 = await prisma.cliente.upsert({
    where: { documento: "20123456786" },
    update: {},
    create: {
      nombreComercial: "Constructora ABC",
      documento: "20123456786",
      nombreContacto: "Sofía Ramírez",
      telefono: "999444444",
      email: "sofia@constructora.com",
      direccion: "Av. Industrial 101, Lima",
    },
  });

  // 6. PRODUCTOS
  console.log("📦 Creando productos...");
  const productosData = [
    {
      categoria: "IMPRESIONES",
      servicio: "Vinil Básico",
      material: "vinil basico m²",
      unidad: "m2",
      costo_material: 25,
    },
    {
      categoria: "IMPRESIONES",
      servicio: "Vinil Retroiluminado",
      material: "vinil retroiluminado",
      unidad: "m2",
      costo_material: 35,
    },
    {
      categoria: "IMPRESIONES",
      servicio: "Banner Delgado",
      material: "banner delgado m²",
      unidad: "m2",
      costo_material: 8,
    },
    {
      categoria: "INSTALACIONES",
      servicio: "Instalación Vinil",
      material: "mano de obra",
      unidad: "m2",
      costo_material: 15,
    },
    {
      categoria: "INSTALACIONES",
      servicio: "Instalación Banner",
      material: "mano de obra",
      unidad: "m2",
      costo_material: 10,
    },
    {
      categoria: "LETREROS",
      servicio: "Letrero 3D",
      material: "acrílico",
      unidad: "pieza",
      costo_material: 50,
    },
    {
      categoria: "LETREROS",
      servicio: "Letrero Luminoso",
      material: "neón",
      unidad: "pieza",
      costo_material: 100,
    },
  ];

  const productos = [];
  for (const prod of productosData) {
    const precios = calcularPrecios(prod.costo_material);
    const producto = await prisma.producto.upsert({
      where: { id: productos.length + 1 },
      update: {},
      create: {
        categoria: prod.categoria,
        servicio: prod.servicio,
        material: prod.material,
        unidad: prod.unidad,
        costo_material: prod.costo_material,
        costo_parcial_1: precios.costoParcial1,
        costo_parcial_2: precios.costoParcial2,
        precio_final: precios.precioFinal,
        margen: precios.margen,
        nombre: prod.servicio,
      },
    });
    productos.push(producto);
  }

  // 7. PRODUCTOS ADICIONALES
  console.log("➕ Creando productos adicionales...");
  const adicionales = [];
  for (const prod of productos.slice(0, 3)) { // Para los primeros 3 productos
    const adicional = await prisma.productoAdicional.upsert({
      where: { id: adicionales.length + 1 },
      update: {},
      create: {
        nombre: "Instalación Especial",
        precio: 20,
        productoId: prod.id,
      },
    });
    adicionales.push(adicional);
  }

  // 8. METAS MENSUALES
  console.log("🎯 Creando metas mensuales...");
  const metas = [
    { usuarioId: vendedor1.id, monto: 50000, mes: 1, anio: 2026 },
    { usuarioId: vendedor1.id, monto: 55000, mes: 2, anio: 2026 },
    { usuarioId: vendedor2.id, monto: 45000, mes: 1, anio: 2026 },
    { usuarioId: vendedor2.id, monto: 48000, mes: 2, anio: 2026 },
  ];

  for (const meta of metas) {
    await prisma.metaMensual.upsert({
      where: { usuarioId_mes_anio: { usuarioId: meta.usuarioId, mes: meta.mes, anio: meta.anio } },
      update: {},
      create: meta,
    });
  }

  // 9. COTIZACIONES
  console.log("📄 Creando cotizaciones...");
  const cotizacionesData = [
    {
      numero: "COT-2026-001",
      clienteId: cliente1.id,
      usuarioId: vendedor1.id,
      estado: "PENDIENTE",
      items: [
        { productoId: productos[0].id, cantidad: 10, descripcion: "Vinil para fachada" },
        { productoId: productos[3].id, cantidad: 10, descripcion: "Instalación correspondiente" },
      ],
    },
    {
      numero: "COT-2026-002",
      clienteId: cliente3.id,
      usuarioId: vendedor2.id,
      estado: "APROBADA",
      items: [
        { productoId: productos[1].id, cantidad: 5, descripcion: "Vinil retroiluminado" },
        { productoId: productos[4].id, cantidad: 5, descripcion: "Instalación" },
      ],
    },
    {
      numero: "COT-2026-003",
      clienteId: cliente4.id,
      usuarioId: vendedor1.id,
      estado: "FACTURADA",
      items: [
        { productoId: productos[5].id, cantidad: 2, descripcion: "Letreros 3D" },
      ],
    },
  ];

  for (const cotData of cotizacionesData) {
    let total = 0;
    const items = [];

    for (const item of cotData.items) {
      const producto = productos.find(p => p.id === item.productoId);
      const subtotal = producto.precio_final * item.cantidad;
      total += subtotal;

      items.push({
        productoId: item.productoId,
        cantidad: item.cantidad,
        precio: producto.precio_final,
        subtotal,
        descripcion: item.descripcion,
      });
    }

    const cotizacion = await prisma.cotizacion.upsert({
      where: { numero: cotData.numero },
      update: {},
      create: {
        numero: cotData.numero,
        total,
        estado: cotData.estado,
        clienteId: cotData.clienteId,
        usuarioId: cotData.usuarioId,
        items: {
          create: items,
        },
      },
    });

    // Agregar adicionales a algunos items
    if (cotData.numero === "COT-2026-001") {
      const item = await prisma.cotizacionItem.findFirst({
        where: { cotizacionId: cotizacion.id, productoId: productos[0].id },
      });
      if (item && adicionales[0]) {
        await prisma.cotizacionAdicional.create({
          data: {
            cotizacionItemId: item.id,
            adicionalId: adicionales[0].id,
            seleccionado: true,
            precio: adicionales[0].precio * 1.47, // Aplicar aumentos
          },
        });
      }
    }
  }

  console.log("✅ Seed completo ejecutado correctamente!");
  console.log("Datos creados:");
  console.log("- 2 Admins");
  console.log("- 2 Vendedores");
  console.log("- 2 Clientes con usuario");
  console.log("- 2 Clientes sin usuario");
  console.log("- 7 Productos");
  console.log("- 3 Productos adicionales");
  console.log("- 4 Metas mensuales");
  console.log("- 3 Cotizaciones con items");
}

main()
  .catch((e) => {
    console.error("❌ Error en seed:", e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });