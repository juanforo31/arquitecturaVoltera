// =============================================================================
// Voltera · Autoriza billeteras adicionales en los contratos desplegados
// -----------------------------------------------------------------------------
// Otorga a cada direccion de BILLETERAS los roles que necesita para que el
// gateway pueda usarla cuando la billetera principal se quede sin fondos:
//   - ORACULO_ROLE  en LiquidacionP2PAnchor       (anclar liquidaciones)
//   - FIRMANTE_ROLE en CesionCertificadoMultisig   (2a firma de cesiones)
//   - EMISOR_ROLE   en CertificadoOrigenNFT        (solo si INCLUIR_NFT=true)
//
// Por defecto NO da EMISOR_ROLE: el NFT guarda emisor = msg.sender, y rotar
// billeteras haria que certificados distintos tengan emisores distintos.
//
// Debe ejecutarlo la cuenta ADMIN (la del PRIVATE_KEY del .env, que desplego).
// Lee las direcciones de deployments/<red>.json. Si la billetera ya tiene el
// rol, no envia transaccion (no gasta gas).
//
// Uso:
//   BILLETERAS=0xAAA...,0xBBB... npx hardhat run scripts/autorizar-billeteras.js --network amoy
//   INCLUIR_NFT=true BILLETERAS=0xAAA... npx hardhat run scripts/autorizar-billeteras.js --network amoy
// =============================================================================
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const { ethers } = hre;
  const red = hre.network.name;
  const billeteras = (process.env.BILLETERAS || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  if (billeteras.length === 0) {
    throw new Error("Define BILLETERAS=0x...,0x... (direcciones publicas, separadas por coma)");
  }
  for (const b of billeteras) {
    if (!ethers.isAddress(b)) throw new Error(`Direccion invalida: ${b}`);
  }

  const archivo = path.join(__dirname, "..", "deployments", `${red}.json`);
  if (!fs.existsSync(archivo)) {
    throw new Error(`No existe ${archivo}. Despliega primero (npm run deploy:${red === "amoy" ? "amoy" : "local"}).`);
  }
  const dep = JSON.parse(fs.readFileSync(archivo, "utf8"));

  const [admin] = await ethers.getSigners();
  console.log(`Red: ${red} · admin: ${admin.address}`);
  console.log(`Saldo admin: ${ethers.formatEther(await ethers.provider.getBalance(admin.address))} POL\n`);

  const objetivos = [
    { nombre: "LiquidacionP2PAnchor", direccion: dep.address, rol: "ORACULO_ROLE" },
    { nombre: "CesionCertificadoMultisig", direccion: dep.cesionCertificados?.address, rol: "FIRMANTE_ROLE" },
  ];
  if (process.env.INCLUIR_NFT === "true") {
    objetivos.push({ nombre: "CertificadoOrigenNFT", direccion: dep.certificadoOrigenNFT?.address, rol: "EMISOR_ROLE" });
  }

  for (const o of objetivos) {
    if (!o.direccion) {
      console.log(`- ${o.nombre}: sin direccion en ${red}.json, se omite`);
      continue;
    }
    const c = await ethers.getContractAt(o.nombre, o.direccion, admin);
    const rol = await c[o.rol]();
    if (!(await c.hasRole(await c.DEFAULT_ADMIN_ROLE(), admin.address))) {
      throw new Error(`${admin.address} no es admin de ${o.nombre} (${o.direccion})`);
    }
    for (const b of billeteras) {
      if (await c.hasRole(rol, b)) {
        console.log(`= ${o.nombre}: ${b} ya tiene ${o.rol}`);
        continue;
      }
      const tx = await c.grantRole(rol, b);
      const r = await tx.wait();
      console.log(`✓ ${o.nombre}: ${o.rol} -> ${b} (tx ${r.hash}, gas ${r.gasUsed})`);
    }
  }
  console.log("\nListo. Agrega las claves privadas de estas billeteras al gateway (VOLTERA_BLOCKCHAIN_PRIVATE_KEYS).");
}

main().catch((e) => {
  console.error("\n❌", e.shortMessage || e.message || e);
  process.exitCode = 1;
});
