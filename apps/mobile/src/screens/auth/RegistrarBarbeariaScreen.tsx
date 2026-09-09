import React, { useEffect, useState } from "react";
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { Plano, centavosParaReais } from "@barbearia-saas/shared";
import { api } from "../../api/client";
import { useAuthStore } from "../../store/authStore";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { PasswordInput } from "../../components/PasswordInput";
import { colors, radius, spacing } from "../../theme/tokens";

// Onboarding de uma nova barbearia assinante do SaaS, pelo próprio app:
// cria o tenant + o usuário dono (BARBEARIA_ADMIN) num plano em TRIAL, e
// deixa o dono já enviar a logo da barbearia (opcional — dá pra fazer isso
// depois também, em "Mais > Logo").
export function RegistrarBarbeariaScreen() {
  const [nomeBarbearia, setNomeBarbearia] = useState("");
  const [nomeDono, setNomeDono] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [planoId, setPlanoId] = useState<string | null>(null);
  const [logo, setLogo] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const entrar = useAuthStore((s) => s.entrar);

  useEffect(() => {
    api
      .get<Plano[]>("/planos")
      .then(({ data }) => {
        setPlanos(data);
        if (data.length > 0) setPlanoId((atual) => atual ?? data[0].id);
      })
      .catch(() => {
        // Sem planos carregados, o botão de criar conta fica desabilitado
        // (garantirAcesso abaixo) — não trava a tela, só não deixa continuar.
      });
  }, []);

  async function escolherLogo() {
    const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissao.granted) return;

    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!resultado.canceled && resultado.assets[0]) {
      setLogo(resultado.assets[0]);
    }
  }

  async function enviarLogoSeHouver(barbeariaId: string) {
    if (!logo) return;
    const formData = new FormData();
    formData.append("logo", {
      uri: logo.uri,
      name: logo.fileName ?? "logo.jpg",
      type: logo.mimeType ?? "image/jpeg",
    } as unknown as Blob);
    try {
      await api.post(`/barbearias/${barbeariaId}/logo`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    } catch {
      // A conta já foi criada com sucesso nesse ponto — não vale a pena barrar
      // o cadastro por causa da logo. Dá pra tentar de novo em Mais > Logo.
    }
  }

  async function handleRegistrar() {
    if (!planoId) {
      setErro("Escolha um plano para continuar.");
      return;
    }
    setErro(null);
    setCarregando(true);
    try {
      const { data } = await api.post("/auth/registrar-barbearia", {
        nomeBarbearia,
        nomeDono,
        email,
        senha,
        planoId,
      });
      await enviarLogoSeHouver(data.barbearia.id);
      await entrar(data.accessToken, data.usuario);
      // Não precisa navegar manualmente: o RootNavigator troca de stack
      // sozinho assim que `usuario` muda no authStore (igual no login).
    } catch (e: any) {
      setErro(e?.response?.data?.message ?? "Não foi possível criar a conta da barbearia.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Cadastrar barbearia</Text>
          <Text style={styles.subtitle}>Comece grátis no período de teste do seu plano</Text>

          <Pressable style={styles.logoPicker} onPress={escolherLogo}>
            {logo ? (
              <Image source={{ uri: logo.uri }} style={styles.logoPreview} />
            ) : (
              <View style={styles.logoPlaceholder}>
                <Ionicons name="camera-outline" size={26} color={colors.inkMuted} />
              </View>
            )}
            <Text style={styles.logoLabel}>{logo ? "Trocar logo" : "Adicionar logo (opcional)"}</Text>
          </Pressable>

          <View style={styles.field}>
            <Text style={styles.label}>Nome da barbearia</Text>
            <TextInput
              value={nomeBarbearia}
              onChangeText={setNomeBarbearia}
              style={styles.input}
              placeholder="Ex: Barbearia Alameda"
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Seu nome (dono)</Text>
            <TextInput value={nomeDono} onChangeText={setNomeDono} style={styles.input} placeholder="Seu nome" />
          </View>
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
            <PasswordInput value={senha} onChangeText={setSenha} style={styles.input} placeholder="Mínimo 6 caracteres" />
          </View>

          <Text style={styles.label}>Plano</Text>
          <View style={{ gap: spacing.sm }}>
            {planos.map((plano) => {
              const selecionado = plano.id === planoId;
              return (
                <Pressable key={plano.id} onPress={() => setPlanoId(plano.id)}>
                  <Card style={[styles.planoCard, selecionado && styles.planoCardSelecionado]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.planoNome}>{plano.nome}</Text>
                      <Text style={styles.planoPreco}>{centavosParaReais(plano.precoCentavos)}/mês</Text>
                    </View>
                    <Ionicons
                      name={selecionado ? "checkmark-circle" : "ellipse-outline"}
                      size={22}
                      color={selecionado ? colors.accent : colors.inkMuted}
                    />
                  </Card>
                </Pressable>
              );
            })}
          </View>

          {erro && <Text style={styles.erro}>{erro}</Text>}

          <Button label="Criar conta da barbearia" onPress={handleRegistrar} loading={carregando} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, padding: spacing.xl, gap: spacing.md },
  title: { fontSize: 26, fontWeight: "800", color: colors.ink },
  subtitle: { fontSize: 13, color: colors.inkMuted, marginBottom: spacing.sm },
  logoPicker: { alignItems: "center", gap: spacing.xs, marginBottom: spacing.sm },
  logoPreview: { width: 84, height: 84, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  logoPlaceholder: {
    width: 84,
    height: 84,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  logoLabel: { fontSize: 12, fontWeight: "600", color: colors.accent },
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
  planoCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  planoCardSelecionado: { borderColor: colors.accent, borderWidth: 1.5, backgroundColor: colors.accentSoft },
  planoNome: { fontSize: 14, fontWeight: "700", color: colors.ink },
  planoPreco: { fontSize: 12, color: colors.inkMuted, marginTop: 2 },
  erro: { color: colors.danger, fontSize: 13 },
});
