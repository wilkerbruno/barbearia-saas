import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { Avaliacao, BarbeariaPublica, Pacote, Servico } from "@barbearia-saas/shared";
import { api } from "../../api/client";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { PriceTag } from "../../components/PriceTag";
import { StarRating } from "../../components/StarRating";
import { colors, radius, spacing } from "../../theme/tokens";
import { HomeStackParamList } from "../../navigation/HomeStack";

type Props = NativeStackScreenProps<HomeStackParamList, "BarbeariaDetail">;
type AvaliacaoComCliente = Avaliacao & { cliente: { id: string; nome: string } };

// Detalhe de uma barbearia escolhida na Home: serviços/pacotes pra agendar
// (mesmo padrão de seleção que existia na Home antiga) e, abaixo, as
// avaliações — o formulário pra deixar a própria avaliação só aparece depois
// que o cliente já teve um atendimento concluído aqui (ver "podeAvaliar",
// calculado no back-end a partir do horário do agendamento).
export function BarbeariaDetailScreen({ route, navigation }: Props) {
  const { barbeariaId, nome } = route.params;

  const [barbearia, setBarbearia] = useState<BarbeariaPublica | null>(null);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [pacotes, setPacotes] = useState<Pacote[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<AvaliacaoComCliente[]>([]);
  const [podeAvaliar, setPodeAvaliar] = useState(false);
  const [minhaNota, setMinhaNota] = useState(0);
  const [comentario, setComentario] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [enviandoAvaliacao, setEnviandoAvaliacao] = useState(false);

  // Serviços/pacotes marcados aqui — ao tocar em "Agendar", eles vão prontos
  // pra tela seguinte, que pula direto pra escolha de dia/horário.
  const [servicosSelecionados, setServicosSelecionados] = useState<Set<string>>(new Set());
  const [pacotesSelecionados, setPacotesSelecionados] = useState<Set<string>>(new Set());

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [infoRes, servicosRes, pacotesRes, avaliacoesRes, minhaRes] = await Promise.all([
        api.get<BarbeariaPublica>(`/barbearias/${barbeariaId}/publico`),
        api.get<Servico[]>(`/barbearias/${barbeariaId}/servicos`),
        api.get<Pacote[]>(`/barbearias/${barbeariaId}/pacotes`),
        api.get<AvaliacaoComCliente[]>(`/barbearias/${barbeariaId}/avaliacoes`),
        api.get(`/barbearias/${barbeariaId}/avaliacoes/minha`).catch(() => ({ data: { avaliacao: null, podeAvaliar: false } })),
      ]);
      setBarbearia(infoRes.data);
      setServicos(servicosRes.data);
      setPacotes(pacotesRes.data);
      setAvaliacoes(avaliacoesRes.data);
      setPodeAvaliar(!!minhaRes.data?.podeAvaliar);
      if (minhaRes.data?.avaliacao) {
        setMinhaNota(minhaRes.data.avaliacao.nota);
        setComentario(minhaRes.data.avaliacao.comentario ?? "");
      }
    } finally {
      setCarregando(false);
    }
  }, [barbeariaId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function alternarServico(id: string) {
    setServicosSelecionados((atual) => {
      const novo = new Set(atual);
      novo.has(id) ? novo.delete(id) : novo.add(id);
      return novo;
    });
  }

  function alternarPacote(id: string) {
    setPacotesSelecionados((atual) => {
      const novo = new Set(atual);
      novo.has(id) ? novo.delete(id) : novo.add(id);
      return novo;
    });
  }

  const totalSelecionado = servicosSelecionados.size + pacotesSelecionados.size;

  function agendar() {
    if (totalSelecionado === 0) {
      navigation.navigate("Agendar", { barbeariaId, nome });
      return;
    }
    const itensPreSelecionados = [
      ...Array.from(servicosSelecionados).map((servicoId) => ({ servicoId })),
      ...Array.from(pacotesSelecionados).map((pacoteId) => ({ pacoteId })),
    ];
    navigation.navigate("Agendar", { barbeariaId, nome, itensPreSelecionados });
  }

  async function enviarAvaliacao() {
    if (minhaNota === 0) return;
    setEnviandoAvaliacao(true);
    try {
      await api.post(`/barbearias/${barbeariaId}/avaliacoes`, {
        nota: minhaNota,
        comentario: comentario || undefined,
      });
      await carregar();
    } finally {
      setEnviandoAvaliacao(false);
    }
  }

  if (carregando || !barbearia) {
    return (
      <SafeAreaView style={styles.center}>
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
          <View style={{ gap: spacing.xl }}>
            <View style={{ gap: spacing.xs }}>
              {barbearia.endereco && <Text style={styles.endereco}>{barbearia.endereco}</Text>}
              <StarRating value={barbearia.notaMedia} totalAvaliacoes={barbearia.totalAvaliacoes} size={14} />
            </View>

            <Button
              label={totalSelecionado > 0 ? `Ver horários (${totalSelecionado} selecionado${totalSelecionado === 1 ? "" : "s"})` : "Agendar horário"}
              onPress={agendar}
            />
            {totalSelecionado > 0 && (
              <Text style={styles.dica}>Toque em um serviço ou pacote pra marcar ou desmarcar.</Text>
            )}

            <View style={{ gap: spacing.sm }}>
              <Text style={styles.sectionTitle}>Serviços</Text>
              {servicos.map((item) => {
                const selecionado = servicosSelecionados.has(item.id);
                return (
                  <Pressable key={item.id} onPress={() => alternarServico(item.id)}>
                    <Card
                      style={[
                        { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
                        selecionado && styles.cardSelecionado,
                      ]}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 }}>
                        <Ionicons
                          name={selecionado ? "checkmark-circle" : "ellipse-outline"}
                          size={22}
                          color={selecionado ? colors.accent : colors.border}
                        />
                        <View>
                          <Text style={styles.itemName}>{item.nome}</Text>
                          <Text style={styles.itemMeta}>{item.duracaoMinutos} min</Text>
                        </View>
                      </View>
                      <PriceTag centavos={item.precoCentavos} />
                    </Card>
                  </Pressable>
                );
              })}
            </View>

            {pacotes.length > 0 && (
              <View style={{ gap: spacing.sm }}>
                <Text style={styles.sectionTitle}>Pacotes</Text>
                {pacotes.map((pacote) => {
                  const selecionado = pacotesSelecionados.has(pacote.id);
                  return (
                    <Pressable key={pacote.id} onPress={() => alternarPacote(pacote.id)}>
                      <Card style={selecionado && styles.cardSelecionado}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 }}>
                            <Ionicons
                              name={selecionado ? "checkmark-circle" : "ellipse-outline"}
                              size={22}
                              color={selecionado ? colors.accent : colors.border}
                            />
                            <Text style={styles.itemName}>{pacote.nome}</Text>
                          </View>
                          <PriceTag centavos={pacote.precoCentavos} />
                        </View>
                        {pacote.descricao && <Text style={[styles.itemMeta, { marginLeft: 30 }]}>{pacote.descricao}</Text>}
                      </Card>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {podeAvaliar && (
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
                <Button label="Enviar avaliação" onPress={enviarAvaliacao} loading={enviandoAvaliacao} disabled={minhaNota === 0} />
              </Card>
            )}

            <Text style={styles.sectionTitle}>Avaliações de clientes</Text>
          </View>
        }
        ListEmptyComponent={<Text style={styles.mensagem}>Ainda não há avaliações dessa barbearia.</Text>}
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
  itemName: { fontSize: 14, fontWeight: "700", color: colors.ink },
  itemMeta: { fontSize: 12, color: colors.inkMuted, marginTop: 2 },
  cardSelecionado: { borderColor: colors.accent, borderWidth: 1.5, backgroundColor: colors.accentSoft },
  dica: { fontSize: 12, color: colors.inkMuted, marginTop: -spacing.sm, textAlign: "center" },
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
