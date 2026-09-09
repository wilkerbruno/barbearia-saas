import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { BarbeariaPublica, Pacote, Servico } from "@barbearia-saas/shared";
import { api } from "../../api/client";
import { BARBEARIA_ID } from "../../config";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { PriceTag } from "../../components/PriceTag";
import { StarRating } from "../../components/StarRating";
import { colors, spacing } from "../../theme/tokens";
import { HomeStackParamList } from "../../navigation/HomeStack";

type Props = NativeStackScreenProps<HomeStackParamList, "Home">;

export function HomeScreen({ navigation }: Props) {
  const [barbearia, setBarbearia] = useState<BarbeariaPublica | null>(null);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [pacotes, setPacotes] = useState<Pacote[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Serviços/pacotes que o cliente já marcou aqui na Home — ao tocar em
  // "Agendar", eles vão prontos pra tela seguinte, que pula direto pra
  // escolha de dia/horário em vez de pedir pra escolher tudo de novo.
  const [servicosSelecionados, setServicosSelecionados] = useState<Set<string>>(new Set());
  const [pacotesSelecionados, setPacotesSelecionados] = useState<Set<string>>(new Set());

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
      // Nada marcado: manda pra tela de Agendar sem seleção prévia, onde o
      // cliente escolhe os serviços/pacotes normalmente.
      navigation.navigate("Agendar", undefined);
      return;
    }
    const itensPreSelecionados = [
      ...Array.from(servicosSelecionados).map((servicoId) => ({ servicoId })),
      ...Array.from(pacotesSelecionados).map((pacoteId) => ({ pacoteId })),
    ];
    navigation.navigate("Agendar", { itensPreSelecionados });
  }

  useEffect(() => {
    async function carregar() {
      try {
        const [infoRes, servicosRes, pacotesRes] = await Promise.all([
          api.get<BarbeariaPublica>(`/barbearias/${BARBEARIA_ID}/publico`),
          api.get<Servico[]>(`/barbearias/${BARBEARIA_ID}/servicos`),
          api.get<Pacote[]>(`/barbearias/${BARBEARIA_ID}/pacotes`),
        ]);
        setBarbearia(infoRes.data);
        setServicos(servicosRes.data);
        setPacotes(pacotesRes.data);
      } finally {
        setCarregando(false);
      }
    }
    carregar();
  }, []);

  if (carregando) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <FlatList
        data={servicos}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={{ gap: spacing.xl }}>
            <View style={{ gap: spacing.xs }}>
              <Text style={styles.title}>{barbearia?.nome}</Text>
              {barbearia?.endereco && <Text style={styles.subtitle}>{barbearia.endereco}</Text>}
              {barbearia && (
                <StarRating value={barbearia.notaMedia} totalAvaliacoes={barbearia.totalAvaliacoes} size={14} />
              )}
            </View>

            <Button
              label={totalSelecionado > 0 ? `Ver horários (${totalSelecionado} selecionado${totalSelecionado === 1 ? "" : "s"})` : "Agendar horário"}
              onPress={agendar}
            />
            {totalSelecionado > 0 && (
              <Text style={styles.dica}>Toque em um serviço ou pacote pra marcar ou desmarcar.</Text>
            )}

            <Text style={styles.sectionTitle}>Serviços</Text>
          </View>
        }
        renderItem={({ item }) => {
          const selecionado = servicosSelecionados.has(item.id);
          return (
            <Pressable onPress={() => alternarServico(item.id)}>
              <Card
                style={[
                  { marginBottom: spacing.sm, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
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
        }}
        ListFooterComponent={
          <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
            <Text style={styles.sectionTitle}>Pacotes</Text>
            {pacotes.map((pacote) => {
              const selecionado = pacotesSelecionados.has(pacote.id);
              return (
                <Pressable key={pacote.id} onPress={() => alternarPacote(pacote.id)}>
                  <Card style={[{ marginBottom: spacing.sm }, selecionado && styles.cardSelecionado]}>
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
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  list: { padding: spacing.xl },
  title: { fontSize: 20, fontWeight: "800", color: colors.ink },
  subtitle: { fontSize: 13, color: colors.inkMuted, marginTop: 2 },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: colors.ink, marginBottom: spacing.sm },
  itemName: { fontSize: 14, fontWeight: "700", color: colors.ink },
  itemMeta: { fontSize: 12, color: colors.inkMuted, marginTop: 2 },
  cardSelecionado: { borderColor: colors.accent, borderWidth: 1.5, backgroundColor: colors.accentSoft },
  dica: { fontSize: 12, color: colors.inkMuted, marginTop: -spacing.sm, textAlign: "center" },
});
