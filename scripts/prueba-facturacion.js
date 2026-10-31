// Prueba de punta a punta de la facturación electrónica contra un backend
// corriendo con BD local y el simulador (scripts/smartpse-mock.js).
// Crea sus propios datos de prueba; se niega a correr contra una BD remota.
//
//   API_URL=http://localhost:4100/api node scripts/prueba-facturacion.js
require("dotenv").config();
const jwt = require("jsonwebtoken");
const prisma = require("../src/config/prisma");

const API = process.env.API_URL || "http://localhost:4100/api";

if (!/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || "")) {
  console.error("✋ DATABASE_URL no es local. Esta prueba crea datos: úsala solo con la BD de Docker.");
  process.exit(1);
}

let fallos = 0;
function verificar(cond, texto, extra) {
  console.log(`${cond ? "✅" : "❌"} ${texto}`);
  if (!cond) { fallos++; if (extra !== undefined) console.log("   →", JSON.stringify(extra)); }
}

async function main() {
  const sufijo = Date.now().toString().slice(-6);
  const admin = await prisma.usuario.create({
    data: { nombre: "Admin Prueba", email: `admin.fe.${sufijo}@prueba.local`, role: "ADMIN" },
  });
  const token = jwt.sign({ id: admin.id, nombre: admin.nombre, role: admin.role, email: admin.email }, process.env.JWT_SECRET, { expiresIn: "1h" });

  const api = async (metodo, ruta, body) => {
    const r = await fetch(`${API}${ruta}`, {
      method: metodo,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    const tipo = r.headers.get("content-type") || "";
    return { status: r.status, data: tipo.includes("json") ? await r.json() : await r.text() };
  };

  const empresa = await prisma.cliente.create({
    data: { nombreComercial: "EMPRESA CLIENTE S.A.C.", documento: `20${sufijo}111`.slice(0, 11), nombreContacto: "Contacto", direccion: "Av. Giráldez 123, Huancayo" },
  });
  const persona = await prisma.cliente.create({
    data: { nombreComercial: "Juan Pérez & Hijos <prueba>", documento: `4${sufijo}1`.slice(0, 8), nombreContacto: "Juan" },
  });

  const crearCot = (clienteId, items) => {
    const valorVenta = items.reduce((a, i) => a + i.precio * i.cantidad, 0);
    return prisma.cotizacion.create({
      data: {
        numero: `FE-${sufijo}-${clienteId}-${Math.random().toString(36).slice(2, 6)}`,
        total: Math.round(valorVenta * 1.18 * 100) / 100,
        estado: "APROBADA", clienteId, usuarioId: admin.id,
        items: { create: items.map((i) => ({ ...i, subtotal: Math.round(i.precio * i.cantidad * 100) / 100 })) },
      },
    });
  };

  const cotEmpresa = await crearCot(empresa.id, [
    { nombre: "Alquiler panel LED - Av. Ferrocarril", cantidad: 2, precio: 1500 },
    { nombre: "Instalación de lona", descripcion: "4x3 m", cantidad: 1, precio: 333.33 },
  ]);
  const cotPersona = await crearCot(persona.id, [{ nombre: "Volanteo BTL", cantidad: 3, precio: 120.5 }]);

  console.log("\n— Factura —");
  const f = await api("POST", "/comprobantes/desde-cotizacion", { cotizacionId: cotEmpresa.id, tipo: "FACTURA" });
  verificar(f.status === 201 && f.data.estado === "ACEPTADO", `Factura ${f.data.numero} aceptada (${f.data.sunatMensaje})`, f.data);
  verificar(f.data.numero?.startsWith("F001-"), "Serie F001");
  verificar(f.data.valorVenta === 3333.33 && f.data.igv === 600 && f.data.total === 3933.33, `Totales ${f.data.valorVenta} + ${f.data.igv} = ${f.data.total}`, f.data);
  verificar(f.data.total === cotEmpresa.total, "Total igual al de la cotización");

  const dup = await api("POST", "/comprobantes/desde-cotizacion", { cotizacionId: cotEmpresa.id, tipo: "FACTURA" });
  verificar(dup.status === 409, `Segunda factura de la misma cotización bloqueada (${dup.data.message})`, dup);

  const xml = await api("GET", `/comprobantes/${f.data.id}/xml`);
  verificar(xml.status === 200 && xml.data.includes("<ds:Signature") && xml.data.includes("<cbc:ID>FormaPago</cbc:ID>"), "XML firmado descargable, con forma de pago");
  verificar(xml.data.includes("TRES MIL NOVECIENTOS TREINTA Y TRES CON 33/100 SOLES"), "Leyenda de importe en letras");
  const cdr = await api("GET", `/comprobantes/${f.data.id}/cdr`);
  verificar(cdr.status === 200 && cdr.data.includes("<cbc:ResponseCode>0</cbc:ResponseCode>"), "CDR descargable con código 0");

  console.log("\n— Boleta —");
  const fp = await api("POST", "/comprobantes/desde-cotizacion", { cotizacionId: cotPersona.id, tipo: "FACTURA" });
  verificar(fp.status === 400, `Factura a cliente con DNI rechazada por el ERP (${fp.data.message})`, fp);
  const b = await api("POST", "/comprobantes/desde-cotizacion", { cotizacionId: cotPersona.id, tipo: "BOLETA" });
  verificar(b.status === 201 && b.data.estado === "ACEPTADO" && b.data.numero?.startsWith("B001-"), `Boleta ${b.data.numero} aceptada`, b.data);
  verificar(b.data.clienteTipoDoc === "1", "Receptor con DNI (catálogo 06 = 1)");
  const xmlB = await api("GET", `/comprobantes/${b.data.id}/xml`);
  verificar(xmlB.data.includes("Juan Pérez &amp; Hijos &lt;prueba&gt;") && !xmlB.data.includes("FormaPago"), "Caracteres especiales escapados; boleta sin forma de pago");

  console.log("\n— Nota de crédito —");
  const nc = await api("POST", `/comprobantes/${f.data.id}/nota-credito`, { motivoCodigo: "01" });
  verificar(nc.status === 201 && nc.data.estado === "ACEPTADO" && nc.data.numero?.startsWith("FC01-"), `NC ${nc.data.numero} aceptada`, nc.data);
  const xmlNc = await api("GET", `/comprobantes/${nc.data.id}/xml`);
  verificar(xmlNc.data.includes(`<cbc:ReferenceID>${f.data.numero}</cbc:ReferenceID>`) && xmlNc.data.includes("<cbc:DocumentTypeCode>01</cbc:DocumentTypeCode>"), "NC referencia la factura");
  const nc2 = await api("POST", `/comprobantes/${f.data.id}/nota-credito`, { motivoCodigo: "01" });
  verificar(nc2.status === 409, "Segunda NC sobre la misma factura bloqueada", nc2);
  const ncB = await api("POST", `/comprobantes/${b.data.id}/nota-credito`, { motivoCodigo: "06" });
  verificar(ncB.status === 201 && ncB.data.numero?.startsWith("BC01-") && ncB.data.estado === "ACEPTADO", `NC de boleta ${ncB.data.numero} aceptada`, ncB.data);

  const refact = await api("POST", "/comprobantes/desde-cotizacion", { cotizacionId: cotEmpresa.id, tipo: "FACTURA" });
  verificar(refact.status === 201 && refact.data.estado === "ACEPTADO", `Factura anulada con NC permite re-facturar (${refact.data.numero})`, refact.data);

  console.log("\n— Consultas —");
  const det = await api("GET", `/comprobantes/${f.data.id}`);
  verificar(det.data.notasCredito?.length === 1 && det.data.items?.length === 2, "Detalle con ítems y nota de crédito");
  const lista = await api("GET", `/comprobantes?cotizacionId=${cotEmpresa.id}`);
  verificar(lista.data.length === 3, `Listado por cotización: ${lista.data.map((c) => `${c.numero} ${c.estado}`).join(", ")}`, lista.data);

  console.log("\n— Migo: RUC/DNI —");
  const rucApec = await api("GET", "/comprobantes/consulta/20140344801");
  verificar(rucApec.status === 200 && rucApec.data.nombre?.includes("APEC") && rucApec.data.estado === "ACTIVO", `RUC → ${rucApec.data.nombre} (${rucApec.data.estado}/${rucApec.data.condicion})`, rucApec);
  const noHabido = await api("GET", "/comprobantes/consulta/20999999991");
  verificar(noHabido.data.advertencia?.includes("NO HABIDO"), `Advierte contribuyente no habido (${noHabido.data.advertencia})`, noHabido);
  const noExiste = await api("GET", "/comprobantes/consulta/20111111110");
  verificar(noExiste.status === 404, "RUC inexistente → 404", noExiste);
  const dni = await api("GET", "/comprobantes/consulta/45678912");
  verificar(dni.status === 200 && dni.data.tipoDoc === "1" && !!dni.data.nombre, `DNI → ${dni.data.nombre}`, dni);

  console.log("\n— Factura manual como la real (E001-1042): crédito + detracción —");
  const itemsReales = [
    [11, 55, "PINTADO SEÑALIZACION DELIMITACION CON PINTURA DE ALTO TRANSITO"],
    [8, 18, "SUPERFICIE CALIENTE - FOTOLUMINISCENTE Y CELTEX DE 5MM"],
    [86, 5.5, "RIESGO ELECTRICO - VINIL LAMINADO Y CELTEX DE 5MM - PEQUEÑO"],
    [7, 12, "ACCESO RESTRINGIDO - VINIL LAMINADO Y CELTEX DE 5MM"],
    [4, 12, "CAMINO ESTRECHO - VINIL LAMINADO Y CELTEX DE 5MM"],
    [1, 12, "BALON DE GAS - VINIL LAMINADO Y CELTEX DE 5MM"],
    [3, 5.5, "PUNTOS DE GLP - VINIL LAMINADO Y CELTEX DE 5MM PEQUEÑO"],
    [125, 2.5, "RIESGO ELECTRICO - VINIL LAMINADO Y - PEQUEÑO"],
    [23, 12, "RIESGO DE QUEMADURAS - VINIL LAMINADO Y CELTEX DE 5MM PEQUEÑO"],
    [45, 12, "PERSONAL AUTORIZADO - VINIL LAMINADO Y CELTEX DE 5MM + PUERTA CLAUSURADA"],
    [7, 45, "LIMPIEZA DE DELIMITACION RETIRO CON ADITIVO"],
    [1, 115, "IMPLEMENTACION DE SEGURIDAD ELECTRICA - VINIL LAMINADO"],
    [4, 48, "ACRILICOS A3"],
    [30, 18, "LUCES DE EMERGENCIA - FOTOLUMINISCENTE Y CELTEX DE 5MM + 17"],
    [22, 18, "INGRESO - FOTOLUMINISCENTE Y CELTEX DE 5MM + 1 INGRESOS"],
    [24, 18, "SALIDA - FOTOLUMINISCENTE Y CELTEX DE 5MM + 7 DE SALIDA"],
    [4, 12, "RIESGO DE ATRAPAMIENTO - FOTOLUMINISCENTE Y CELTEX DE 5MM"],
    [3, 18, "ZONA SEGURA SEÑALETICA FOTOLUMINISCENTE"],
    [1, 18, "EXTINTOR PQS"],
    [3, 18, "RIESGO ELECTRICO FOTOLUMINISCENTE 30X20 FOTOLUMINISCENTE Y CELTEX DE 5MM"],
  ].map(([cantidad, valorUnitario, descripcion]) => ({ cantidad, valorUnitario, descripcion, unidad: "NIU" }));
  const vence = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const facturaReal = {
    tipo: "FACTURA",
    cliente: { numDoc: rucApec.data.numDoc, nombre: rucApec.data.nombre, direccion: rucApec.data.direccion },
    items: itemsReales,
    formaPago: "CREDITO",
    cuotas: [{ monto: 4854.52, fechaVencimiento: vence }],
  };

  const malCuotas = await api("POST", "/comprobantes", { ...facturaReal, cuotas: [{ monto: 5516.5, fechaVencimiento: vence }] });
  verificar(malCuotas.status === 400 && /neto pendiente/.test(malCuotas.data.message), `Cuotas que no suman el neto se rechazan (${malCuotas.data.message})`, malCuotas);

  const fr = await api("POST", "/comprobantes", facturaReal);
  verificar(fr.status === 201 && fr.data.estado === "ACEPTADO", `Factura ${fr.data.numero} aceptada (${fr.data.sunatMensaje})`, fr.data);
  verificar(fr.data.valorVenta === 4675 && fr.data.igv === 841.5 && fr.data.total === 5516.5, `Totales iguales a la real: ${fr.data.valorVenta} + ${fr.data.igv} = ${fr.data.total}`, fr.data);
  verificar(fr.data.detraccionMonto === 661.98, `Detracción 12% = ${fr.data.detraccionMonto} (real: 661.98)`, fr.data);
  const xmlR = (await api("GET", `/comprobantes/${fr.data.id}/xml`)).data;
  verificar(xmlR.includes('listID="1001"') && xmlR.includes('languageLocaleID="2006"') && xmlR.includes("<cbc:PaymentMeansID>037</cbc:PaymentMeansID>"), "XML: operación 1001, leyenda 2006 y servicio 037");
  verificar(xmlR.includes("<cbc:PaymentMeansID>Credito</cbc:PaymentMeansID>") && xmlR.includes("<cbc:PaymentMeansID>Cuota001</cbc:PaymentMeansID>") && xmlR.includes(">4854.52<"), "XML: crédito con 1 cuota de 4854.52");
  verificar(xmlR.includes("CINCO MIL QUINIENTOS DIECISEIS CON 50/100 SOLES"), "Importe en letras igual al de la real");
  verificar(xmlR.includes('unitCode="NIU"') && (xmlR.match(/<cac:InvoiceLine>/g) || []).length === 20, "20 ítems con unidad NIU");

  console.log("\n— Migo: validez en SUNAT —");
  const ver = await api("POST", `/comprobantes/${fr.data.id}/verificar`);
  verificar(ver.status === 200 && ver.data.validacionSunat?.estadoComprobante === "ACEPTADO", `${fr.data.numero} en SUNAT: ${ver.data.validacionSunat?.estadoComprobante}`, ver);
  const errorPse = await prisma.comprobante.create({
    data: { tipo: "FACTURA", serie: "F999", correlativo: Number(sufijo), clienteTipoDoc: "6", clienteNumDoc: "20140344801", clienteNombre: "X", valorVenta: 1, igv: 0.18, total: 1.18, estado: "ERROR", usuarioId: admin.id },
  });
  const verNo = await api("POST", `/comprobantes/${errorPse.id}/verificar`);
  verificar(verNo.data.validacionSunat?.estadoComprobante === "NO EXISTE", `Comprobante que no llegó a SUNAT: ${verNo.data.validacionSunat?.estadoComprobante}`, verNo);

  console.log(fallos ? `\n${fallos} verificación(es) fallaron` : "\nTodas las verificaciones pasaron");
}

main()
  .catch((e) => { console.error(e); fallos++; })
  .finally(async () => { await prisma.$disconnect(); process.exit(fallos ? 1 : 0); });
