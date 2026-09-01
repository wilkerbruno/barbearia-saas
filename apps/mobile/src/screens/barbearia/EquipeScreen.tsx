import React, { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { FuncionarioPublico } from "@barbearia-saas/shared";
import { api } from "../../api/client";
import { useAuthStore } from "../../store/authStore";
import { Card } from "../../components/Card";
import { colors, spacing } from "../../theme/tokens";

// Leitura da equipe. Convite de novo funcionário e ativar/desativar exigem um
// pequeno módulo de gestão de convites na API (fora do escopo deste scaffold
// inicial) — ver o protótipo de telas para a UX completa dessa tela.
export function EquipeScreen() {
  const barbeariaId = useAuthStore((s) => s.usuario?.barbeariaId);
  const [funcionarios, setFuncionarios] = useState<FuncionarioPublico[]>([]);

  const carregar = useCallback(async () => {
    if (!barbeariaId) return;
    const { data } = await api.get<FuncionarioPublico[]>(`/barbearias/${barbeariaId}/funcionarios`);
    setFuncionarios(data);
  }, [barbeariaId]);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Text style={styles.title}>Equipe</Text>
      <FlatList
        data={funcionarios}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Card style={{ marginBottom: spacing.sm }}>
            <Text style={styles.name}>{item.usuario.nome}</Text>
            <Text style={styles.meta}>{item.cargo}</Text>
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
  name: { fontWeight: "700", color: colors.ink },
  meta: { fontSize: 12, color: colors.inkMuted },
});
