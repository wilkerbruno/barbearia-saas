import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "../../components/Button";
import { colors, spacing } from "../../theme/tokens";

// Tela de guarda: aparece quando a conta logada tem um papel sem suporte no
// app mobile (hoje, só o SAAS_ADMIN — que usa o painel administrativo web).
// Sem isso, o RootNavigator não batia em nenhum caso pra esse papel e a tela
// ficava em branco/travada, sem nenhum jeito de sair a não ser reinstalando
// o app (o token continuava salvo no dispositivo).
export function AcessoNaoSuportadoScreen({ onSair }: { onSair: () => void }) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Ionicons name="lock-closed-outline" size={48} color={colors.accent} />
        <Text style={styles.title}>Esta conta não pode ser acessada por aqui</Text>
        <Text style={styles.subtitle}>
          Esta é uma conta de administrador da plataforma. Ela só funciona no painel
          administrativo (web) — não no aplicativo do celular. Saia e entre com uma
          conta de cliente, funcionário ou dono de barbearia.
        </Text>
        <Button label="Sair" onPress={onSair} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  title: { fontSize: 18, fontWeight: "800", color: colors.ink, textAlign: "center" },
  subtitle: { fontSize: 13, color: colors.inkMuted, textAlign: "center", marginBottom: spacing.md, lineHeight: 19 },
});
