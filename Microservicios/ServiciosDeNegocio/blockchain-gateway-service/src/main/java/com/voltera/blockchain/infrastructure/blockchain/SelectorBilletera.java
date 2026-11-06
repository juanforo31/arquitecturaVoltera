package com.voltera.blockchain.infrastructure.blockchain;

import org.web3j.crypto.Credentials;
import org.web3j.protocol.Web3j;
import org.web3j.protocol.core.DefaultBlockParameterName;

import java.math.BigInteger;
import java.util.List;
import java.util.Optional;
import java.util.function.Function;

/**
 * Elige con que billetera oraculo firmar: recorre las billeteras en orden
 * (principal primero, luego las de respaldo) y devuelve la primera cuyo saldo
 * cubra el gas maximo de la transaccion (gasPrice * gasLimit).
 *
 * <p>Si ninguna alcanza, devuelve vacio y el anclaje queda TRANSITORIO para que
 * el relay lo reintente cuando alguna billetera se recargue en el faucet.</p>
 */
public class SelectorBilletera {

    private final List<Credentials> billeteras;
    private final Function<String, BigInteger> saldoDe;

    public SelectorBilletera(List<Credentials> billeteras, Function<String, BigInteger> saldoDe) {
        this.billeteras = List.copyOf(billeteras);
        this.saldoDe = saldoDe;
    }

    /** Selector que consulta el saldo real de cada billetera via eth_getBalance. */
    public static SelectorBilletera conWeb3j(Web3j web3j, List<Credentials> billeteras) {
        return new SelectorBilletera(billeteras, direccion -> {
            try {
                return web3j.ethGetBalance(direccion, DefaultBlockParameterName.LATEST).send().getBalance();
            } catch (Exception e) {
                return BigInteger.ZERO;
            }
        });
    }

    public Optional<Credentials> elegir(BigInteger costoMaximoWei) {
        for (Credentials c : billeteras) {
            BigInteger saldo = saldoDe.apply(c.getAddress());
            if (saldo != null && saldo.compareTo(costoMaximoWei) >= 0) {
                return Optional.of(c);
            }
        }
        return Optional.empty();
    }

    public boolean vacio() {
        return billeteras.isEmpty();
    }
}
