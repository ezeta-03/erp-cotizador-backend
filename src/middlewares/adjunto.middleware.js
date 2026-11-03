const multer = require("multer");
const { TAMANO_MAXIMO } = require("../services/almacenamiento.service");

// Recibe un archivo opcional en el campo "archivo" (multipart) y responde 400
// con un mensaje claro si es muy grande. Sin multipart, deja pasar el JSON.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: TAMANO_MAXIMO, files: 1 } });

module.exports = (req, res, next) =>
  upload.single("archivo")(req, res, (err) => {
    if (!err) return next();
    res.status(400).json({ message: err.code === "LIMIT_FILE_SIZE" ? "El archivo supera los 5 MB" : err.message });
  });
