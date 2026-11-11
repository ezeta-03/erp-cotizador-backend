const prisma = require("../config/prisma");
const { r2, hoyLima } = require("../services/cobros.service");
const { fechaLima } = require("../services/antiguedad.service");
const { TIPOS_CUENTA, MONEDAS, movimientosDe, saldoDe, cuentasParaDocumentos } = require("../services/cajaBancos.service");

// Caja y Bancos: cuentas de la empresa con su saldo. Los movimientos salen de
// los cobros (Cuentas por cobrar), pagos y cuotas de paneles (Cuentas por pagar).

function responderError(res, error, contexto) {
  if (Number.isInteger(error.status) && error.status < 600) return res.status(error.status).json({ message: error.message });
  console.error(`❌ Error ${contexto}:`, error);
  res.status(500).json({ message: `Error ${contexto}`, error: error.message });
}
const errorValidacion = (mensaje, status = 400) => Object.assign(new Error(mensaje), { status });
const texto = (v, max = 120) => (v === undefined || v === null ? null : String(v).trim().slice(0, max) || null);
const fechaValida = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || "");

const conSaldo = async (c) => ({ ...c, fechaSaldoInicial: fechaLima(c.fechaSaldoInicial), ...(await saldoDe(c)) });

// GET /para-documentos — cuentas que se pueden imprimir en cotizaciones y
// comprobantes (sin saldos: también la usa Ventas).
exports.paraDocumentos = async (req, res) => {
  try {
    res.json(await cuentasParaDocumentos());
  } catch (error) {
    responderError(res, error, "listando cuentas para documentos");
  }
};

// GET / — cuentas (activas e inactivas) con su saldo y el total por moneda de las activas.
exports.listar = async (req, res) => {
  try {
    const cuentas = await prisma.cuentaFinanciera.findMany({ orderBy: [{ activo: "desc" }, { orden: "asc" }, { nombre: "asc" }] });
    const conSaldos = await Promise.all(cuentas.map(conSaldo));
    const totales = {};
    for (const c of conSaldos.filter((x) => x.activo)) totales[c.moneda] = r2((totales[c.moneda] || 0) + c.saldo);
    res.json({ cuentas: conSaldos, totales, tipos: TIPOS_CUENTA, monedas: MONEDAS });
  } catch (error) {
    responderError(res, error, "listando cuentas");
  }
};

async function datosCuenta(body, actual = null) {
  const data = {};
  if (!actual || body.nombre !== undefined) {
    const nombre = texto(body.nombre, 80);
    if (!nombre) throw errorValidacion("Falta el nombre de la cuenta");
    data.nombre = nombre;
  }
  if (!actual || body.tipo !== undefined) {
    const tipo = String(body.tipo || "BANCO").toUpperCase();
    if (!TIPOS_CUENTA.includes(tipo)) throw errorValidacion(`tipo debe ser uno de: ${TIPOS_CUENTA.join(", ")}`);
    data.tipo = tipo;
  }
  if (!actual || body.moneda !== undefined) {
    const moneda = String(body.moneda || "PEN").toUpperCase();
    if (!MONEDAS.includes(moneda)) throw errorValidacion("moneda debe ser PEN o USD");
    data.moneda = moneda;
  }
  for (const campo of ["banco", "numero", "cci"]) if (body[campo] !== undefined) data[campo] = texto(body[campo], 60);
  if (!actual || body.saldoInicial !== undefined) {
    const saldo = Number(body.saldoInicial || 0);
    if (!Number.isFinite(saldo)) throw errorValidacion("El saldo inicial no es válido");
    data.saldoInicial = r2(saldo);
  }
  if (!actual || body.fechaSaldoInicial !== undefined) {
    const fecha = String(body.fechaSaldoInicial || "").slice(0, 10);
    if (!fechaValida(fecha) || fecha > hoyLima()) throw errorValidacion("Indica la fecha del saldo inicial (no futura)");
    data.fechaSaldoInicial = new Date(`${fecha}T00:00:00-05:00`);
  }
  if (body.orden !== undefined) data.orden = Number(body.orden) || 0;
  if (body.activo !== undefined) data.activo = !!body.activo;
  return data;
}

// Cobros, pagos y cuotas que ya usan la cuenta.
async function usos(id) {
  const [a, b, c] = await Promise.all([
    prisma.pagoComprobante.count({ where: { cuentaFinancieraId: id } }),
    prisma.pagoCuentaPorPagar.count({ where: { cuentaFinancieraId: id } }),
    prisma.proveedorCuota.count({ where: { cuentaFinancieraId: id } }),
  ]);
  return a + b + c;
}

exports.crear = async (req, res) => {
  try {
    const c = await prisma.cuentaFinanciera.create({ data: await datosCuenta(req.body) });
    res.status(201).json(await conSaldo(c));
  } catch (error) {
    responderError(res, error, "creando cuenta");
  }
};

// PUT /:id — la moneda no cambia si la cuenta ya tiene movimientos, y la fecha
// de corte no puede pasar por encima de movimientos ya registrados.
exports.actualizar = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const actual = await prisma.cuentaFinanciera.findUnique({ where: { id } });
    if (!actual) throw errorValidacion("Cuenta no encontrada", 404);
    const data = await datosCuenta(req.body, actual);
    if (data.moneda && data.moneda !== actual.moneda && (await usos(id)) > 0) {
      throw errorValidacion("La cuenta ya tiene movimientos: no se puede cambiar su moneda");
    }
    if (data.fechaSaldoInicial && data.fechaSaldoInicial > actual.fechaSaldoInicial) {
      const primero = (await movimientosDe(actual))[0];
      if (primero && primero.fecha < fechaLima(data.fechaSaldoInicial)) {
        throw errorValidacion(`Hay movimientos desde el ${primero.fecha.split("-").reverse().join("/")}: la fecha del saldo inicial no puede ser posterior`);
      }
    }
    const c = await prisma.cuentaFinanciera.update({ where: { id }, data });
    res.json(await conSaldo(c));
  } catch (error) {
    responderError(res, error, "actualizando cuenta");
  }
};

// GET /:id/movimientos?desde&hasta — con saldo acumulado; saldoAnterior = saldo al inicio del rango.
exports.movimientos = async (req, res) => {
  try {
    const cuenta = await prisma.cuentaFinanciera.findUnique({ where: { id: Number(req.params.id) } });
    if (!cuenta) throw errorValidacion("Cuenta no encontrada", 404);
    const desde = fechaValida(req.query.desde) ? req.query.desde : null;
    const hasta = fechaValida(req.query.hasta) ? req.query.hasta : null;
    const todos = await movimientosDe(cuenta, { hasta });
    let saldo = cuenta.saldoInicial;
    const movimientos = [];
    for (const m of todos) {
      saldo = r2(saldo + m.ingreso - m.egreso);
      if (!desde || m.fecha >= desde) movimientos.push({ ...m, saldo });
    }
    const saldoAnterior = movimientos.length ? r2(movimientos[0].saldo - movimientos[0].ingreso + movimientos[0].egreso) : saldo;
    res.json({
      cuenta: { ...cuenta, fechaSaldoInicial: fechaLima(cuenta.fechaSaldoInicial) },
      saldoAnterior, saldoFinal: saldo, movimientos: movimientos.reverse(),
    });
  } catch (error) {
    responderError(res, error, "cargando movimientos");
  }
};
