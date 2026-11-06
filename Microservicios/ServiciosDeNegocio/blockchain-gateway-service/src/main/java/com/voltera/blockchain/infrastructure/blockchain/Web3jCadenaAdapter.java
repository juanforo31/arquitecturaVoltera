package com.voltera.blockchain.infrastructure.blockchain;

import com.voltera.blockchain.domain.model.Anclaje;
import com.voltera.blockchain.domain.port.out.CadenaBlockchainPort;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.web3j.abi.FunctionEncoder;
import org.web3j.abi.datatypes.Function;
import org.web3j.abi.datatypes.generated.Bytes32;
import org.web3j.abi.datatypes.generated.Uint32;
import org.web3j.abi.datatypes.generated.Uint64;
import org.web3j.crypto.Credentials;
import org.web3j.protocol.Web3j;
import org.web3j.protocol.core.DefaultBlockParameterName;
import org.web3j.protocol.core.methods.response.EthSendTransaction;
import org.web3j.protocol.core.methods.response.TransactionReceipt;
import org.web3j.tx.RawTransactionManager;
import org.web3j.tx.response.PollingTransactionReceiptProcessor;
import org.web3j.utils.Numeric;

import java.math.BigInteger;
import java.util.Arrays;
import java.util.List;

/**
 * Adaptador de SALIDA hacia Polygon Amoy via el RPC gratuito del tercero (web3j).
 * Construye y firma la transaccion que invoca LiquidacionP2PAnchor.anclar(...).
 *
 * <p>Clasifica los errores: un revert del contrato (conflicto de hash) es
 * DEFINITIVO; un problema de red/RPC es TRANSITORIO (lo reintenta el relay).</p>
 */
public class Web3jCadenaAdapter implements CadenaBlockchainPort {

    private static final Logger log = LoggerFactory.getLogger(Web3jCadenaAdapter.class);

    private final Web3j web3j;
    private final SelectorBilletera selector;
    private final String contractAddress;
    private final long chainId;

    public Web3jCadenaAdapter(Web3j web3j, SelectorBilletera selector,
                              String contractAddress, long chainId) {
        this.web3j = web3j;
        this.selector = selector;
        this.contractAddress = contractAddress;
        this.chainId = chainId;
    }

    @Override
    public boolean disponible() {
        if (web3j == null || selector == null || selector.vacio()
                || contractAddress == null || contractAddress.isBlank()) {
            return false;
        }
        try {
            web3j.ethBlockNumber().send();
            return true;
        } catch (Exception e) {
            log.debug("RPC no disponible: {}", e.getMessage());
            return false;
        }
    }

    @Override
    public ResultadoAnclaje anclar(Anclaje a) {
        if (!disponible()) {
            return ResultadoAnclaje.transitorio("conexion RPC no disponible");
        }
        try {
            Function fn = new Function(
                    "anclar",
                    List.of(
                            new Bytes32(txIdABytes32(a.transaccionId())),
                            new Bytes32(Numeric.hexStringToByteArray(a.hashCasacion())),
                            new Uint32(BigInteger.valueOf(a.energiaWh())),
                            new Uint64(BigInteger.valueOf(a.liquidadaEnEpoch()))
                    ),
                    List.of());
            String data = FunctionEncoder.encode(fn);

            var receiptProcessor = new PollingTransactionReceiptProcessor(web3j, 3000, 20);

            // Gas price dinámico: Amoy rechaza transacciones por debajo de ~25 gwei
            // ("gas price below minimum"). Consultamos el precio real de la red y
            // garantizamos un piso de 30 gwei (sin multiplicar, para no inflar el coste).
            BigInteger gasPrice = resolverGasPrice();
            // gasLimit acotado: anclar un hash gasta ~70-90k gas; 200k da margen de
            // sobra. El default de web3j (9M) haría que coste = gasPrice*9M y agotara
            // el saldo del faucet ("insufficient funds for gas").
            BigInteger gasLimit = BigInteger.valueOf(200_000L);

            // Billetera con fondos: si la principal se quedo sin POL, firma la de respaldo.
            BigInteger costoMaximo = gasPrice.multiply(gasLimit);
            Credentials credentials = selector.elegir(costoMaximo).orElse(null);
            if (credentials == null) {
                return ResultadoAnclaje.transitorio(
                        "ninguna billetera oraculo tiene saldo para el gas maximo (" + costoMaximo + " wei)");
            }
            log.info("Anclando transaccion={} con billetera {}", a.transaccionId(), credentials.getAddress());
            var txManager = new RawTransactionManager(web3j, credentials, chainId, receiptProcessor);

            EthSendTransaction sent = txManager.sendTransaction(
                    gasPrice, gasLimit, contractAddress, data, BigInteger.ZERO);

            if (sent.hasError()) {
                String msg = sent.getError().getMessage();
                return esDefinitivo(msg)
                        ? ResultadoAnclaje.definitivo(msg)
                        : ResultadoAnclaje.transitorio(msg);
            }

            String txHash = sent.getTransactionHash();
            TransactionReceipt receipt = receiptProcessor.waitForTransactionReceipt(txHash);

            if (receipt != null && receipt.isStatusOK()) {
                Long bloque = receipt.getBlockNumber() != null ? receipt.getBlockNumber().longValue() : null;
                Long gas = receipt.getGasUsed() != null ? receipt.getGasUsed().longValue() : null;
                return ResultadoAnclaje.ok(txHash, bloque, gas);
            }
            return ResultadoAnclaje.transitorio("recibo sin confirmacion OK (txHash=" + txHash + ")");

        } catch (Exception e) {
            String msg = String.valueOf(e.getMessage());
            log.warn("Error anclando transaccion={}: {}", a.transaccionId(), msg);
            return esDefinitivo(msg)
                    ? ResultadoAnclaje.definitivo(msg)
                    : ResultadoAnclaje.transitorio(msg);
        }
    }

    /** Piso de gas price para Polygon Amoy (30 gwei; la red exige >= ~25 gwei). */
    private static final BigInteger GAS_PRICE_MIN = BigInteger.valueOf(30_000_000_000L);

    /**
     * Resuelve el gas price: consulta el precio real de la red (eth_gasPrice),
     * le aplica un margen del 20% y garantiza el piso de 30 gwei. Amoy rechaza
     * transacciones por debajo del mínimo ("gas price below minimum").
     */
    private BigInteger resolverGasPrice() {
        try {
            BigInteger red = web3j.ethGasPrice().send().getGasPrice();
            BigInteger conMargen = red.multiply(BigInteger.valueOf(120)).divide(BigInteger.valueOf(100));
            return conMargen.max(GAS_PRICE_MIN);
        } catch (Exception e) {
            log.warn("No se pudo leer eth_gasPrice ({}); usando piso {} wei", e.getMessage(), GAS_PRICE_MIN);
            return GAS_PRICE_MIN;
        }
    }

    /** Un revert por hash en conflicto no se arregla reintentando. */
    private boolean esDefinitivo(String msg) {
        if (msg == null) return false;
        String m = msg.toLowerCase();
        return m.contains("revert") || m.contains("yaanclada") || m.contains("already");
    }

    /**
     * Convierte el transaccionId (String del dominio) en bytes32. Si ya viene como
     * hex 0x de 32 bytes se usa tal cual; si no, se usa su keccak256 como id en cadena.
     */
    static byte[] txIdABytes32(String transaccionId) {
        if (transaccionId.startsWith("0x") && transaccionId.length() == 66) {
            return Numeric.hexStringToByteArray(transaccionId);
        }
        byte[] hash = org.web3j.crypto.Hash.sha3(transaccionId.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        return Arrays.copyOf(hash, 32);
    }
}
