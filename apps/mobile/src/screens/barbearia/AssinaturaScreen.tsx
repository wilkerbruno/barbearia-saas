import React, { useCallback, useEffect, useState } from "react";
import { Alert, AppState, Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Plano, StatusAssinatura } from "@barbearia-saas/shared";
import { api } from "../../api/client";
import { useAuthStore } from "../../store/authStore";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { colors, spacing } from "../../theme/tokens";

interface AssinaturaDetalhada {
  status: StatusAssinatura;
  proximaCobrancaEm: string | null;
  trialTerminaEm: string | null;
  plano: Plano;
}

const STATUS_LABEL: Record<StatusAssinatura, string> = {
  [StatusAssinatura.TRIAL]: "Período de teste",
  [StatusAssinatura.ATIVA]: "Ativa",
  [StatusAssinatura.INADIMPLENTE]: "Pagamento pendente",
  [StatusAssinatura.CANCELADA]: "Cancelada",
};

function diasRestantes(dataIso: string): number {
  const diffMs = new Date(dataIso).getTime() - Date.now();
  return Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
}

// A barbearia gerencia a própria mensalidade do SaaS aqui: plano atual,
// próxima cobrança e troca de plano. Trocar de plano abre o checkout do
// Mercado Pago (fora do app) pro dono autorizar a cobrança recorrente com o
// cartão dele — a troca só é efetivada de fato quando o pagamento é
// confirmado. Essa também é a tela pra onde o RootNavigator manda o dono na
// marra quando a assinatura não está em dia (trial vencido ou mensalidade
// pendente) — ver authStore.assinaturaBloqueada — então ela também cumpre o
// papel de "resolver o bloqueio".
export function AssinaturaScreen() {
  const setAssinaturaBloqueada = useAuthStore((s) => s.setAssinaturaBloqueada);
  const logout = useAuthStore((s) => s.logout);
  const [assinatura, setAssinatura] = useState<AssinaturaDetalhada | null>(null);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [mostrarPlanos, setMostrarPlanos] = useState(false);
  const [abrindoCheckout, setAbrindoCheckout] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState(false);

  const carregar = useCallback(async () => {
    const [assinaturaRes, planosRes] = await Promise.all([
      api.get<AssinaturaDetalhada>("/assinaturas/minha"),
      api.get<Plano[]>("/planos"),
    ]);
    setAssinatura(assinaturaRes.data);
    setPlanos(planosRes.data);
    // Fecha o loop do bloqueio: assim que essa tela confirma que o status
    // voltou a ser TRIAL/ATIVA (ex: pagamento acabou de ser aprovado), o
    // RootNavigator libera as abas normais de novo.
    const emDia = assinaturaRes.data.status === StatusAssinatura.TRIAL || assinaturaRes.data.status === StatusAssinatura.ATIVA;
    setAssinaturaBloqueada(!emDia);
  }, [setAssinaturaBloqueada]);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  // Quando bloqueada, essa tela costuma ficar parada sozinha (sem abas pra
  // navegar e voltar, o que dispararia useFocusEffect de novo) — o dono some
  // pro checkout externo do Mercado Pago e volta pro app, o que só troca o
  // estado do app (background -> active), não a navegação. Sem isso, ele
  // ficaria vendo "pagamento pendente" mesmo depois de já ter pago, até
  // fechar e abrir o app de novo.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (estado) => {
      if (estado === "active") carregar();
    });
    return () => subscription.remove();
  }, [carregar]);

  async function atualizarStatus() {
    setAtualizando(true);
    try {
      await carregar();
    } finally {
      setAtualizando(false);
    }
  }

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

  const bloqueada = assinatura.status === StatusAssinatura.INADIMPLENTE || assinatura.status === StatusAssinatura.CANCELADA;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Assinatura</Text>

        {bloqueada && (
          <Card style={{ backgroundColor: "#F7E9E6", borderColor: colors.danger, gap: spacing.xs }}>
            <Text style={styles.bloqueadaTitulo}>Acesso da equipe bloqueado</Text>
            <Text style={styles.bloqueadaTexto}>
              {assinatura.status === StatusAssinatura.CANCELADA
                ? "Sua assinatura está cancelada. Escolha um plano abaixo para reativar o acesso de todos os funcionários."
                : "O pagamento da sua assinatura não foi confirmado. Escolha um plano abaixo para regularizar e liberar o acesso de todos os funcionários novamente."}
            </Text>
          </Card>
        )}

        {assinatura.status === StatusAssinatura.TRIAL && assinatura.trialTerminaEm && (
          <Card style={{ backgroundColor: colors.accentSoft, borderColor: colors.accent, gap: spacing.xs }}>
            <Text style={styles.bloqueadaTitulo}>Período de teste</Text>
            <Text style={styles.bloqueadaTexto}>
              {diasRestantes(assinatura.trialTerminaEm) === 0
                ? "Seu teste grátis termina hoje."
                : `Seu teste grátis termina em ${diasRestantes(assinatura.trialTerminaEm)} dia(s).`}{" "}
              Escolha um plano abaixo para continuar usando sem interrupção quando o teste acabar.
            </Text>
          </Card>
        )}

        <Card style={{ backgroundColor: colors.accentSoft, borderColor: colors.accent, gap: spacing.sm }}>
          <Text style={styles.planLabel}>PLANO ATUAL</Text>
          <Text style={styles.planName}>{assinatura.plano.nome}</Text>
          <Text style={styles.planPrice}>{(assinatura.plano.precoCentavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/mês</Text>
          <Text style={styles.status}>Status: {STATUS_LABEL[assinatura.status] ?? assinatura.status}</Text>
          {assinatura.proximaCobrancaEm && (
            <Text style={styles.meta}>Próxima cobrança: {new Date(assinatura.proximaCobrancaEm).toLocaleDateString("pt-BR")}</Text>
          )}
        </Card>

        <Button label={mostrarPlanos ? "Ocultar planos" : bloqueada ? "Escolher plano" : "Trocar de plano"} onPress={() => setMostrarPlanos((v) => !v)} />

        {mostrarPlanos && (
          <View style={{ gap: spacing.sm }}>
            <Text style={styles.hint}>
              Ao selecionar um plano, você vai abrir o checkout do Mercado Pago pra autorizar a cobrança mensal com seu
              cartão. Depois de autorizar, volte aqui — a tela atualiza sozinha assim que o app volta pra frente.
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

        <Text style={styles.atualizarLink} onPress={atualizando ? undefined : atualizarStatus}>
          {atualizando ? "Atualizando…" : "Já paguei — atualizar status"}
        </Text>

        {assinatura.status !== StatusAssinatura.CANCELADA && (
          <Text style={styles.cancelarLink} onPress={cancelarAssinatura}>
            Cancelar assinatura
          </Text>
        )}

        {bloqueada && (
          <Text style={styles.cancelarLink} onPress={logout}>
            Sair
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
  bloqueadaTitulo: { fontSize: 14, fontWeight: "800", color: colors.ink },
  bloqueadaTexto: { fontSize: 12.5, color: colors.inkMuted, lineHeight: 18 },
  atualizarLink: { color: colors.accent, fontWeight: "700", fontSize: 13, textAlign: "center", marginTop: spacing.xs },
  cancelarLink: { color: colors.danger, fontWeight: "700", fontSize: 13, textAlign: "center", marginTop: spacing.sm },
});
