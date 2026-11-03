const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

// ──────────────────────────────────────────────────────────────────────────
// Despliega SOLO los contratos que faltan (ComunidadEnergeticaRegistry y
// CesionCertificadoMultisig), SIN tocar el LiquidacionP2PAnchor ya desplegado
// y LIVE (0xd0Ef…EBcf530). Mergea las direcciones en deployments/<red>.json.
//
// Incluye reintentos porque el RPC público de Amoy (dRPC) a veces devuelve
// "Temporary internal error".
// ──────────────────────────────────────────────────────────────────────────

async function deployConReintentos(nombre, ...args) {
  const Factory = await hre.ethers.getContractFactory(nombre);
  // Gas price acotado: Amoy exige >= ~25 gwei. Fijamos 30 gwei para no agotar el
  // saldo del faucet cuando el RPC reporta un gas price inflado (~85 gwei).
  const gasPrice = hre.ethers.parseUnits("30", "gwei");
  let ultimoError;
  for (let intento = 1; intento <= 5; intento++) {
    try {
      const c = await Factory.deploy(...args, { gasPrice });
      await c.waitForDeployment();
      return await c.getAddress();
    } catch (e) {
      ultimoError = e;
      console.warn(`  ⚠ intento ${intento}/5 de ${nombre} falló: ${e.message.split("\n")[0]}`);
      await new Promise((r) => setTimeout(r, 4000 * intento));
    }
  }
  throw ultimoError;
}

async function main() {
  const net = hre.network.name;
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) throw new Error("No hay cuenta configurada (PRIVATE_KEY en .env).");

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`Red:      ${net} (chainId ${hre.network.config.chainId})`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${hre.ethers.formatEther(balance)} POL\n`);

  const outFile = path.join(__dirname, "..", "deployments", `${net}.json`);
  const prev = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, "utf8")) : {};

  if (!prev.address) {
    throw new Error(
      "No encuentro el LiquidacionP2PAnchor previo en deployments/" + net + ".json. " +
      "Este script asume que el anchor ya está desplegado. Usa deploy.js para el primer deploy."
    );
  }
  console.log(`Anchor existente (se preserva): ${prev.address}\n`);

  console.log("Desplegando ComunidadEnergeticaRegistry…");
  const addrCom = await deployConReintentos("ComunidadEnergeticaRegistry", deployer.address);
  console.log(`✓ ComunidadEnergeticaRegistry: ${addrCom}`);
  console.log(`  https://amoy.polygonscan.com/address/${addrCom}\n`);

  console.log("Desplegando CesionCertificadoMultisig…");
  const addrCesion = await deployConReintentos("CesionCertificadoMultisig", deployer.address);
  console.log(`✓ CesionCertificadoMultisig:   ${addrCesion}`);
  console.log(`  https://amoy.polygonscan.com/address/${addrCesion}\n`);

  console.log("Desplegando CertificadoOrigenNFT (ERC-721, no fungible)…");
  const addrNft = await deployConReintentos("CertificadoOrigenNFT", deployer.address);
  console.log(`✓ CertificadoOrigenNFT:        ${addrNft}`);
  console.log(`  https://amoy.polygonscan.com/address/${addrNft}\n`);

  const merged = {
    ...prev,
    registroComunidades: { contract: "ComunidadEnergeticaRegistry", address: addrCom },
    cesionCertificados: { contract: "CesionCertificadoMultisig", address: addrCesion },
    certificadoOrigenNFT: { contract: "CertificadoOrigenNFT", address: addrNft, tipo: "ERC-721 no fungible" },
    actualizadoAt: new Date().toISOString(),
  };
  // Ya desplegados: la nota de "pendientes" deja de aplicar.
  delete merged.pendientesDeDespliegue;
  fs.writeFileSync(outFile, JSON.stringify(merged, null, 2));
  console.log(`Direcciones mergeadas en deployments/${net}.json (anchor preservado).`);
  console.log(
    `\n→ Configura el gateway con:\n` +
    `    VOLTERA_BLOCKCHAIN_CONTRACT_ADDRESS=${prev.address}\n` +
    `    VOLTERA_BLOCKCHAIN_REGISTRO_COMUNIDADES=${addrCom}\n` +
    `    VOLTERA_BLOCKCHAIN_CESION_CERTIFICADOS=${addrCesion}\n` +
    `    VOLTERA_BLOCKCHAIN_CERTIFICADO_NFT=${addrNft}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
