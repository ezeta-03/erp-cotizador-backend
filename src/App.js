const express = require("express");
const cors = require("cors");

const app = express();
app.use(
  cors({
    origin: [
      "https://erp-cotizador-frontend.vercel.app",
      "http://localhost:5173" // Para desarrollo local
    ],
    credentials: false, // Cambiado a false ya que usas JWT en headers
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

module.exports = app;
