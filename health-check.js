const express = require("express");
const { PrismaClient } = require("@prisma/client");

const app = express();
const prisma = new PrismaClient();

app.get("/api/health", async (req, res) => {
  try {
    // Verificar conexión a base de datos
    await prisma.$connect();

    // Verificar que hay usuarios
    const userCount = await prisma.usuario.count();

    // Verificar variables de entorno críticas
    const envStatus = {
      NODE_ENV: process.env.NODE_ENV,
      DATABASE_URL: process.env.DATABASE_URL ? "✅ Configurada" : "❌ Faltante",
      JWT_SECRET: process.env.JWT_SECRET ? "✅ Configurada" : "❌ Faltante",
      PORT: process.env.PORT,
      FRONTEND_URL: process.env.FRONTEND_URL,
      MAIL_HOST: process.env.MAIL_HOST ? "✅ Configurada" : "❌ Faltante"
    };

    res.json({
      status: "✅ Backend funcionando",
      database: "✅ Conectada",
      users_count: userCount,
      environment: envStatus,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({
      status: "❌ Error interno",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  } finally {
    await prisma.$disconnect();
  }
});

module.exports = app;