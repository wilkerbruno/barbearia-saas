import React, { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Servico } from "@barbearia-saas/shared";
import { api } from "../../api/client";
import { useAuthStore } from "../../store/authStore";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { PriceTag } from "../../components/PriceTag";
import { colors, radius, spacing } from "../../theme/tokens";

// Onde a barbearia "coloca preço nos trabalhos" — o pedido original do produto.
// Pacotes seguem o mesmo padrão via POST/PATCH /pacotes (ver servicos.controller.ts na API).
export function ServicosScreen() {
  const barbeariaId = useAuthStore((s) => s.usuario?.barbeariaId);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [precoReais, setPrecoReais] = useState("");

  const carregar = useCallback(async () => {
    if (!barbeariaId) return;
    const { data } = await api.get<Servico[]>(`/barbearias/${barbeariaId}/servicos`);
    setServicos(data);
  }, [barbeariaId]);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  function iniciarEdicao(servico: Servico) {
    setEditandoId(servico.id);
    setPrecoReais((servico.precoCentavos / 100).toFixed(2));
  }

  async function salvarPreco(id: string) {
    const precoCentavos = Math.round(parseFloat(precoReais.replace(",", ".")) * 100);
    if (Number.isNaN(precoCentavos)) return;
    await api.patch(`/servicos/${id}`, { precoCentavos });
    setEditandoId(null);
    carregar();
  }

  async function novoServico() {
    await api.post("/servicos", { nome: "Novo serviço", duracaoMinutos: 30, precoCentavos: 0 });
    carregar();
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Serviços e pacotes</Text>
        <Text style={styles.addButton} onPress={novoServico}>+ Novo</Text>
      </View>
      <FlatList
        data={servicos}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Card style={{ marginBottom: spacing.sm, flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.nome}</Text>
              <Text style={styles.meta}>{item.duracaoMinutos} min</Text>
            </View>
            {editandoId === item.id ? (
              <>
                <TextInput
                  value={precoReais}
                  onChangeText={setPrecoReais}
                  keyboardType="decimal-pad"
                  style={styles.input}
                />
                <Text style={styles.saveButton} onPress={() => salvarPreco(item.id)}>Salvar</Text>
              </>
            ) : (
              <>
                <PriceTag centavos={item.precoCentavos} />
                <Text style={styles.editButton} onPress={() => iniciarEdicao(item)}>Editar</Text>
              </>
            )}
          </Card>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  title: { fontSize: 20, fontWeight: "800", color: colors.ink },
  addButton: { color: colors.accent, fontWeight: "700" },
  list: { padding: spacing.xl },
  name: { fontWeight: "700", color: colors.ink },
  meta: { fontSize: 12, color: colors.inkMuted },
  input: {
    width: 70,
    borderWidth: 1.5,
    borderColor: colors.accent,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    textAlign: "right",
  },
  saveButton: { color: colors.accent, fontWeight: "700", fontSize: 12 },
  editButton: { color: colors.inkMuted, fontWeight: "700", fontSize: 12 },
});
