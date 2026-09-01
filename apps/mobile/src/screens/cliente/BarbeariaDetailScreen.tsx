import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Avaliacao, BarbeariaPublica } from "@barbearia-saas/shared";
import { api } from "../../api/client";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { StarRating } from "../../components/StarRating";
import { colors, radius, spacing } from "../../theme/tokens";
import { NearbyStackParamList } from "../../navigation/NearbyStack";

type Props = NativeStackScreenProps<NearbyStackParamList, "BarbeariaDetail">;
type AvaliacaoComCliente = Avaliacao & { cliente: { id: string; nome: string } };

// Detalhe de uma barbearia encontrada em "Perto de você": nota média, lista
// de avaliações de outros clientes e um seletor de estrelas pra o cliente
// logado deixar (ou atualizar) a própria avaliação.
export function BarbeariaDetailScreen({ route }: Props) {
  const { barbeariaId } = route.params;
  const [barbearia, setBarbearia] = useState<BarbeariaPublica | null>(null);
  const [avaliacoes, setAvaliacoes] = useState<AvaliacaoComCliente[]>([]);
  const [minhaNota, setMinhaNota] = useState(0);
  const [comentario, setComentario] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [infoRes, avaliacoesRes, minhaRes] = await Promise.all([
        api.get<BarbeariaPublica>(`/barbearias/${barbeariaId}/publico`),
        api.get<AvaliacaoComCliente[]>(`/barbearias/${barbeariaId}/avaliacoes`),
        api.get(`/barbearias/${barbeariaId}/avaliacoes/minha`).catch(() => ({ data: null })),
      ]);
      setBarbearia(infoRes.data);
      setAvaliacoes(avaliacoesRes.data);
      if (minhaRes.data) {
        setMinhaNota(minhaRes.data.nota);
        setComentario(minhaRes.data.comentario ?? "");
      }
    } finally {
      setCarregando(false);
    }
  }, [barbeariaId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function enviarAvaliacao() {
    if (minhaNota === 0) return;
    setEnviando(true);
    try {
      await api.post(`/barbearias/${barbeariaId}/avaliacoes`, {
        nota: minhaNota,
        comentario: comentario || undefined,
      });
      await carregar();
    } finally {
      setEnviando(false);
    }
  }

  if (carregando || !barbearia) {
    return (
      <SafeAreaView style={styles.center} edges={["bottom"]}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <FlatList
        data={avaliacoes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={{ gap: spacing.lg, marginBottom: spacing.lg }}>
            <View>
              {barbearia.endereco && <Text style={styles.endereco}>{barbearia.endereco}</Text>}
              <View style={{ marginTop: spacing.xs }}>
                <StarRating value={barbearia.notaMedia} totalAvaliacoes={barbearia.totalAvaliacoes} size={18} />
              </View>
            </View>

            <Card style={{ gap: spacing.sm }}>
              <Text style={styles.sectionTitle}>Sua avaliação</Text>
              <StarRating value={minhaNota} onChange={setMinhaNota} size={30} />
              <TextInput
                value={comentario}
                onChangeText={setComentario}
                placeholder="Conte como foi seu atendimento (opcional)"
                placeholderTextColor={colors.inkMuted}
                style={styles.input}
                multiline
              />
              <Button label="Enviar avaliação" onPress={enviarAvaliacao} loading={enviando} disabled={minhaNota === 0} />
            </Card>

            <Text style={styles.sectionTitle}>Avaliações de clientes</Text>
          </View>
        }
        ListEmptyComponent={<Text style={styles.mensagem}>Ainda não há avaliações — seja o primeiro a avaliar!</Text>}
        renderItem={({ item }) => (
          <Card style={{ marginBottom: spacing.sm, gap: 4 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={styles.itemName}>{item.cliente.nome}</Text>
              <StarRating value={item.nota} size={12} />
            </View>
            {item.comentario && <Text style={styles.itemMeta}>{item.comentario}</Text>}
          </Card>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  list: { padding: spacing.xl },
  endereco: { fontSize: 13, color: colors.inkMuted },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: colors.ink },
  mensagem: { color: colors.inkMuted, fontSize: 13, textAlign: "center", marginTop: spacing.md },
  itemName: { fontSize: 13, fontWeight: "700", color: colors.ink },
  itemMeta: { fontSize: 12, color: colors.inkMuted, marginTop: 2 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 13,
    color: colors.ink,
    minHeight: 60,
    textAlignVertical: "top",
  },
});
