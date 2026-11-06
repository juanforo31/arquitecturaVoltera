package com.voltera.blockchain.infrastructure.config;

import com.voltera.blockchain.application.AnclajeService;
import com.voltera.blockchain.application.CertificadoService;
import com.voltera.blockchain.domain.port.out.AnclajeRepositoryPort;
import com.voltera.blockchain.domain.port.out.CadenaBlockchainPort;
import com.voltera.blockchain.domain.port.out.CertificadoNftPort;
import com.voltera.blockchain.domain.port.out.EventPublisherPort;
import com.voltera.blockchain.domain.port.out.HashServicePort;
import com.voltera.blockchain.infrastructure.blockchain.CadenaNoConfigurada;
import com.voltera.blockchain.infrastructure.blockchain.CertificadoNftDemoAdapter;
import com.voltera.blockchain.infrastructure.blockchain.SelectorBilletera;
import com.voltera.blockchain.infrastructure.blockchain.Web3jCadenaAdapter;
import com.voltera.blockchain.infrastructure.blockchain.Web3jCertificadoNftAdapter;
import com.voltera.blockchain.infrastructure.crypto.Web3jHashService;
import com.voltera.blockchain.infrastructure.messaging.KafkaEventPublisher;
import com.voltera.blockchain.infrastructure.messaging.LogEventPublisher;
import com.voltera.blockchain.infrastructure.persistence.InMemoryAnclajeRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.core.KafkaTemplate;
import org.web3j.crypto.Credentials;
import org.web3j.protocol.Web3j;
import org.web3j.protocol.http.HttpService;

import java.util.List;

/**
 * Wiring hexagonal (Ports & Adapters). Elige el adaptador de cadena segun haya o
 * no configuracion, y el publicador segun Kafka este habilitado. El dominio y la
 * aplicacion no conocen Spring.
 */
@Configuration
@EnableConfigurationProperties(BlockchainProperties.class)
public class BeanConfiguration {

    private static final Logger log = LoggerFactory.getLogger(BeanConfiguration.class);

    @Bean
    public AnclajeRepositoryPort anclajeRepository() {
        return new InMemoryAnclajeRepository();
    }

    @Bean
    public HashServicePort hashService() {
        return new Web3jHashService();
    }

    /** Cliente web3j hacia el RPC del tercero (null si no hay URL configurada). */
    @Bean
    public Web3j web3j(BlockchainProperties props) {
        if (props.getRpcUrl() == null || props.getRpcUrl().isBlank()) {
            return null;
        }
        log.info("Conectando a la cadena via RPC del tercero: {}", props.getRpcUrl());
        return Web3j.build(new HttpService(props.getRpcUrl()));
    }

    @Bean
    public CadenaBlockchainPort cadenaBlockchain(BlockchainProperties props, ObjectProvider<Web3j> web3jProvider) {
        Web3j web3j = web3jProvider.getIfAvailable();
        if (!props.estaConfigurada() || web3j == null) {
            log.warn("Cadena NO configurada (faltan rpcUrl/privateKey/contractAddress). "
                    + "Arrancando en modo demo: los anclajes quedaran PENDIENTE.");
            return new CadenaNoConfigurada();
        }
        // Principal + respaldo: si una billetera se queda sin gas, firma la siguiente.
        List<Credentials> billeteras = props.clavesOraculo().stream()
                .map(k -> Credentials.create(normalizar(k)))
                .toList();
        for (int i = 0; i < billeteras.size(); i++) {
            log.info("Oraculo on-chain #{}{}: {}", i + 1, i == 0 ? " (principal)" : " (respaldo)",
                    billeteras.get(i).getAddress());
        }
        log.info("Contrato: {} | chainId: {}", props.getContractAddress(), props.getChainId());
        return new Web3jCadenaAdapter(web3j, SelectorBilletera.conWeb3j(web3j, billeteras),
                props.getContractAddress(), props.getChainId());
    }

    @Bean
    public EventPublisherPort eventPublisher(
            ObjectProvider<KafkaTemplate<String, String>> kafkaTemplateProvider,
            BlockchainProperties props) {
        KafkaTemplate<String, String> template = kafkaTemplateProvider.getIfAvailable();
        if (template == null) {
            log.warn("KafkaTemplate no disponible: se usara LogEventPublisher (modo demo).");
            return new LogEventPublisher();
        }
        return new KafkaEventPublisher(template, "topic.blockchain.anclada");
    }

    @Bean
    public AnclajeService anclajeService(AnclajeRepositoryPort repo, CadenaBlockchainPort cadena,
                                         EventPublisherPort publicador, HashServicePort hash,
                                         BlockchainProperties props) {
        return new AnclajeService(repo, cadena, publicador, hash, props.getNetwork());
    }

    /**
     * Adaptador hacia el contrato ERC-721 CertificadoOrigenNFT. Si no hay NFT
     * configurado (o no hay cadena), usa el adaptador demo para que el flujo
     * emision/transferencia/quema sea completo end-to-end sin cadena real.
     */
    @Bean
    public CertificadoNftPort certificadoNftPort(BlockchainProperties props, ObjectProvider<Web3j> web3jProvider) {
        Web3j web3j = web3jProvider.getIfAvailable();
        String nft = props.getCertificadoNftAddress();
        if (web3j == null || nft == null || nft.isBlank()
                || props.getPrivateKey() == null || props.getPrivateKey().isBlank()) {
            log.warn("Contrato NFT NO configurado (falta certificadoNftAddress/privateKey/RPC). "
                    + "Certificados en modo demo (txHash simulado, estado en memoria).");
            return new CertificadoNftDemoAdapter();
        }
        Credentials credentials = Credentials.create(normalizar(props.getPrivateKey()));
        log.info("NFT on-chain: emisor={} | contrato={} | chainId={}",
                credentials.getAddress(), nft, props.getChainId());
        return new Web3jCertificadoNftAdapter(web3j, credentials, nft, props.getChainId());
    }

    @Bean
    public CertificadoService certificadoService(CertificadoNftPort nft) {
        return new CertificadoService(nft);
    }

    /**
     * Normaliza la clave privada: quita espacios, tabuladores y saltos de línea
     * (que a veces se cuelan al pegar el secret en paneles de PaaS) y garantiza
     * el prefijo 0x. Sin esto, un salto accidental hace fallar web3j con
     * NumberFormatException ("... under radix 16") y el servicio no arranca.
     */
    private static String normalizar(String pk) {
        if (pk == null) return "";
        String limpio = pk.replaceAll("\\s+", "");
        return limpio.startsWith("0x") ? limpio : "0x" + limpio;
    }
}
