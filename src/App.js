const express = require("express");
const cors = require("cors");

const app = express();
app.disable('etag'); // evita 304 Not Modified con datos obsoletos

// Render pone un proxy delante: sin esto req.ip sería la IP del proxy y el
// límite por IP de las rutas públicas no funcionaría.
app.set("trust proxy", 1);

// Marketplace: solo consulta de RUC/DNI, con su propio CORS. Va antes del CORS
// general para que el dominio del marketplace no llegue a ninguna otra ruta.
app.use("/api/publico", require("./routes/publico.routes"));

const allowedOrigins = [
  process.env.FRONTEND_URL,
  "https://erp.zaazmagoholding.com",
  "https://erp-zaazmago.web.app",
  "https://erp-zaazmago.firebaseapp.com",
  "http://localhost:5173",
]
  .filter(Boolean)
  .map((url) => url.replace(/\/+$/, ""));

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin no permitido: ${origin}`));
      }
    },
    credentials: false,
  })
);

const authRoutes = require("./routes/auth.routes");
const cotizacionesRoutes = require("./routes/cotizaciones.routes");
const clientesRoutes = require("./routes/clientes.routes");
const productosRoutes = require("./routes/productos.routes");
const statsRoutes = require("./routes/stats.routes");
const usuariosRoutes = require("./routes/usuarios.routes");
const configuracionRouter = require("./routes/configuracion.routes");
const solicitudesMargenRoutes = require("./routes/solicitudesMargen.routes");
const panelesRoutes           = require("./routes/paneles.routes");
const proveedoresRoutes       = require("./routes/proveedores.routes");
const reservasRoutes          = require("./routes/reservas.routes");
const parametrosCostoMupiRoutes = require("./routes/parametrosCostoMupi.routes");
const rentabilidadRoutes      = require("./routes/rentabilidad.routes");
const eventosProduccionRoutes = require("./routes/eventosProduccion.routes");
const dashboardRoutes         = require("./routes/dashboard.routes");
const panelWidgetsRoutes      = require("./routes/panelWidgets.routes");
const almacenRoutes           = require("./routes/almacen.routes");
const proyectosRoutes         = require("./routes/proyectos.routes");
const modulosRolRoutes        = require("./routes/modulosRol.routes");
const comprobantesRoutes      = require("./routes/comprobantes.routes");
const cuentasPorCobrarRoutes  = require("./routes/cuentasPorCobrar.routes");
const cuentasPorPagarRoutes   = require("./routes/cuentasPorPagar.routes");
const cajaBancosRoutes        = require("./routes/cajaBancos.routes");
const libroMayorRoutes        = require("./routes/libroMayor.routes");
const flujoEfectivoRoutes     = require("./routes/flujoEfectivo.routes");
const comprasRoutes            = require("./routes/compras.routes");

// app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/cotizaciones", cotizacionesRoutes);
app.use("/api/clientes", clientesRoutes);
app.use("/api/productos", productosRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/usuarios", usuariosRoutes);
app.use("/api/configuracion", configuracionRouter);
app.use("/api/solicitudes-margen", solicitudesMargenRoutes);
app.use("/api/paneles",           panelesRoutes);
app.use("/api/proveedores",       proveedoresRoutes);
app.use("/api/reservas",          reservasRoutes);
app.use("/api/parametros-costo-mupi", parametrosCostoMupiRoutes);
app.use("/api/rentabilidad",      rentabilidadRoutes);
app.use("/api/eventos-produccion", eventosProduccionRoutes);
app.use("/api/dashboard",         dashboardRoutes);
app.use("/api/panel-widgets",     panelWidgetsRoutes);
app.use("/api/almacen",           almacenRoutes);
app.use("/api/proyectos",         proyectosRoutes);
app.use("/api/modulos-rol",       modulosRolRoutes);
app.use("/api/comprobantes",      comprobantesRoutes);
app.use("/api/cuentas-por-cobrar", cuentasPorCobrarRoutes);
app.use("/api/cuentas-por-pagar", cuentasPorPagarRoutes);
app.use("/api/caja-bancos",      cajaBancosRoutes);
app.use("/api/libro-mayor",      libroMayorRoutes);
app.use("/api/flujo-efectivo",   flujoEfectivoRoutes);
app.use("/api/compras",          comprasRoutes);
app.use("/api/servicios-netwise", require("./routes/serviciosNetwise.routes"));

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
