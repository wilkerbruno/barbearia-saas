import React, { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Agendamento, StatusAgendamento } from "@barbearia-saas/shared";
import { api } from "../../api/client";
import { Card } from "../../components/Card";
import { PriceTag } from "../../components/PriceTag";
import { StatusBadge } from "../../components/StatusBadge";
import { colors, spacing } from "../../theme/tokens";
import { AgendaStackParamList } from "../../navigation/AgendaStack";

type Props = NativeStackScreenProps<AgendaStackParamList, "Agenda">;

// Agenda do dia do funcionário logado. Ver o protótipo de telas para a versão
// com seletor de dia (tiras de datas) — aqui já mostra a agenda de hoje em diante.
export function FuncionarioAgendaScreen({ navigation }: Props) {
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const hoje = new Date().toISOString().slice(0, 10);
      const { data } = await api.get<Agendamento[]>("/agendamentos/minha-agenda", { params: { data: hoje } });
      setAgendamentos(data);
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  async function concluir(id: string) {
    await api.patch(`/agendamentos/${id}/concluir`);
    carregar();
  }

  async function marcarNaoCompareceu(id: string) {
    await api.patch(`/agendamentos/${id}/nao-compareceu`);
    carregar();
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Minha agenda</Text>
        <Text style={styles.addButton} onPress={() => navigation.navigate("AgendarManual")}>
          + Novo
        </Text>
      </View>
      <FlatList
        data={agendamentos}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshing={carregando}
        onRefresh={carregar}
        ListEmptyComponent={!carregando ? <Text style={styles.empty}>Nenhum agendamento hoje.</Text> : null}
        renderItem={({ item }) => (
          <Card style={{ marginBottom: spacing.sm, gap: spacing.xs }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={styles.time}>{new Date(item.inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</Text>
              <StatusBadge status={item.status} />
            </View>
            <Text style={styles.meta}>{item.servico?.nome ?? item.pacote?.nome ?? "Serviço"}</Text>
            {item.cliente?.nome ? <Text style={styles.meta}>{item.cliente.nome}</Text> : null}
            {item.assinaturaPacoteId ? <Text style={styles.pacoteMensal}>Pacote mensal</Text> : null}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <PriceTag centavos={item.precoCentavos} />
              {item.status === StatusAgendamento.CONFIRMADO && (
                <View style={{ flexDirection: "row", gap: spacing.md }}>
                  <Text style={styles.naoCompareceu} onPress={() => marcarNaoCompareceu(item.id)}>
                    Não compareceu
                  </Text>
                  <Text style={styles.concluir} onPress={() => concluir(item.id)}>
                    Marcar concluído
                  </Text>
                </View>
              )}
            </View>
          </Card>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  title: { fontSize: 20, fontWeight: "800", color: colors.ink },
  addButton: { color: colors.accent, fontWeight: "700" },
  list: { padding: spacing.xl },
  empty: { color: colors.inkMuted, fontSize: 13, textAlign: "center", marginTop: spacing.xxl },
  time: { fontWeight: "800", color: colors.ink },
  meta: { fontSize: 12, color: colors.inkMuted },
  concluir: { color: colors.accent, fontWeight: "700", fontSize: 12 },
  naoCompareceu: { color: colors.danger, fontWeight: "700", fontSize: 12 },
  pacoteMensal: { fontSize: 11, fontWeight: "700", color: colors.accent },
});
