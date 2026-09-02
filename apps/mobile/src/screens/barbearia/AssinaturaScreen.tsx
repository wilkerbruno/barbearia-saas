import React, { useCallback, useState } from "react";
import { Alert, Linking, ScrollView, StyleSheet, Text, View } from "react-native";
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
// próxima cobrança e troca de plano. Trocar de plano abre o checkout do
// Mercado Pago (fora do app) pro dono autorizar a cobrança recorrente com o
// cartão dele — a troca só é efetivada de fato quando o pagamento é
// confirmado (o app só reflete isso quando você volta e puxa pra atualizar).
export function AssinaturaScreen() {
  const [assinatura, setAssinatura] = useState<AssinaturaDetalhada | null>(null);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [mostrarPlanos, setMostrarPlanos] = useState(false);
  const [abrindoCheckout, setAbrindoCheckout] = useState<string | null>(null);

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
    setAbrindoCheckout(planoId);
    try {
      const { data } = await api.post<{ initPoint: string }>("/assinaturas/minha/checkout", { planoId });
      await Linking.openURL(data.initPoint);
      setMostrarPlanos(false);
    } catch (e: any) {
      Alert.alert("Não foi possível iniciar o pagamento", e?.response?.data?.message ?? "Tente de novo.");
    } finally {
      setAbrindoCheckout(null);
    }
  }

  async function cancelarAssinatura() {
    Alert.alert("Cancelar assinatura?", "Sua barbearia perde acesso ao sistema no fim do período já pago.", [
      { text: "Voltar", style: "cancel" },
      {
        text: "Cancelar assinatura",
        style: "destructive",
        onPress: async () => {
          await api.patch("/assinaturas/minha/cancelar");
          carregar();
        },
      },
    ]);
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
          {assinatura.proximaCobrancaEm && (
            <Text style={styles.meta}>Próxima cobrança: {new Date(assinatura.proximaCobrancaEm).toLocaleDateString("pt-BR")}</Text>
          )}
        </Card>

        <Button label={mostrarPlanos ? "Ocultar planos" : "Trocar de plano"} variant="secondary" onPress={() => setMostrarPlanos((v) => !v)} />

        {mostrarPlanos && (
          <View style={{ gap: spacing.sm }}>
            <Text style={styles.hint}>
              Ao selecionar um plano, você vai abrir o checkout do Mercado Pago pra autorizar a cobrança mensal com seu
              cartão. Depois de autorizar, volte aqui e atualize a tela pra ver o plano novo confirmado.
            </Text>
            {planos.map((p) => (
              <Card key={p.id} style={{ gap: spacing.xs }}>
                <Text style={styles.planName}>{p.nome} — {(p.precoCentavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/mês</Text>
                <Text style={styles.meta}>{p.recursos.join(" · ")}</Text>
                <Button
                  label="Selecionar plano"
                  onPress={() => trocarPlano(p.id)}
                  loading={abrindoCheckout === p.id}
                  disabled={abrindoCheckout !== null}
                />
              </Card>
            ))}
          </View>
        )}

        {assinatura.status !== "CANCELADA" && (
          <Text style={styles.cancelarLink} onPress={cancelarAssinatura}>
            Cancelar assinatura
          </Text>
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
  hint: { fontSize: 12, color: colors.inkMuted },
  cancelarLink: { color: colors.danger, fontWeight: "700", fontSize: 13, textAlign: "center", marginTop: spacing.sm },
});
