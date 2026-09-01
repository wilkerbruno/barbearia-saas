import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "../../store/authStore";
import { Button } from "../../components/Button";
import { colors, spacing } from "../../theme/tokens";

// TODO (ver protótipo de telas): disponibilidade para novos agendamentos,
// horário de trabalho e lista de serviços que o funcionário realiza.
export function FuncionarioPerfilScreen() {
  const usuario = useAuthStore((s) => s.usuario);
  const logout = useAuthStore((s) => s.logout);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View>
          <Text style={styles.title}>Perfil</Text>
          <Text style={styles.name}>{usuario?.nome}</Text>
          <Text style={styles.email}>{usuario?.email}</Text>
        </View>
        <Button label="Sair da conta" variant="secondary" onPress={logout} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, padding: spacing.xl, justifyContent: "space-between" },
  title: { fontSize: 20, fontWeight: "800", color: colors.ink, marginBottom: spacing.lg },
  name: { fontSize: 16, fontWeight: "700", color: colors.ink },
  email: { fontSize: 13, color: colors.inkMuted, marginTop: 2 },
});
