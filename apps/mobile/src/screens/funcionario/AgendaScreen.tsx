import React, { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Agendamento } from "@barbearia-saas/shared";
import { api } from "../../api/client";
import { Card } from "../../components/Card";
import { PriceTag } from "../../components/PriceTag";
import { StatusBadge } from "../../components/StatusBadge";
import { colors, spacing } from "../../theme/tokens";

// Agenda do dia do funcionário logado. Ver o protótipo de telas para a versão
// com seletor de dia (tiras de datas) — aqui já mostra a agenda de hoje em diante.
export function FuncionarioAgendaScreen() {
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

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Text style={styles.title}>Minha agenda</Text>
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
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <PriceTag centavos={item.precoCentavos} />
              <Text style={styles.concluir} onPress={() => concluir(item.id)}>
                Marcar concluído
              </Text>
            </View>
          </Card>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  title: { fontSize: 20, fontWeight: "800", color: colors.ink, paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  list: { padding: spacing.xl },
  empty: { color: colors.inkMuted, fontSize: 13, textAlign: "center", marginTop: spacing.xxl },
  time: { fontWeight: "800", color: colors.ink },
  concluir: { color: colors.accent, fontWeight: "700", fontSize: 12 },
});
