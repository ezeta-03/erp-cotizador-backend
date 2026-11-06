// Rutas PÚBLICAS para el marketplace Zaazmago Outdoor. Solo consulta de RUC y DNI
// (Migo): nada más del ERP se expone sin sesión. Se monta en app.js ANTES del CORS
// general, con su propio CORS, para que el dominio del marketplace no alcance
// ninguna otra ruta.
//
//   GET /api/publico/identidad/ruc/:ruc → { ruc, name, address, estado, condicion, ok }
//   GET /api/publico/identidad/dni/:dni → { dni, name }
//
// Cada consulta a Migo gasta créditos, por eso: caché, límite por IP y tope diario.
const router = require("express").Router();
const cors = require("cors");
const migo = require("../services/migo.client");

const origenes = [
  process.env.MARKETPLACE_URL, // ej. https://outdoor.zaazmago.com (puede ser una lista separada por comas)
  "http://localhost:5173",
]
  .filter(Boolean)
  .flatMap((url) => url.split(","))
  .map((url) => url.trim().replace(/\/+$/, ""));

router.use(
  cors({
    origin: (origin, callback) => callback(null, !origin || origenes.includes(origin)),
    methods: ["GET"],
    credentials: false,
  })
);

// Solo GET; cualquier otro método o ruta bajo /api/publico responde 404.
router.use((req, res, next) => (req.method === "GET" ? next() : res.status(405).json({ message: "Método no permitido" })));

/* ---------- Límites ---------- */
const POR_IP_HORA = Number(process.env.PUBLICO_LIMITE_IP_HORA || 30);
const TOPE_DIARIO = Number(process.env.PUBLICO_TOPE_DIARIO || 500);
const CACHE_MS = 12 * 60 * 60 * 1000;

const porIp = new Map(); // ip -> [timestamps]
const cache = new Map(); // "ruc:20131312955" -> { en, cuerpo }
let dia = { fecha: "", consultas: 0 };

function limitar(req, res, next) {
  const ahora = Date.now();
  const ip = req.ip || "desconocida";
  const recientes = (porIp.get(ip) || []).filter((t) => ahora - t < 60 * 60 * 1000);
  if (recientes.length >= POR_IP_HORA) {
    res.set("Retry-After", "3600");
    return res.status(429).json({ message: "Hiciste muchas consultas seguidas. Intenta de nuevo en un rato." });
  }
  recientes.push(ahora);
  porIp.set(ip, recientes);
  // Limpieza ocasional para que el mapa no crezca sin fin.
  if (porIp.size > 5000) for (const [k, v] of porIp) if (!v.some((t) => ahora - t < 60 * 60 * 1000)) porIp.delete(k);
  next();
}

function dentroDelTope() {
  const hoy = new Date().toISOString().slice(0, 10);
  if (dia.fecha !== hoy) dia = { fecha: hoy, consultas: 0 };
  if (dia.consultas >= TOPE_DIARIO) return false;
  dia.consultas += 1;
  return true;
}

function responderError(res, error) {
  const status = error instanceof migo.ErrorMigo ? error.status : 500;
  if (status === 404) return res.status(404).json({ message: "No encontramos ese documento" });
  if (status === 400) return res.status(400).json({ message: "Documento no válido" });
  // No se exponen detalles internos (token, créditos, etc.).
  console.error("⚠️ Consulta pública de identidad:", error.message);
  res.status(503).json({ message: "La consulta no está disponible en este momento" });
}

async function consultar(clave, res, buscar) {
  const hit = cache.get(clave);
  if (hit && Date.now() - hit.en < CACHE_MS) return res.json(hit.cuerpo);
  if (!dentroDelTope()) return res.status(503).json({ message: "La consulta no está disponible en este momento" });
  try {
    const cuerpo = await buscar();
    cache.set(clave, { en: Date.now(), cuerpo });
    if (cache.size > 20000) cache.delete(cache.keys().next().value);
    res.json(cuerpo);
  } catch (error) {
    responderError(res, error);
  }
}

/* ---------- Rutas ---------- */
router.get("/identidad/ruc/:ruc", limitar, (req, res) => {
  const ruc = String(req.params.ruc);
  if (!/^(10|15|16|17|20)\d{9}$/.test(ruc)) return res.status(400).json({ message: "Ingresa un RUC válido de 11 dígitos." });
  consultar(`ruc:${ruc}`, res, async () => {
    const r = await migo.consultarRuc(ruc);
    // Solo datos públicos de SUNAT.
    return {
      ruc: r.numDoc,
      name: r.nombre,
      address: r.direccion || "",
      estado: r.estado,
      condicion: r.condicion,
      ok: r.estado === "ACTIVO" && r.condicion === "HABIDO",
    };
  });
});

router.get("/identidad/dni/:dni", limitar, (req, res) => {
  const dni = String(req.params.dni);
  if (!/^\d{8}$/.test(dni)) return res.status(400).json({ message: "Ingresa un DNI válido de 8 dígitos." });
  consultar(`dni:${dni}`, res, async () => {
    const r = await migo.consultarDni(dni);
    return { dni: r.numDoc, name: r.nombre };
  });
});

router.use((req, res) => res.status(404).json({ message: "No encontrado" }));

module.exports = router;
