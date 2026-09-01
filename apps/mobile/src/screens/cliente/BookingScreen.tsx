import React, { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { FuncionarioPublico, Servico } from "@barbearia-saas/shared";
import { api } from "../../api/client";
import { BARBEARIA_ID } from "../../config";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { PriceTag } from "../../components/PriceTag";
import { colors, radius, spacing } from "../../theme/tokens";
import { HomeStackParamList } from "../../navigation/HomeStack";

type Props = NativeStackScreenProps<HomeStackParamList, "Agendar">;

// Versão simplificada do fluxo de 4 passos do protótipo de telas (serviço →
// profissional → data/hora → confirmação), reunidos numa única tela para o
// scaffold inicial. Separar em telas/steps é um bom próximo passo de polish.
export function BookingScreen({ route, navigation }: Props) {
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [funcionarios, setFuncionarios] = useState<FuncionarioPublico[]>([]);
  const [servicoId, setServicoId] = useState<string | undefined>(route.params?.servicoId);
  const [funcionarioId, setFuncionarioId] = useState<string | undefined>();
  const [dataHora, setDataHora] = useState(""); // formato livre no MVP: "2026-09-04T14:40:00"
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    async function carregar() {
      const [servicosRes, funcionariosRes] = await Promise.all([
        api.get<Servico[]>(`/barbearias/${BARBEARIA_ID}/servicos`),
        api.get<FuncionarioPublico[]>(`/barbearias/${BARBEARIA_ID}/funcionarios`),
      ]);
      setServicos(servicosRes.data);
      setFuncionarios(funcionariosRes.data);
      setServicoId((atual) => atual ?? servicosRes.data[0]?.id);
      setFuncionarioId(funcionariosRes.data[0]?.id);
    }
    carregar();
  }, []);

  async function confirmar() {
    if (!servicoId || !funcionarioId || !dataHora) return;
    setEnviando(true);
    try {
      await api.post("/agendamentos", { servicoId, funcionarioId, inicio: new Date(dataHora).toISOString() });
      Alert.alert("Agendamento confirmado!", "Você pode acompanhar em Meus agendamentos.");
      navigation.navigate("Home");
    } catch (e: any) {
      Alert.alert("Não foi possível agendar", e?.response?.data?.message ?? "Tente outro horário.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Serviço</Text>
        <View style={{ gap: spacing.sm }}>
          {servicos.map((s) => (
            <Card
              key={s.id}
              style={{
                borderColor: s.id === servicoId ? colors.accent : colors.border,
                backgroundColor: s.id === servicoId ? colors.accentSoft : colors.surface,
                flexDirection: "row",
                justifyContent: "space-between",
              }}
            >
              <Text onPress={() => setServicoId(s.id)} style={{ fontWeight: "700", color: colors.ink }}>
                {s.nome}
              </Text>
              <PriceTag centavos={s.precoCentavos} />
            </Card>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Profissional</Text>
        <View style={{ gap: spacing.sm }}>
          {funcionarios.map((f) => (
            <Card
              key={f.id}
              style={{
                borderColor: f.id === funcionarioId ? colors.accent : colors.border,
                backgroundColor: f.id === funcionarioId ? colors.accentSoft : colors.surface,
              }}
            >
              <Text onPress={() => setFuncionarioId(f.id)} style={{ fontWeight: "700", color: colors.ink }}>
                {f.usuario.nome} · {f.cargo}
              </Text>
            </Card>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Data e hora</Text>
        <Text style={styles.hint}>
          Formato do MVP: digite manualmente (ex: 2026-09-04T14:40:00). Trocar por um seletor de
          calendário/horários é o próximo passo natural aqui.
        </Text>
        <View style={styles.dateInputPlaceholder}>
          <Text
            style={{ color: dataHora ? colors.ink : colors.inkMuted }}
            onPress={() => setDataHora("2026-09-04T14:40:00")}
          >
            {dataHora || "Toque para usar um horário de exemplo"}
          </Text>
        </View>

        <Button label="Confirmar agendamento" onPress={confirmar} loading={enviando} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.md },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: colors.inkMuted, textTransform: "uppercase", marginTop: spacing.md },
  hint: { fontSize: 12, color: colors.inkMuted },
  dateInputPlaceholder: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    backgroundColor: colors.surface,
  },
});
