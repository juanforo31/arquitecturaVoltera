package com.voltera.blockchain.infrastructure.blockchain;

import org.junit.jupiter.api.Test;
import org.web3j.crypto.Credentials;

import java.math.BigInteger;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SelectorBilleteraTest {

    private static final Credentials PRINCIPAL = Credentials.create("0x" + "1".repeat(64));
    private static final Credentials RESPALDO = Credentials.create("0x" + "2".repeat(64));
    /** 200k gas * 36 gwei: lo que el nodo exige tener para aceptar un anclaje. */
    private static final BigInteger COSTO = new BigInteger("7200000000000000");
    private static final BigInteger UN_POL = BigInteger.TEN.pow(18);

    @Test
    void usaLaDeRespaldoSiLaPrincipalNoTieneFondos() {
        Map<String, BigInteger> saldos = Map.of(
                PRINCIPAL.getAddress(), BigInteger.ZERO,
                RESPALDO.getAddress(), UN_POL);
        var selector = new SelectorBilletera(List.of(PRINCIPAL, RESPALDO), saldos::get);

        assertEquals(RESPALDO.getAddress(), selector.elegir(COSTO).orElseThrow().getAddress());
    }

    @Test
    void prefiereLaPrincipalSiLeAlcanza() {
        var selector = new SelectorBilletera(List.of(PRINCIPAL, RESPALDO), dir -> UN_POL);

        assertEquals(PRINCIPAL.getAddress(), selector.elegir(COSTO).orElseThrow().getAddress());
    }

    @Test
    void ningunaConFondosDevuelveVacio() {
        var selector = new SelectorBilletera(List.of(PRINCIPAL, RESPALDO), dir -> BigInteger.ONE);

        assertTrue(selector.elegir(COSTO).isEmpty());
    }
}
