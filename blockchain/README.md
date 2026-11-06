# Voltera · Blockchain (Polygon Amoy — 100% gratuito)

Capa on-chain del proyecto Voltera (Módulo 4, ARTI4208). **Cuatro contratos Solidity** sobre
**Polygon Amoy** (testnet gratuita), proyecto **Hardhat** con **37 tests** verdes y despliegue
reproducible. Diseño alineado con el árbol de decisión documentado en `../BLOCKCHAIN_VOLTERA.md`
(secciones 5 y 6) y los patrones de `../PATRONES_BLOCKCHAIN_VOLTERA.md`.

| Contrato | Patrón / familia | Rol en Voltera |
|---|---|---|
| `LiquidacionP2PAnchor` | off-chain storage (datos) + Embedded Permission (seguridad) | Ancla el **hash** de cada liquidación del mercado P2P. **LIVE** en Amoy. |
| `ComunidadEnergeticaRegistry` | contract registry (control estructural) | Padrón on-chain de comunidades y membresía de prosumidores. |
| `CesionCertificadoMultisig` | Multiple Authorization (seguridad) | Cesión de certificados con **2 firmas** distintas antes de registrar. |
| `CertificadoOrigenNFT` | Tokenización · ERC-721 no fungible (datos) | Certificado de origen renovable como **NFT único** (OpenZeppelin). |

- **Red:** Polygon **Amoy** testnet (chainId `80002`, gas token `POL`) — gratuita.
- **RPC:** a través de un **tercero** (proveedor gestionado gratuito), sin nodo propio.
- **On-chain solo el hash / IDs** (gate 8): no se exponen datos sensibles aunque la red sea pública.
- **Confirmación por evento** (gate 6): el gateway indexa `LiquidacionAnclada` y lo republica en Kafka.
- **Compilación:** solc `0.8.24`, `evmVersion: cancun` (OZ 5.6 usa `mcopy`/EIP-5656; Amoy lo soporta por PIP-31).

## Requisitos
- Node.js 18+ (probado con v24).
- Una wallet de **prueba** (MetaMask) con algo de POL de testnet (del faucet, gratis).

## Instalación
```bash
cd blockchain
npm install
cp .env.example .env   # y edita AMOY_RPC_URL + PRIVATE_KEY
```

## Conseguir el RPC gratuito (el "tercero")
Elige una opción en `.env` (`AMOY_RPC_URL`):
- **Público sin registro:** `https://rpc-amoy.polygon.technology` o `https://polygon-amoy.drpc.org`.
- **Free tier más estable:** crea una app gratis en Alchemy / Infura / QuickNode y pega tu endpoint.

## Conseguir gas de prueba (gratis)
Pide POL de Amoy en un faucet (necesitas la dirección de tu wallet de prueba):
- https://faucet.polygon.technology (selecciona **Amoy**, token **POL**)
- https://www.alchemy.com/faucets/polygon-amoy
- https://faucet.quicknode.com/polygon

## Comandos
```bash
npm run build          # compila el contrato
npm test               # corre los tests (red Hardhat en memoria, sin gastar nada)

# Opción local (sin internet): nodo Hardhat en otra terminal
npm run node
npm run deploy:local

# Opción testnet gratuita (Polygon Amoy via tercero)
npm run deploy:amoy    # despliega y guarda la dirección en deployments/amoy.json
npm run verify:amoy -- <ADDRESS> <ADMIN_ADDRESS>   # opcional, verifica en PolygonScan
```

Tras `deploy:amoy`, copia la dirección impresa en la config del gateway
(`VOLTERA_BLOCKCHAIN_CONTRACT_ADDRESS`).

## Contrato `LiquidacionP2PAnchor`
| Función | Rol | Qué hace |
|---|---|---|
| `anclar(txId, hash, energiaWh, liquidadaEn)` | `ORACULO_ROLE` | Ancla una liquidación. Idempotente (mismo hash = no-op; hash distinto = revierte). |
| `verificar(txId, hash)` | público (view) | ¿El hash recomputado coincide con el anclado? (auditoría del regulador). |
| `obtener(txId)` / `estaAnclada(txId)` | público (view) | Lee el anclaje. |
| `autorizarOraculo` / `revocarOraculo` | `DEFAULT_ADMIN_ROLE` | Gestiona qué gateways pueden anclar. |
| `pausar` / `reanudar` | `DEFAULT_ADMIN_ROLE` | Parada de emergencia. |

Evento emitido: `LiquidacionAnclada(txId indexed, hashCasacion, energiaWh, liquidadaEn, ancladaEn, oraculo indexed)`.

## Contrato `CesionCertificadoMultisig` (patrón Multiple Authorization)
Cesión de certificados de origen renovable que exige **dos firmas distintas** antes de
registrar (umbral M-de-N con M=2). Familia **seguridad**. Ver `../PATRONES_BLOCKCHAIN_VOLTERA.md`.

| Función | Rol | Qué hace |
|---|---|---|
| `proponerCesion(cesionId, certificadoId, cedenteId, cesionarioId, hashDetalle)` | `FIRMANTE_ROLE` | 1ª firma: deja la cesión PENDIENTE (1/2). |
| `confirmarCesion(cesionId)` | `FIRMANTE_ROLE` (otra cuenta) | 2ª firma: al llegar a 2, pasa a REGISTRADA. |
| `estaRegistrada(cesionId)` / `obtenerCesion(cesionId)` | público (view) | Lee el estado de la cesión. |
| `autorizarFirmante` / `revocarFirmante` | `DEFAULT_ADMIN_ROLE` | Gestiona el padrón de firmantes. |
| `pausar` / `reanudar` | `DEFAULT_ADMIN_ROLE` | Parada de emergencia. |

Eventos: `CesionPropuesta`, `CesionFirmada`, `CesionRegistrada`.
⚠️ Requiere ≥2 firmantes autorizados; con uno solo nada se registra (es el costo del patrón).

## Contrato `ComunidadEnergeticaRegistry` (padrón on-chain de comunidades)
Registro inmutable de **comunidades energéticas** y de la **membresía** de sus prosumidores.
Complementa a `LiquidacionP2PAnchor`: mientras ese ancla cada casación, este fija **quién pertenece
a cada comunidad** (base para auditar que una casación P2P ocurrió entre miembros de la misma
comunidad). On-chain van IDs/hashes `bytes32` (gate 8), nunca datos personales. Familia **control
estructural**.

| Función | Rol | Qué hace |
|---|---|---|
| `registrarComunidad(comunidadId, nombreHash)` | `OPERADOR_ROLE` | Da de alta una comunidad (nombre canónico off-chain, solo su hash on-chain). |
| `agregarMiembro(comunidadId, prosumidorId)` / `removerMiembro(...)` | `OPERADOR_ROLE` | Alta/baja de prosumidores en el padrón; queda registrado por evento (no repudio). |
| `puedenCasar(comunidadId, vendedorId, compradorId)` | público (view) | Regla de dominio: ambos deben ser miembros activos de la MISMA comunidad y distintos. |
| `existeComunidad` / `obtenerComunidad` / `esMiembro` | público (view) | Lecturas para auditor / indexador. |
| `autorizarOperador` / `revocarOperador` · `pausar` / `reanudar` | `DEFAULT_ADMIN_ROLE` | Padrón de operadores y parada de emergencia. |

Eventos: `ComunidadRegistrada`, `MiembroAgregado`, `MiembroRemovido`.

## Contrato `CertificadoOrigenNFT` (patrón Tokenización · ERC-721 NO fungible)
Certificado de origen renovable como **token NO fungible** (cada certificado es único),
usando las implementaciones de **OpenZeppelin**: `ERC721` + `ERC721URIStorage` (metadata
off-chain) + `ERC721Burnable` + `AccessControl`. Familia **datos**. Se eligió ERC-721
(no fungible) y **no** ERC-20 (fungible) ni ERC-1155 (semi-fungible) porque cada certificado
es único e irrepetible. Ver `../PATRONES_BLOCKCHAIN_VOLTERA.md`.

Atributos del certificado (láminas 05/06): **idMedidor · propietario** (owner ERC-721) **·
emisor · consumoNetoMensual** (+ `periodo` AAAAMM y `hashDetalle`). La pareja `(idMedidor, periodo)`
impide duplicados on-chain (lámina 06: "100% de intentos de emisión duplicada rechazados").

| Función | Rol | Qué hace |
|---|---|---|
| `emitirCertificado(propietario, uri, idMedidor, consumoNetoMensual, periodo, hashDetalle)` | `EMISOR_ROLE` | Acuña un NFT único, lo asigna a `propietario` y devuelve el `tokenId`. Revierte con `CertificadoDuplicado` si ya existe uno para `(idMedidor, periodo)`. |
| `certificados(tokenId)` / `tokenURI(tokenId)` | público (view) | Datos mínimos on-chain (idMedidor, emisor, consumoNetoMensual, periodo, hashDetalle) + metadata off-chain. |
| `tokenDe(idMedidor, periodo)` / `totalEmitidos()` | público (view) | tokenId emitido para un (medidor, periodo) y total acuñado. |
| `transferFrom` / `safeTransferFrom` | propietario | Transferencia billetera→billetera estándar ERC-721. |
| `burn(tokenId)` | propietario | Retira/cancela el certificado (ERC721Burnable). |

Eventos: `CertificadoEmitido` + los estándar de ERC-721 (`Transfer`, `Approval`).

## Seguridad
- `AccessControl` + `Pausable` de OpenZeppelin (patrón *Embedded Permission* / Zero Trust on-chain).
- Sin transferencias de valor → sin superficie de reentrada.
- La `PRIVATE_KEY` del `.env` es **solo de testnet**; nunca uses una con fondos reales.

## Estado de la entrega
| Pieza | Estado |
|---|---|
| 4 contratos Solidity | ✅ Escritos, compilan (solc 0.8.24 / Cancun). |
| Suite de tests | ✅ **37 passing** (`npm test`): 8 anchor + 9 comunidad + 11 multisig + 9 NFT. |
| `LiquidacionP2PAnchor` en Amoy | ✅ **LIVE** en `0x59965b91bE294D1da408eAc8BB5455ca1C828000` (anclajes reales confirmados; ver `../SESION_BLOCKCHAIN_ESTADO.md`). |
| Comunidad / Multisig / NFT en Amoy | ✅ **LIVE** (2026-11-06): Comunidad `0xfC0edb98c4541527D012c6d81956D6762966453E` · Multisig `0x3Cf07d38B59e9FC1a29bAcFCC9B8567D1411491d` · NFT `0x819bc480006D279158CA9dFD6893e73071aC98d2`. |
| Gateway de borde (web3j) | ✅ `../Microservicios/ServiciosDeNegocio/blockchain-gateway-service/` (oráculo + indexador + OUTBOX). |
| Front (marketplace P2P + NFT) | ✅ `../Microservicios/voltera-frontend/` páginas `/blockchain`, `/certificados`, `/microservicios-cadena`. |
| Diagrama vivo | ✅ `../Modificados/Voltera_Arquitectura_Completa.drawio` (capa 4 blockchain). |

### Cómo reproducir la validación (de un tirón)
```bash
cd Blockchain
npm install
npm run check        # lint (solhint) + compila los 4 contratos + 37 tests
npm run integridad   # demo local de los 4 contratos (prueba de integridad + unicidad), sin gas
npm run test:gas     # (opcional) reporte de coste de gas por función
npm run coverage     # (opcional) cobertura de los contratos
```
CI equivalente en `.github/workflows/blockchain-ci.yml` (corre en cada push que toque `Blockchain/`).

Para el camino on-chain real (anclaje confirmado en Amoy) sin desplegar nada nuevo:
```bash
AMOY_RPC_URL=https://polygon-amoy-bor-rpc.publicnode.com \
  npx hardhat run scripts/anclar-prueba.js --network amoy   # usa el anchor LIVE
```
