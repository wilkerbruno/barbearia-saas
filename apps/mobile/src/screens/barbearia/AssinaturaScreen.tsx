import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Plano } from "@barbearia-saas/shared";
import { api } from "../../api/client";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { colors, spacing } from "../../theme/tokens";

interface AssinaturaDetalhada {
  status: string;
  proximaCobrancaEm: string | null;
  plano: Plano;
}

// A barbearia gerencia a própria mensalidade do SaaS aqui: plano atual,
// próxima cobrança e troca de plano.
export function AssinaturaScreen() {
  const [assinatura, setAssinatura] = useState<AssinaturaDetalhada | null>(null);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [mostrarPlanos, setMostrarPlanos] = useState(false);

  const carregar = useCallback(async () => {
    const [assinaturaRes, planosRes] = await Promise.all([
      api.get<AssinaturaDetalhada>("/assinaturas/minha"),
      api.get<Plano[]>("/planos"),
    ]);
    setAssinatura(assinaturaRes.data);
    setPlanos(planosRes.data);
  }, []);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  async function trocarPlano(planoId: string) {
    await api.patch("/assinaturas/minha/plano", { planoId });
    setMostrarPlanos(false);
    carregar();
  }

  if (!assinatura) return null;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Assinatura</Text>

        <Card style={{ backgroundColor: colors.accentSoft, borderColor: colors.accent, gap: spacing.sm }}>
          <Text style={styles.planLabel}>PLANO ATUAL</Text>
          <Text style={styles.planName}>{assinatura.plano.nome}</Text>
          <Text style={styles.planPrice}>{(assinatura.plano.precoCentavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/mês</Text>
          <Text style={styles.status}>Status: {assinatura.status}</Text>
        </Card>

        <Button label={mostrarPlanos ? "Ocultar planos" : "Ver outros planos"} variant="secondary" onPress={() => setMostrarPlanos((v) => !v)} />

        {mostrarPlanos && (
          <View style={{ gap: spacing.sm }}>
            {planos.map((p) => (
              <Card key={p.id} style={{ gap: spacing.xs }}>
                <Text style={styles.planName}>{p.nome} — {(p.precoCentavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/mês</Text>
                <Text style={styles.meta}>{p.recursos.join(" · ")}</Text>
                <Button label="Selecionar plano" onPress={() => trocarPlano(p.id)} />
              </Card>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.lg },
  title: { fontSize: 20, fontWeight: "800", color: colors.ink },
  planLabel: { fontSize: 11, fontWeight: "700", color: colors.accent },
  planName: { fontSize: 16, fontWeight: "800", color: colors.ink },
  planPrice: { fontSize: 22, fontWeight: "800", color: colors.ink },
  status: { fontSize: 12, color: colors.inkMuted },
  meta: { fontSize: 12, color: colors.inkMuted },
});
