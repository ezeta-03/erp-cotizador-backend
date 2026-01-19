const { Client } = require('pg');
require('dotenv').config();

async function initDatabase() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL.replace('?sslmode=require', ''),
    ssl: false // Deshabilitar SSL por completo para probar
  });

  try {
    console.log('🔌 Conectando a Supabase...');
    await client.connect();
    console.log('✅ Conexión exitosa');

    // Verificar si las tablas existen
    const tablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    console.log('📋 Tablas existentes:', tablesResult.rows.map(r => r.table_name));

    if (tablesResult.rows.length === 0) {
      console.log('🏗️ Creando esquema de base de datos...');

      // Crear tablas manualmente basadas en el schema.prisma
      await client.query(`
        CREATE TABLE IF NOT EXISTS "Usuario" (
          "id" SERIAL PRIMARY KEY,
          "email" VARCHAR(255) UNIQUE NOT NULL,
          "password" VARCHAR(255) NOT NULL,
          "nombre" VARCHAR(255) NOT NULL,
          "apellido" VARCHAR(255),
          "rol" VARCHAR(50) NOT NULL DEFAULT 'vendedor',
          "activo" BOOLEAN NOT NULL DEFAULT true,
          "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS "Cliente" (
          "id" SERIAL PRIMARY KEY,
          "nombre" VARCHAR(255) NOT NULL,
          "email" VARCHAR(255),
          "telefono" VARCHAR(50),
          "empresa" VARCHAR(255),
          "direccion" TEXT,
          "ciudad" VARCHAR(100),
          "estado" VARCHAR(100),
          "codigoPostal" VARCHAR(20),
          "notas" TEXT,
          "activo" BOOLEAN NOT NULL DEFAULT true,
          "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          "usuarioId" INTEGER REFERENCES "Usuario"(id)
        );

        CREATE TABLE IF NOT EXISTS "Producto" (
          "id" SERIAL PRIMARY KEY,
          "codigo" VARCHAR(100) UNIQUE NOT NULL,
          "nombre" VARCHAR(255) NOT NULL,
          "descripcion" TEXT,
          "categoria" VARCHAR(100),
          "precioBase" DECIMAL(10,2) NOT NULL,
          "unidad" VARCHAR(50) DEFAULT 'pieza',
          "activo" BOOLEAN NOT NULL DEFAULT true,
          "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS "Cotizacion" (
          "id" SERIAL PRIMARY KEY,
          "numero" VARCHAR(50) UNIQUE NOT NULL,
          "clienteId" INTEGER REFERENCES "Cliente"(id),
          "usuarioId" INTEGER REFERENCES "Usuario"(id) NOT NULL,
          "fechaCreacion" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          "fechaExpiracion" TIMESTAMP,
          "estado" VARCHAR(50) DEFAULT 'borrador',
          "subtotal" DECIMAL(10,2) DEFAULT 0,
          "iva" DECIMAL(10,2) DEFAULT 0,
          "total" DECIMAL(10,2) DEFAULT 0,
          "notas" TEXT,
          "condiciones" TEXT,
          "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS "CotizacionProducto" (
          "id" SERIAL PRIMARY KEY,
          "cotizacionId" INTEGER REFERENCES "Cotizacion"(id) ON DELETE CASCADE,
          "productoId" INTEGER REFERENCES "Producto"(id),
          "cantidad" INTEGER NOT NULL,
          "precioUnitario" DECIMAL(10,2) NOT NULL,
          "descuento" DECIMAL(5,2) DEFAULT 0,
          "subtotal" DECIMAL(10,2) NOT NULL,
          "notas" TEXT,
          "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS "Configuracion" (
          "id" SERIAL PRIMARY KEY,
          "clave" VARCHAR(100) UNIQUE NOT NULL,
          "valor" TEXT,
          "descripcion" TEXT,
          "tipo" VARCHAR(50) DEFAULT 'string',
          "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Crear índices
        CREATE INDEX IF NOT EXISTS "Usuario_email_idx" ON "Usuario"("email");
        CREATE INDEX IF NOT EXISTS "Cliente_email_idx" ON "Cliente"("email");
        CREATE INDEX IF NOT EXISTS "Producto_codigo_idx" ON "Producto"("codigo");
        CREATE INDEX IF NOT EXISTS "Cotizacion_numero_idx" ON "Cotizacion"("numero");
        CREATE INDEX IF NOT EXISTS "Cotizacion_clienteId_idx" ON "Cotizacion"("clienteId");
        CREATE INDEX IF NOT EXISTS "Cotizacion_usuarioId_idx" ON "Cotizacion"("usuarioId");
        CREATE INDEX IF NOT EXISTS "CotizacionProducto_cotizacionId_idx" ON "CotizacionProducto"("cotizacionId");
        CREATE INDEX IF NOT EXISTS "Configuracion_clave_idx" ON "Configuracion"("clave");
      `);

      console.log('✅ Esquema creado exitosamente');
    } else {
      console.log('ℹ️ La base de datos ya tiene tablas');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

initDatabase();