-- Agrega el estado OCUPADO_EXTERNO para reservas de paneles externos ya ocupados
-- (por un tercero) que podremos alquilar cuando termine ese contrato.
ALTER TYPE "EstadoPanel" ADD VALUE 'OCUPADO_EXTERNO';

-- Clasifica si el panel es propio o lo gestionamos por cuenta de un tercero.
CREATE TYPE "PropiedadPanel" AS ENUM ('PROPIO', 'EXTERNO');

ALTER TABLE "Panel" ADD COLUMN "propiedad" "PropiedadPanel" NOT NULL DEFAULT 'PROPIO';

-- Las reservas *_EXTERNO son solo un registro de referencia (sin cliente/precio propio).
ALTER TABLE "Reserva" ALTER COLUMN "clienteId" DROP NOT NULL;
ALTER TABLE "Reserva" ALTER COLUMN "precioMensual" DROP NOT NULL;
