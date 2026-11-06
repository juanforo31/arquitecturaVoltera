# Guía del experimento · Marketplace P2P de energía + anclaje on-chain

> Entrega ARTI4208 · Voltera. Esta guía explica **qué es el experimento**, **cómo
> ejecutarlo de forma reproducible** y **cómo se orquestan los servicios**.
> Diagrama de secuencia: `Modificados/Voltera_Flujo_Experimento_P2P.png`.

---

## 1. Qué demuestra el experimento

Un mercado entre prosumidores de una **comunidad energética**: alguien con excedente
solar lo **vende**, otro lo **compra**, el sistema los **casa** (match) creando un
contrato de liquidación, y ese contrato se **ancla en Polygon Amoy** (blockchain
pública de pruebas) dejando **trazabilidad verificable**: solo el *hash* del contrato
viaja a la cadena, no los datos.

Propiedades que se evidencian:
- **Casación justa**: precio = promedio entre lo que pide el vendedor y lo que
  acepta el comprador; energía casada = mínimo entre oferta y demanda.
- **Reglas de mercado**: solo casan órdenes de la **misma comunidad**, de
  **prosumidores distintos**, con **precio de venta ≤ precio de compra**.
- **Integridad on-chain**: cualquiera puede recomputar el hash y verificar que
  coincide con el anclado (prueba de no-manipulación).

---

## 2. Arquitectura que se orquesta

| Componente | Rol | Dónde corre |
|---|---|---|
| **Front Angular** (`/blockchain`) | UI del marketplace | Vercel (público) |
| **BFF serverless** (`/api/gw`, `/api/token`) | proxy + OAuth2 a WSO2 | Vercel |
| **WSO2 API Manager** | API Gateway (OAuth2, rate limit) | clúster (LAN) |
| **liquidacion-p2p** | casa las órdenes, crea el contrato | clúster k8s `voltera-app` |
| **blockchain-gateway** | calcula hash, firma y ancla en Amoy | Render (público) |
| **Polygon Amoy** | registro inmutable (contrato `0x5996…C828000`) | testnet EVM |

### Dos formas de disparar el anclaje (ambas implementadas)

1. **REST (camino activo en la demo pública)**: el front/servicio llama al gateway
   por REST → el gateway ancla. Funciona en Render sin depender del broker.
2. **EDA / orquestación por eventos (clúster)**: al casar, `liquidacion-p2p`
   **publica** `LiquidacionCalculada` en el topic `topic.facturacion.liquidacion`;
   el `blockchain-gateway` **consume** ese topic y ancla **automáticamente**. Se
   activa con `KAFKA_ENABLED=true` (así está en el manifiesto k8s). En Render se
   deja en `false` porque el broker Redpanda vive en la LAN.

Ambos caminos son **idempotentes** aguas abajo: el gateway deduplica por
`transaccionId`, de modo que tener los dos activos no duplica anclajes.

---

## 3. Ejecutar el experimento — opción A (script, reproducible)

La forma recomendada para la entrega: un script que ejecuta el flujo completo y
guarda evidencia. **No requiere Docker, VPN ni la LAN** (usa el BFF de Vercel y el
gateway de Render).

```bash
cd Microservicios
./experimento-p2p.sh
```

Imprime 7 pasos y guarda un JSON de evidencia en `evidencia-experimento/`:

```
PASO 0 · gateway + cadena conectada (chainId 80002, contrato 0x5996…)
PASO 1 · token OAuth2 (BFF → WSO2)
PASO 2 · órdenes y reglas de casación
PASO 3 · (1) CASAR → contrato creado en liquidacion-p2p
PASO 4 · (2) ANCLAR → hash enviado a Polygon
PASO 5 · confirmación on-chain (txHash, bloque, gas)
PASO 6 · verificación de integridad (hash recomputado == on-chain)
PASO 7 · evidencia guardada (JSON)
```

Parámetros personalizables por variables de entorno:

```bash
VENDEDOR=PRO-SOLAR-01 COMPRADOR=PRO-CASA-07 COMUNIDAD=COMUNIDAD-SOLAR-01 \
KWH_VENTA=12 PRECIO_VENTA=420 KWH_COMPRA=10 PRECIO_COMPRA=500 \
./experimento-p2p.sh
```

> **Nota cold-start**: el gateway (Render free tier) duerme tras ~15 min de
> inactividad; el PASO 0 puede tardar ~60-90 s en el primer intento. El script
> reintenta solo.

---

## 4. Ejecutar el experimento — opción B (en la web, para sustentar)

URL: **https://voltera-frontend.vercel.app/blockchain**

1. **Verifica la cabecera**: debe decir `polygon-amoy · chainId 80002 · cadena conectada`.
2. **Publica** una venta y una compra en la **misma comunidad**:
   - Venta: `PRO-SOLAR-01` · `COMUNIDAD-SOLAR-01` · 12 kWh · 420/kWh.
   - Compra: `PRO-CASA-07` · `COMUNIDAD-SOLAR-01` · 10 kWh · 500/kWh.
3. **Selecciona** ambas tarjetas (quedan resaltadas). *No* mezcles comunidades.
4. Pulsa **"Casar y anclar contrato"**. Verás *Contrato casado* y *Contrato anclado*.
5. **Espera** ~unos segundos: con el auto-refresco el estado pasa a **CONFIRMADO**
   y suben los contadores (On-chain ✓, kWh casados, Volumen).
6. Abre **detalle** → copia `txHash` / abre **PolygonScan**; usa **Verificar** para
   comprobar la integridad; exporta **CSV/JSON** como evidencia.

---

## 5. Evidencia de una ejecución real (2026-10-22)

```
Contrato:  e1671590-42a8-411d-b184-c29dbe131d04
Casación:  10 kWh @ 460 /kWh = 4600 COP (PARCIAL: la venta de 12 deja 2 kWh)
Hash:      0x2143c504…4f6c3eb5
txHash:    0xd6330049…81d0efc1
Bloque:    50862256 · Gas: 119988
Verifica:  https://amoy.polygonscan.com/tx/0xd6330049410ef4bd4189310f898a37b01f4d8ab85031ebf317c0613881d0efc1
Integridad: ✓ (hash recomputado == anclado on-chain)
```

---

## 6. Reproducibilidad: alcance y limitaciones honestas

- **Determinismo**: el script A es el camino reproducible para la entrega: siempre
  ejecuta el mismo flujo y deja evidencia datada.
- **Estado volátil**: tanto `liquidacion-p2p` como el store de anclajes del gateway
  son **in-memory**. Si un pod/servicio reinicia, se pierde el **historial** en el
  servicio (aunque la transacción siga on-chain en Polygon para siempre). En la UI
  está el botón **Re-sincronizar** para reconciliar. Para una persistencia dura
  habría que añadir un adaptador JPA/Redis detrás del puerto de repositorio
  (la arquitectura hexagonal ya lo permite sin tocar el dominio).
- **Modo demo vs real**: el anclaje real on-chain requiere que el gateway tenga
  configurados `VOLTERA_BLOCKCHAIN_RPC_URL`, `PRIVATE_KEY` (wallet de prueba con POL
  de faucet) y `CONTRACT_ADDRESS`. Si faltan, los anclajes quedan `PENDIENTE`
  (modo demo). En Render ya están configurados (cadena conectada = true).

---

## 7. Qué se implementó para esta entrega

- **Script `Microservicios/experimento-p2p.sh`**: ejecuta y documenta el flujo
  completo end-to-end con evidencia JSON (verificado).
- **Orquestación por eventos (EDA) en `liquidacion-p2p`**: nuevo evento de dominio
  `LiquidacionCalculada`, puerto de salida `LiquidacionEventPublisherPort`,
  adaptador Kafka condicional (`voltera.kafka.enabled`) y no-op por defecto. Al
  casar se publica el evento que el gateway ya sabía consumir → cierra el flujo EDA
  del diagrama de arquitectura. 13 tests verdes (incluye `OrquestacionEdaTest`).
- **Manifiesto k8s** (`voltera-services.yaml`): `KAFKA_ENABLED=true` para el
  `liquidacion-p2p` del clúster.
- **Diagrama de secuencia**: `Modificados/Voltera_Flujo_Experimento_P2P.{drawio,png}`.

### Pendiente de despliegue (requiere Docker)

El código del EDA está compilado y probado, pero **desplegarlo al clúster** exige
reconstruir la imagen (`liquidacion-p2p-service`) y aplicar el manifiesto:

```bash
# con Docker corriendo:
cd Microservicios/k8s && ./build-push-all.sh   # reconstruye y sube a Harbor
kubectl -n voltera-app apply -f voltera-services.yaml
kubectl -n voltera-app rollout restart deploy/liquidacion-p2p-service
```

Mientras tanto, el experimento **funciona end-to-end por el camino REST** (opciones
A y B), que es el que corre en la infraestructura pública.
