require("dotenv").config();
const app = require("./App");
const PORT = process.env.PORT || 4000;

app.get("/", (req, res) => {
  res.send("Backend ERP Cotizador funcionando 🚀");
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
