require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

// ──────────────────────────────────────────────────────────────────────────
// Config de Hardhat para Voltera.
// Red objetivo: Polygon Amoy (testnet GRATUITA, chainId 80002, gas token POL).
// El RPC lo provee un TERCERO gratuito (ver .env.example).
// Si no hay PRIVATE_KEY/RPC configurados, las redes remotas simplemente no
// tendran cuentas; el desarrollo local (hardhat/localhost) funciona sin nada.
// ──────────────────────────────────────────────────────────────────────────

const AMOY_RPC_URL = process.env.AMOY_RPC_URL || "https://rpc-amoy.polygon.technology";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const POLYGONSCAN_API_KEY = process.env.POLYGONSCAN_API_KEY || "";
// Activa el reporte de gas con: REPORT_GAS=true npm test
const REPORT_GAS = process.env.REPORT_GAS === "true";

const accounts = PRIVATE_KEY && PRIVATE_KEY.startsWith("0x") && PRIVATE_KEY.length === 66
  ? [PRIVATE_KEY]
  : PRIVATE_KEY && PRIVATE_KEY.length === 64
    ? ["0x" + PRIVATE_KEY]
    : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun", // Amoy soporta Cancun (PIP-31, mcopy/EIP-5656). OZ 5.6 lo requiere.
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    amoy: {
      url: AMOY_RPC_URL,
      chainId: 80002,
      accounts,
    },
  },
  etherscan: {
    // PolygonScan usa la API de Etherscan v2; la verificacion es opcional y gratuita.
    apiKey: {
      polygonAmoy: POLYGONSCAN_API_KEY,
    },
    customChains: [
      {
        network: "polygonAmoy",
        chainId: 80002,
        urls: {
          apiURL: "https://api-amoy.polygonscan.com/api",
          browserURL: "https://amoy.polygonscan.com",
        },
      },
    ],
  },
  // Reporte de gas por funcion (solo si REPORT_GAS=true). No gasta nada: mide
  // sobre la red Hardhat en memoria. Util para la entrega (coste on-chain estimado).
  gasReporter: {
    enabled: REPORT_GAS,
    currency: "USD",
    token: "POL",
    showMethodSig: true,
  },
};
