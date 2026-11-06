package com.voltera.blockchain.infrastructure.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.ArrayList;
import java.util.List;

/**
 * Propiedades de conexion a la cadena. Se rellenan desde variables de entorno
 * VOLTERA_BLOCKCHAIN_* / application.yml.
 */
@ConfigurationProperties(prefix = "voltera.blockchain")
public class BlockchainProperties {

    /** URL del RPC del tercero (p. ej. https://rpc-amoy.polygon.technology). */
    private String rpcUrl = "";
    /** Clave privada de la cuenta oraculo (solo testnet). */
    private String privateKey = "";
    /**
     * Claves de billeteras oraculo de RESPALDO, separadas por coma (solo testnet).
     * Se usan, en orden, cuando la principal no tiene saldo para el gas.
     */
    private String privateKeys = "";
    /** Direccion del contrato LiquidacionP2PAnchor desplegado. */
    private String contractAddress = "";
    /** Direccion del contrato CertificadoOrigenNFT (ERC-721) desplegado. */
    private String certificadoNftAddress = "";
    /** chainId de la red (Amoy = 80002). */
    private long chainId = 80002L;
    /** Nombre logico de la red para los eventos. */
    private String network = "polygon-amoy";

    public boolean estaConfigurada() {
        return !isBlank(rpcUrl) && !clavesOraculo().isEmpty() && !isBlank(contractAddress);
    }

    /** Clave principal primero y luego las de respaldo, sin vacias ni repetidas. */
    public List<String> clavesOraculo() {
        List<String> claves = new ArrayList<>();
        if (!isBlank(privateKey)) claves.add(privateKey);
        for (String k : privateKeys.split(",")) {
            if (!isBlank(k) && !claves.contains(k)) claves.add(k);
        }
        return claves;
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    /**
     * Quita espacios, tabuladores y saltos de línea que a veces se cuelan al
     * pegar secrets en paneles de PaaS (Render/Fly). Sin esto, una dirección o
     * clave con un '\n' hace fallar web3j (NumberFormatException / dirección
     * inválida) y el servicio no arranca o los anclajes revientan.
     */
    private static String limpiar(String s) {
        return s == null ? "" : s.replaceAll("\\s+", "");
    }

    public String getRpcUrl() { return rpcUrl; }
    public void setRpcUrl(String rpcUrl) { this.rpcUrl = limpiar(rpcUrl); }
    public String getPrivateKey() { return privateKey; }
    public void setPrivateKey(String privateKey) { this.privateKey = limpiar(privateKey); }
    public String getPrivateKeys() { return privateKeys; }
    public void setPrivateKeys(String privateKeys) { this.privateKeys = limpiar(privateKeys); }
    public String getContractAddress() { return contractAddress; }
    public void setContractAddress(String contractAddress) { this.contractAddress = limpiar(contractAddress); }
    public String getCertificadoNftAddress() { return certificadoNftAddress; }
    public void setCertificadoNftAddress(String certificadoNftAddress) { this.certificadoNftAddress = limpiar(certificadoNftAddress); }
    public long getChainId() { return chainId; }
    public void setChainId(long chainId) { this.chainId = chainId; }
    public String getNetwork() { return network; }
    public void setNetwork(String network) { this.network = limpiar(network); }
}
