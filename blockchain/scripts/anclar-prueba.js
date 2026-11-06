// =============================================================================
// Voltera · Anclaje de PRUEBA directo a Amoy (sin pasar por Render)
// -----------------------------------------------------------------------------
// Valida el camino on-chain end-to-end usando el contrato ya desplegado y el RPC
// que SÍ acepta transacciones (publicnode). Diagnostica balance, gas, y si alcanza,
// ancla una medición de prueba y espera el recibo (txHash + bloque + gas).
//
// USO:
//   AMOY_RPC_URL=https://polygon-amoy-bor-rpc.publicnode.com \
//     npx hardhat run scripts/anclar-prueba.js --network amoy
//
// Variables opcionales:
//   DRY_RUN=1   -> solo diagnostica (balance + estimación), NO envía la tx.
// =============================================================================
const hre = require("hardhat");

const CONTRATO = process.env.CONTRATO || "0x59965b91bE294D1da408eAc8BB5455ca1C828000";
const DRY_RUN = process.env.DRY_RUN === "1";

async function main() {
  const { ethers } = hre;
  const [signer] = await ethers.getSigners();
  if (!signer) throw new Error("No hay signer: revisa PRIVATE_KEY en .env");

  const prov = signer.provider;
  const net = await prov.getNetwork();
  const addr = await signer.getAddress();
  const bal = await prov.getBalance(addr);
  const fee = await prov.getFeeData();

  console.log("== Diagnóstico on-chain ==");
  console.log("  red/chainId     :", net.chainId.toString());
  console.log("  RPC             :", process.env.AMOY_RPC_URL || "(default config)");
  console.log("  wallet (oráculo):", addr);
  console.log("  balance         :", ethers.formatEther(bal), "POL");
  console.log("  gasPrice        :", fee.gasPrice ? ethers.formatUnits(fee.gasPrice, "gwei") + " gwei" : "n/d");

  const abi = [
    "function anclar(bytes32 transaccionId, bytes32 hashCasacion, uint32 energiaWh, uint64 liquidadaEn) external",
    "function hasRole(bytes32 role, address account) view returns (bool)",
    "function ORACULO_ROLE() view returns (bytes32)",
    "function totalAncladas() view returns (uint256)",
    "function estaAnclada(bytes32) view returns (bool)",
  ];
  const c = new ethers.Contract(CONTRATO, abi, signer);

  // ¿La wallet tiene el rol de oráculo?
  const rol = await c.ORACULO_ROLE();
  const esOraculo = await c.hasRole(rol, addr);
  console.log("  es ORACULO_ROLE :", esOraculo);
  console.log("  totalAncladas   :", (await c.totalAncladas()).toString());

  // Datos de la medición de prueba (únicos por timestamp para no colisionar)
  const txId = ethers.id("EXP-ONCHAIN-" + Date.now());        // bytes32
  const hash = ethers.id("hash-casacion-" + Date.now());      // bytes32
  const energiaWh = 10000;
  const liquidadaEn = Math.floor(Date.now() / 1000);

  // Estimar gas del anclar
  let gasEst;
  try {
    gasEst = await c.anclar.estimateGas(txId, hash, energiaWh, liquidadaEn);
  } catch (e) {
    console.log("  ⚠ estimateGas falló:", (e.shortMessage || e.message || "").slice(0, 160));
  }
  if (gasEst && fee.gasPrice) {
    const costo = gasEst * fee.gasPrice;
    console.log("  gas estimado    :", gasEst.toString(), "unidades");
    console.log("  costo estimado  :", ethers.formatEther(costo), "POL");
    console.log("  ¿alcanza?       :", bal >= costo ? "SÍ" : "NO (falta gas)");
    if (bal < costo) {
      console.log("\n⛔ Balance insuficiente para anclar. Recarga en el faucet:");
      console.log("   https://faucet.polygon.technology  (red Amoy, token POL) ->", addr);
      process.exit(2);
    }
  }

  if (DRY_RUN) {
    console.log("\n(DRY_RUN=1) Diagnóstico completo, no se envía la transacción.");
    return;
  }

  console.log("\n== Enviando anclaje real ==");
  console.log("  transaccionId:", txId);
  console.log("  hashCasacion :", hash);
  const tx = await c.anclar(txId, hash, energiaWh, liquidadaEn);
  console.log("  tx enviada   :", tx.hash, "… esperando recibo");
  const r = await tx.wait();
  console.log("\n✅ ANCLAJE CONFIRMADO ON-CHAIN");
  console.log("  txHash :", r.hash);
  console.log("  bloque :", r.blockNumber);
  console.log("  gasUsed:", r.gasUsed.toString());
  console.log("  explorer: https://amoy.polygonscan.com/tx/" + r.hash);
}

main().catch((e) => {
  console.error("ERROR:", e.shortMessage || e.message || e);
  process.exit(1);
});
