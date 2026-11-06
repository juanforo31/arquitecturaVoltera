# Guía · Configurar el blockchain-gateway en Render

> Para: quien administra la cuenta de Render del proyecto Voltera.
> Objetivo: que el gateway deje el **modo demo** y ancle / emita NFT de verdad en **Polygon Amoy**.
> Tiempo estimado: 10 minutos. No requiere instalar nada ni tocar código.

---

## 1. Qué necesitas antes de empezar

| Necesitas | De dónde sale |
|---|---|
| Acceso a la cuenta de **Render** donde vive el servicio `voltera-blockchain-gateway` | ya lo tienes |
| **2 claves privadas** de prueba (cuenta principal y cuenta de respaldo) | te las pasa Juan David **por un medio privado** (mensaje directo, nunca un grupo, nunca el repo) |
| Las direcciones de los contratos | están en la tabla de abajo (son públicas) |

Las claves son de **testnet** (sin dinero real), pero igual no se comparten ni se suben al repo:
quien tenga la clave puede firmar a nombre del oráculo.

---

## 2. Variables de entorno

Render → servicio **`voltera-blockchain-gateway`** → pestaña **Environment**.
Agrega o edita estas variables (si ya existen con otro valor, **reemplázalo**):

| Variable | Valor | ¿Secreta? |
|---|---|---|
| `VOLTERA_BLOCKCHAIN_RPC_URL` | `https://polygon-amoy-bor-rpc.publicnode.com` | no |
| `VOLTERA_BLOCKCHAIN_PRIVATE_KEY` | clave privada de la **cuenta principal** (`0xB7aC…fbCf`) | **sí** |
| `VOLTERA_BLOCKCHAIN_PRIVATE_KEYS` | clave privada de la **cuenta de respaldo** (`0x18b4…4b5E`) — **nueva** | **sí** |
| `VOLTERA_BLOCKCHAIN_CONTRACT_ADDRESS` | `0x59965b91bE294D1da408eAc8BB5455ca1C828000` | no |
| `VOLTERA_BLOCKCHAIN_CERTIFICADO_NFT` | `0x819bc480006D279158CA9dFD6893e73071aC98d2` — **nueva** | no |
| `VOLTERA_BLOCKCHAIN_CHAIN_ID` | `80002` (ya viene del `render.yaml`) | no |
| `VOLTERA_BLOCKCHAIN_NETWORK` | `polygon-amoy` (ya viene del `render.yaml`) | no |
| `KAFKA_ENABLED` | `false` (ya viene del `render.yaml`) | no |

Detalles importantes:
- **No uses** `https://polygon-amoy.drpc.org` como RPC: rechaza el envío de transacciones y los anclajes quedan en PENDIENTE.
- Pega las claves **sin espacios, comillas ni saltos de línea**. Con o sin `0x` al inicio funciona.
- `VOLTERA_BLOCKCHAIN_PRIVATE_KEYS` admite varias claves de respaldo separadas por coma (`clave2,clave3`).
  El gateway intenta primero la principal; si no tiene saldo para el gas, usa la siguiente.
- Los valores anteriores (`0xd0Ef…EBcf530` y la wallet `0xA0A1…AFDf2`) quedaron **obsoletos**: reemplázalos.

Al terminar, **Save Changes**. Render redepliega el servicio solo (2–5 min en plan free).

---

## 3. Desplegar el código nuevo

El código del cambio de billetera ya está en `main`. Si el servicio tiene **Auto-Deploy** activado, Render
lo toma solo. Si no: **Manual Deploy → Deploy latest commit**.

---

## 4. Cómo comprobar que quedó bien

1. **Logs** del servicio en Render. Al arrancar deben aparecer:
   ```
   Oraculo on-chain #1 (principal): 0xb7acd8eeee86be961eaf832657b3b6807220fbcf
   Oraculo on-chain #2 (respaldo): 0x18b4358a54bf4742f877c855b60da823df414b5e
   Contrato: 0x59965b91bE294D1da408eAc8BB5455ca1C828000 | chainId: 80002
   NFT on-chain: emisor=0xb7ac... | contrato=0x819bc480006D279158CA9dFD6893e73071aC98d2
   ```
   Si en cambio dice `Cadena NO configurada` o `Contrato NFT NO configurado`, falta o está mal alguna variable.

2. **Estado de la red** (abre en el navegador):
   https://voltera-blockchain-gateway.onrender.com/api/v1/anclajes/red
   Debe responder `"configurada": true` y `"disponible": true` con el contrato `0x59965b…C828000`.
   (En plan free, la primera petición puede tardar ~1 min mientras el servicio despierta.)

3. **Front**: https://voltera-frontend.vercel.app/blockchain debe mostrar el contrato en vez de
   "sin desplegar / modo demo". Luego, en **Experimento de validación**, botón **Ejecutar todo**.

4. **PolygonScan**: cada anclaje aparece en
   https://amoy.polygonscan.com/address/0x59965b91bE294D1da408eAc8BB5455ca1C828000
   (el campo *From* muestra qué billetera firmó).

---

## 5. Si algo falla

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| Logs: `NumberFormatException` / el servicio no arranca | clave mal pegada (espacio, comilla, caracter extra) | volver a pegar la clave limpia |
| Anclajes quedan `PENDIENTE` con `ninguna billetera oraculo tiene saldo` | las dos billeteras sin POL | pedir POL en https://faucet.polygon.technology (red Amoy) para `0xB7aCd8EEeE86Be961EAf832657b3B6807220fbCf` o `0x18b4358A54BF4742f877c855B60dA823dF414b5E` |
| Anclajes quedan `PENDIENTE` con `Temporary internal error` | RPC equivocado | usar `https://polygon-amoy-bor-rpc.publicnode.com` |
| Error `AccessControlUnauthorizedAccount` | la clave no es de ninguna de las dos cuentas autorizadas | verificar que sean las claves de `0xB7aC…fbCf` y `0x18b4…4b5E` |
| `/certificados` sigue en modo demo | falta `VOLTERA_BLOCKCHAIN_CERTIFICADO_NFT` | agregarla (sección 2) |

---

## Referencia rápida (todo público)

| Elemento | Dirección |
|---|---|
| Cuenta principal (admin, oráculo, emisor NFT) | `0xB7aCd8EEeE86Be961EAf832657b3B6807220fbCf` |
| Cuenta de respaldo (oráculo, firmante) | `0x18b4358A54BF4742f877c855B60dA823dF414b5E` |
| LiquidacionP2PAnchor | `0x59965b91bE294D1da408eAc8BB5455ca1C828000` |
| ComunidadEnergeticaRegistry | `0xfC0edb98c4541527D012c6d81956D6762966453E` |
| CesionCertificadoMultisig | `0x3Cf07d38B59e9FC1a29bAcFCC9B8567D1411491d` |
| CertificadoOrigenNFT | `0x819bc480006D279158CA9dFD6893e73071aC98d2` |
| Red | Polygon Amoy · chainId 80002 · explorador https://amoy.polygonscan.com |
