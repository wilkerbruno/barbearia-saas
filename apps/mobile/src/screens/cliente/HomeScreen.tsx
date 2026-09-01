import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pacote, Servico } from "@barbearia-saas/shared";
import { api } from "../../api/client";
import { BARBEARIA_ID } from "../../config";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { PriceTag } from "../../components/PriceTag";
import { colors, spacing } from "../../theme/tokens";
import { HomeStackParamList } from "../../navigation/HomeStack";

type Props = NativeStackScreenProps<HomeStackParamList, "Home">;

export function HomeScreen({ navigation }: Props) {
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [pacotes, setPacotes] = useState<Pacote[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    async function carregar() {
      try {
        const [servicosRes, pacotesRes] = await Promise.all([
          api.get<Servico[]>(`/barbearias/${BARBEARIA_ID}/servicos`),
          api.get<Pacote[]>(`/barbearias/${BARBEARIA_ID}/pacotes`),
        ]);
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
            <View>
              <Text style={styles.title}>Barbearia Alameda</Text>
              <Text style={styles.subtitle}>Rua das Palmeiras, 92</Text>
            </View>

            <Button
              label="Agendar horário"
              onPress={() => navigation.navigate("Agendar", { servicoId: servicos[0]?.id })}
            />

            <Text style={styles.sectionTitle}>Serviços</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Card style={{ marginBottom: spacing.sm, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View>
              <Text style={styles.itemName}>{item.nome}</Text>
              <Text style={styles.itemMeta}>{item.duracaoMinutos} min</Text>
            </View>
            <PriceTag centavos={item.precoCentavos} />
          </Card>
        )}
        ListFooterComponent={
          <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
            <Text style={styles.sectionTitle}>Pacotes</Text>
            {pacotes.map((pacote) => (
              <Card key={pacote.id} style={{ marginBottom: spacing.sm }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={styles.itemName}>{pacote.nome}</Text>
                  <PriceTag centavos={pacote.precoCentavos} />
                </View>
                {pacote.descricao && <Text style={styles.itemMeta}>{pacote.descricao}</Text>}
              </Card>
            ))}
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
});
