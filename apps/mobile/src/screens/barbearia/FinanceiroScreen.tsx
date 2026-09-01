import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { ResumoFinanceiro } from "@barbearia-saas/shared";
import { api } from "../../api/client";
import { Card } from "../../components/Card";
import { PriceTag } from "../../components/PriceTag";
import { colors, spacing } from "../../theme/tokens";

interface ResumoBarbearia {
  atendimentos: number;
  faturamentoCentavos: number;
  comissoesCentavos: number;
  lucroCentavos: number;
  porFuncionario: Array<{ nome: string; atendimentos: number; faturamentoCentavos: number; comissaoCentavos: number }>;
}

const PERIODOS: Array<{ key: ResumoFinanceiro["periodo"]; label: string }> = [
  { key: "hoje", label: "Hoje" },
  { key: "semana", label: "Semana" },
  { key: "mes", label: "Mês" },
];

export function BarbeariaFinanceiroScreen() {
  const [periodo, setPeriodo] = useState<ResumoFinanceiro["periodo"]>("semana");
  const [resumo, setResumo] = useState<ResumoBarbearia | null>(null);

  const carregar = useCallback(async (p: ResumoFinanceiro["periodo"]) => {
    const { data } = await api.get<ResumoBarbearia>("/financeiro/resumo-barbearia", { params: { periodo: p } });
    setResumo(data);
  }, []);

  useFocusEffect(useCallback(() => { carregar(periodo); }, [carregar, periodo]));

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Financeiro</Text>

        <View style={styles.periodRow}>
          {PERIODOS.map((p) => (
            <Text key={p.key} onPress={() => setPeriodo(p.key)} style={[styles.periodItem, p.key === periodo && styles.periodItemActive]}>
              {p.label}
            </Text>
          ))}
        </View>

        {resumo && (
          <View style={{ gap: spacing.md }}>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Card style={{ flex: 1 }}>
                <Text style={styles.label}>Faturamento</Text>
                <PriceTag centavos={resumo.faturamentoCentavos} size={16} />
              </Card>
              <Card style={{ flex: 1 }}>
                <Text style={styles.label}>Comissões</Text>
                <PriceTag centavos={resumo.comissoesCentavos} size={16} />
              </Card>
              <Card style={{ flex: 1, backgroundColor: colors.accentSoft }}>
                <Text style={[styles.label, { color: colors.accent }]}>Lucro</Text>
                <PriceTag centavos={resumo.lucroCentavos} size={16} />
              </Card>
            </View>

            <Text style={styles.sectionTitle}>Por funcionário</Text>
            {resumo.porFuncionario.map((f) => (
              <Card key={f.nome} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View>
                  <Text style={{ fontWeight: "700", color: colors.ink }}>{f.nome}</Text>
                  <Text style={{ fontSize: 12, color: colors.inkMuted }}>{f.atendimentos} atendimentos</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <PriceTag centavos={f.faturamentoCentavos} />
                  <Text style={{ fontSize: 11, color: colors.inkMuted }}>com. {(f.comissaoCentavos / 100).toFixed(2)}</Text>
                </View>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.lg },
  title: { fontSize: 20, fontWeight: "800", color: colors.ink },
  periodRow: { flexDirection: "row", gap: spacing.sm },
  periodItem: { fontSize: 13, fontWeight: "700", color: colors.inkMuted, padding: spacing.sm },
  periodItemActive: { color: colors.accent },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: colors.inkMuted, textTransform: "uppercase" },
  label: { fontSize: 11, color: colors.inkMuted, marginBottom: 4 },
});
