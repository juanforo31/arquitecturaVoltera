// =============================================================================
// Voltera · Verificacion de INTEGRIDAD de los 4 contratos (demo reproducible)
// -----------------------------------------------------------------------------
// Despliega los 4 contratos en la red Hardhat EN MEMORIA (sin gas, sin internet)
// y ejecuta el "camino feliz" de cada uno + la PRUEBA DE INTEGRIDAD de la lamina
// 06: la cadena detecta cuando el payload fue alterado.
//
// Pensado para que un evaluador reproduzca la POC de un tiron:
//     npx hardhat run scripts/verificar-integridad.js
//   (o)  npm run integridad
//
// No modifica nada on-chain real; es 100% local y gratuito.
// =============================================================================
const hre = require("hardhat");

function ok(msg) { console.log("  \u2713 " + msg); }
function seccion(t) { console.log("\n== " + t + " =="); }

async function main() {
  const { ethers } = hre;
  const [admin, oraculo2, prosumidor, comprador] = await ethers.getSigners();
  console.log("Red:", hre.network.name, "(en memoria, sin gas)\n");
  console.log("Cuentas de prueba:");
  console.log("  admin/oraculo:", admin.address);
  console.log("  2o firmante  :", oraculo2.address);

  // ───────────────────────────────────────────────────────────────────────
  seccion("1) LiquidacionP2PAnchor — anclaje + prueba de integridad (gate 4)");
  const Anchor = await ethers.getContractFactory("LiquidacionP2PAnchor");
  const anchor = await Anchor.deploy(admin.address);
  await anchor.waitForDeployment();

  const txId = ethers.id("TX-DEMO-0001");
  // payload canonico de la casacion (lo que viaja off-chain en los microservicios)
  const payload = JSON.stringify({ vendedor: "P-01", comprador: "C-09", kWh: 10, precioCOP: 460, intervalo: "2026-11-03T10:00" });
  const hash = ethers.keccak256(ethers.toUtf8Bytes(payload));
  await (await anchor.anclar(txId, hash, 10_000, Math.floor(Date.now() / 1000))).wait();
  ok("liquidacion anclada (solo el hash on-chain, gate 8)");

  // PRUEBA DE INTEGRIDAD: datos originales -> integro; datos alterados -> NO integro
  const integroOriginal = await anchor.verificar(txId, hash);
  const payloadAlterado = payload.replace('"kWh":10', '"kWh":9999');
  const hashAlterado = ethers.keccak256(ethers.toUtf8Bytes(payloadAlterado));
  const integroAlterado = await anchor.verificar(txId, hashAlterado);
  if (integroOriginal !== true || integroAlterado !== false) {
    throw new Error("FALLO prueba de integridad del anchor");
  }
  ok("PRUEBA DE INTEGRIDAD: original -> integro:true, alterado -> integro:false");

  // idempotencia y no repudio
  await (await anchor.anclar(txId, hash, 10_000, 1)).wait(); // mismo hash = no-op
  let revirtio = false;
  try { await anchor.anclar(txId, hashAlterado, 1, 1); } catch { revirtio = true; }
  if (!revirtio) throw new Error("FALLO: re-anclar con hash distinto debio revertir");
  ok("idempotente con mismo hash; rechaza re-anclaje con hash distinto (no repudio)");

  // ───────────────────────────────────────────────────────────────────────
  seccion("2) ComunidadEnergeticaRegistry — padron y regla de casacion");
  const Com = await ethers.getContractFactory("ComunidadEnergeticaRegistry");
  const com = await Com.deploy(admin.address);
  await com.waitForDeployment();
  const comunidadId = ethers.id("COMUNIDAD-SOLAR-NORTE");
  const vendedorId = ethers.id("P-01");
  const compradorId = ethers.id("C-09");
  await (await com.registrarComunidad(comunidadId, ethers.id("Comunidad Solar Norte"))).wait();
  await (await com.agregarMiembro(comunidadId, vendedorId)).wait();
  await (await com.agregarMiembro(comunidadId, compradorId)).wait();
  ok("comunidad registrada con 2 miembros");
  if (!(await com.puedenCasar(comunidadId, vendedorId, compradorId))) {
    throw new Error("FALLO: miembros de la misma comunidad deberian poder casar");
  }
  const forastero = ethers.id("X-99");
  if (await com.puedenCasar(comunidadId, vendedorId, forastero)) {
    throw new Error("FALLO: un no-miembro NO deberia poder casar");
  }
  ok("puedenCasar(): solo entre miembros activos de la misma comunidad");

  // ───────────────────────────────────────────────────────────────────────
  seccion("3) CesionCertificadoMultisig — 2 firmas (Multiple Authorization)");
  const Multi = await ethers.getContractFactory("CesionCertificadoMultisig");
  const multi = await Multi.deploy(admin.address);
  await multi.waitForDeployment();
  await (await multi.autorizarFirmante(oraculo2.address)).wait();
  const cesionId = ethers.id("CESION-0001");
  await (await multi.proponerCesion(
    cesionId, ethers.id("CERT-1"), vendedorId, compradorId, ethers.id("doc-cesion")
  )).wait();
  if (await multi.estaRegistrada(cesionId)) throw new Error("FALLO: 1 firma NO debe registrar");
  ok("1a firma deja la cesion PENDIENTE (una sola firma no basta)");
  await (await multi.connect(oraculo2).confirmarCesion(cesionId)).wait();
  if (!(await multi.estaRegistrada(cesionId))) throw new Error("FALLO: 2 firmas debieron registrar");
  ok("2a firma de OTRA cuenta -> cesion REGISTRADA");

  // ───────────────────────────────────────────────────────────────────────
  seccion("4) CertificadoOrigenNFT — emision ERC-721 + rechazo de duplicados");
  const Nft = await ethers.getContractFactory("CertificadoOrigenNFT");
  const nft = await Nft.deploy(admin.address);
  await nft.waitForDeployment();
  const idMedidor = ethers.id("MEDIDOR-IOT-0001");
  const periodo = 202611;
  await (await nft.emitirCertificado(
    prosumidor.address, "ipfs://cert-0001", idMedidor, 120000n, periodo, ethers.id("doc-cert")
  )).wait();
  ok("NFT emitido (tokenId 1) a " + prosumidor.address.slice(0, 10) + "\u2026");
  // transferencia billetera -> billetera
  await (await nft.connect(prosumidor).transferFrom(prosumidor.address, comprador.address, 1)).wait();
  if ((await nft.ownerOf(1)) !== comprador.address) throw new Error("FALLO transferencia NFT");
  ok("transferencia billetera\u2192billetera trazable on-chain");
  // rechazo de duplicados (idMedidor, periodo) -> lamina 06
  let dup = false;
  try {
    await nft.emitirCertificado(comprador.address, "ipfs://dup", idMedidor, 1n, periodo, ethers.id("dup"));
  } catch { dup = true; }
  if (!dup) throw new Error("FALLO: duplicado (medidor, periodo) debio ser rechazado");
  ok("duplicado (idMedidor, periodo) RECHAZADO on-chain (100% intentos duplicados)");

  console.log("\n\u2705 VERIFICACION DE INTEGRIDAD COMPLETA: 4/4 contratos OK (demo local, sin gas).");
}

main().catch((e) => {
  console.error("\n\u274c ERROR:", e.message || e);
  process.exit(1);
});
