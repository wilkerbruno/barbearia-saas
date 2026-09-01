import React, { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { api } from "../../api/client";
import { useAuthStore } from "../../store/authStore";
import { Button } from "../../components/Button";
import { colors, radius, spacing } from "../../theme/tokens";
import { AuthStackParamList } from "../../navigation/AuthNavigator";

type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

export function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const entrar = useAuthStore((s) => s.entrar);

  async function handleLogin() {
    setErro(null);
    setCarregando(true);
    try {
      const { data } = await api.post("/auth/login", { email, senha });
      await entrar(data.accessToken, data.usuario);
      // Não precisa navegar manualmente: o RootNavigator troca de stack
      // sozinho assim que `usuario` muda no authStore.
    } catch (e: any) {
      setErro(e?.response?.data?.message ?? "Não foi possível entrar. Confira seus dados.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Entrar</Text>
        <Text style={styles.subtitle}>Acesse sua conta de cliente, funcionário ou barbearia</Text>

        <View style={styles.field}>
          <Text style={styles.label}>E-mail</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            style={styles.input}
            placeholder="voce@email.com"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Senha</Text>
          <TextInput
            value={senha}
            onChangeText={setSenha}
            secureTextEntry
            style={styles.input}
            placeholder="••••••••"
          />
        </View>

        {erro && <Text style={styles.erro}>{erro}</Text>}

        <Button label="Entrar" onPress={handleLogin} loading={carregando} />

        <Button
          label="Criar conta de cliente"
          variant="secondary"
          onPress={() => navigation.navigate("RegistrarCliente")}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, padding: spacing.xl, justifyContent: "center", gap: spacing.md },
  title: { fontSize: 26, fontWeight: "800", color: colors.ink },
  subtitle: { fontSize: 13, color: colors.inkMuted, marginBottom: spacing.lg },
  field: { gap: spacing.xs },
  label: { fontSize: 12, fontWeight: "600", color: colors.inkMuted },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 14,
    color: colors.ink,
  },
  erro: { color: colors.danger, fontSize: 13 },
});
