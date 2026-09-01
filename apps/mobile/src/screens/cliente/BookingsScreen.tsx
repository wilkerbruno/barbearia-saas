import React, { useCallback, useState } from "react";
import { Alert, FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Agendamento, StatusAgendamento } from "@barbearia-saas/shared";
import { api } from "../../api/client";
import { Card } from "../../components/Card";
import { PriceTag } from "../../components/PriceTag";
import { StatusBadge } from "../../components/StatusBadge";
import { colors, spacing } from "../../theme/tokens";

export function BookingsScreen() {
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const { data } = await api.get<Agendamento[]>("/agendamentos/meus");
      setAgendamentos(data);
    } finally {
      setCarregando(false);
    }
  }, []);

  // Recarrega toda vez que a tela ganha foco (ex: voltando de um novo agendamento).
  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar]),
  );

  async function cancelar(id: string) {
    Alert.alert("Cancelar agendamento?", "Essa ação não pode ser desfeita.", [
      { text: "Voltar", style: "cancel" },
      {
        text: "Cancelar agendamento",
        style: "destructive",
        onPress: async () => {
          await api.patch(`/agendamentos/${id}/cancelar`);
          carregar();
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Text style={styles.title}>Meus agendamentos</Text>
      <FlatList
        data={agendamentos}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshing={carregando}
        onRefresh={carregar}
        ListEmptyComponent={!carregando ? <Text style={styles.empty}>Você ainda não tem agendamentos.</Text> : null}
        renderItem={({ item }) => (
          <Card style={{ marginBottom: spacing.sm, gap: spacing.sm }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={styles.itemTitle}>{new Date(item.inicio).toLocaleString("pt-BR")}</Text>
              <StatusBadge status={item.status} />
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <PriceTag centavos={item.precoCentavos} />
              {(item.status === StatusAgendamento.PENDENTE || item.status === StatusAgendamento.CONFIRMADO) && (
                <Text style={styles.cancelar} onPress={() => cancelar(item.id)}>
                  Cancelar
                </Text>
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
  title: { fontSize: 20, fontWeight: "800", color: colors.ink, paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  list: { padding: spacing.xl },
  empty: { color: colors.inkMuted, fontSize: 13, textAlign: "center", marginTop: spacing.xxl },
  itemTitle: { fontWeight: "700", color: colors.ink },
  cancelar: { color: colors.danger, fontWeight: "700", fontSize: 13 },
});
