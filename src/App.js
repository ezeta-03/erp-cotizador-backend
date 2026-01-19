const express = require("express");
const cors = require("cors");

const app = express();
app.use(
  cors({
    origin: "*", // Permitir cualquier origin para debugging
    credentials: false,
  })
);

const authRoutes = require("./routes/auth.routes");
const cotizacionesRoutes = require("./routes/cotizaciones.routes");
const clientesRoutes = require("./routes/clientes.routes");
const productosRoutes = require("./routes/productos.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const statsRoutes = require("./routes/stats.routes");
const usuariosRoutes = require("./routes/usuarios.routes");
const configuracionRouter = require("./routes/configuracion.routes");

// app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/cotizaciones", cotizacionesRoutes);
app.use("/api/clientes", clientesRoutes);
app.use("/api/productos", productosRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/usuarios", usuariosRoutes);
app.use("/api/configuracion", configuracionRouter);

// Health check endpoint
app.get("/api/health", async (req, res) => {
  try {
    const { PrismaClient } = require("@prisma/client");
    const prisma = new PrismaClient();

    // Verificar conexión a base de datos
    await prisma.$connect();
    const userCount = await prisma.usuario.count();
    await prisma.$disconnect();

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
  }
});

module.exports = app;
