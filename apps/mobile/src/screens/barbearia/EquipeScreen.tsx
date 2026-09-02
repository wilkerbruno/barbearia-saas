import React, { useCallback, useState } from "react";
import { Alert, FlatList, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { FuncionarioDetalhado } from "@barbearia-saas/shared";
import { api } from "../../api/client";
import { useAuthStore } from "../../store/authStore";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { colors, radius, spacing } from "../../theme/tokens";

const FUNCIONARIO_VAZIO = { nome: "", email: "", senha: "", cargo: "", comissaoPercentual: "60" };

interface Assinatura {
  plano: { nome: string; limiteFuncionarios: number | null };
}

// Gestão da equipe: o dono cadastra o login de cada funcionário (nome/e-mail/
// senha) — não existe autocadastro, é sempre um convite feito por aqui. Cada
// funcionário organiza a própria agenda (horário de trabalho e folgas) depois
// de logar (ver HorariosScreen no app do funcionário). A quantidade de
// funcionários ativos respeita o limite do plano contratado (ver garantirDentroDoLimiteDoPlano na API).
export function EquipeScreen() {
  const [funcionarios, setFuncionarios] = useState<FuncionarioDetalhado[]>([]);
  const [assinatura, setAssinatura] = useState<Assinatura | null>(null);
  const [formAberto, setFormAberto] = useState(false);
  const [campos, setCampos] = useState(FUNCIONARIO_VAZIO);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    const [funcionariosRes, assinaturaRes] = await Promise.all([
      api.get<FuncionarioDetalhado[]>("/funcionarios"),
      api.get<Assinatura>("/assinaturas/minha").catch(() => ({ data: null })),
    ]);
    setFuncionarios(funcionariosRes.data);
    setAssinatura(assinaturaRes.data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar]),
  );

  function abrirNovo() {
    setCampos(FUNCIONARIO_VAZIO);
    setFormAberto(true);
  }

  async function salvar() {
    const nome = campos.nome.trim();
    const email = campos.email.trim().toLowerCase();
    const senha = campos.senha;
    const comissaoPercentual = campos.comissaoPercentual ? parseInt(campos.comissaoPercentual, 10) : undefined;

    if (!nome) return Alert.alert("Falta o nome", "Digite o nome do funcionário.");
    if (!email.includes("@")) return Alert.alert("E-mail inválido", "Digite um e-mail válido.");
    if (senha.length < 6) return Alert.alert("Senha muito curta", "A senha precisa ter pelo menos 6 caracteres.");
    if (comissaoPercentual !== undefined && (!Number.isInteger(comissaoPercentual) || comissaoPercentual < 0 || comissaoPercentual > 100)) {
      return Alert.alert("Comissão inválida", "Digite um valor entre 0 e 100.");
    }

    const dto = { nome, email, senha, cargo: campos.cargo.trim() || undefined, comissaoPercentual };
    setSalvando(true);
    try {
      await api.post("/funcionarios", dto);
      setFormAberto(false);
      carregar();
    } catch (e: any) {
      Alert.alert("Não foi possível cadastrar", e?.response?.data?.message ?? "Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(funcionario: FuncionarioDetalhado) {
    try {
      await api.patch(`/funcionarios/${funcionario.id}`, { ativo: !funcionario.ativo });
      carregar();
    } catch (e: any) {
      Alert.alert("Não foi possível atualizar", e?.response?.data?.message ?? "Tente de novo.");
    }
  }

  const ativos = funcionarios.filter((f) => f.ativo).length;
  const limite = assinatura?.plano.limiteFuncionarios ?? null;
  const textoUso =
    limite == null ? `${ativos} funcionário${ativos === 1 ? "" : "s"} (plano ilimitado)` : `${ativos} de ${limite} funcionários do plano ${assinatura?.plano.nome ?? ""}`;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Equipe</Text>
          <Text style={styles.usage}>{textoUso}</Text>
        </View>
        {!formAberto && <Text style={styles.addButton} onPress={abrirNovo}>+ Novo</Text>}
      </View>

      <FlatList
        data={funcionarios}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          formAberto ? (
            <Card style={{ gap: spacing.sm, marginBottom: spacing.lg }}>
              <Text style={styles.formTitle}>Novo funcionário</Text>
              <Text style={styles.hint}>Ele vai usar esse e-mail e senha pra logar no app.</Text>
              <TextInput
                value={campos.nome}
                onChangeText={(nome) => setCampos((c) => ({ ...c, nome }))}
                placeholder="Nome"
                placeholderTextColor={colors.inkMuted}
                style={styles.input}
              />
              <TextInput
                value={campos.email}
                onChangeText={(email) => setCampos((c) => ({ ...c, email }))}
                placeholder="E-mail"
                placeholderTextColor={colors.inkMuted}
                autoCapitalize="none"
                keyboardType="email-address"
                style={styles.input}
              />
              <TextInput
                value={campos.senha}
                onChangeText={(senha) => setCampos((c) => ({ ...c, senha }))}
                placeholder="Senha (mínimo 6 caracteres)"
                placeholderTextColor={colors.inkMuted}
                secureTextEntry
                style={styles.input}
              />
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <TextInput
                  value={campos.cargo}
                  onChangeText={(cargo) => setCampos((c) => ({ ...c, cargo }))}
                  placeholder="Cargo (ex: Barbeiro)"
                  placeholderTextColor={colors.inkMuted}
                  style={[styles.input, { flex: 1 }]}
                />
                <TextInput
                  value={campos.comissaoPercentual}
                  onChangeText={(comissaoPercentual) => setCampos((c) => ({ ...c, comissaoPercentual }))}
                  placeholder="Comissão %"
                  placeholderTextColor={colors.inkMuted}
                  keyboardType="number-pad"
                  style={[styles.input, { flex: 1 }]}
                />
              </View>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Button label="Cancelar" variant="secondary" onPress={() => setFormAberto(false)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button label="Cadastrar" onPress={salvar} loading={salvando} />
                </View>
              </View>
            </Card>
          ) : null
        }
        ListEmptyComponent={
          !formAberto ? <Text style={styles.empty}>Nenhum funcionário cadastrado ainda. Toque em "+ Novo".</Text> : null
        }
        renderItem={({ item }) => (
          <Card style={{ marginBottom: spacing.sm, gap: spacing.xs, opacity: item.ativo ? 1 : 0.5 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <View style={{ flex: 1, paddingRight: spacing.sm }}>
                <Text style={styles.name}>{item.usuario.nome}</Text>
                <Text style={styles.meta}>{item.usuario.email}</Text>
                <Text style={styles.meta}>
                  {item.cargo} · {item.comissaoPercentual}% de comissão
                </Text>
                {!item.disponivel && <Text style={styles.meta}>Indisponível para novos agendamentos</Text>}
              </View>
            </View>
            <Text style={styles.acaoSecundaria} onPress={() => alternarAtivo(item)}>
              {item.ativo ? "Desativar" : "Ativar"}
            </Text>
          </Card>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  title: { fontSize: 20, fontWeight: "800", color: colors.ink },
  usage: { fontSize: 12, color: colors.inkMuted, marginTop: 2 },
  addButton: { color: colors.accent, fontWeight: "700" },
  list: { padding: spacing.xl },
  empty: { color: colors.inkMuted, fontSize: 13, textAlign: "center", marginTop: spacing.xxl },
  formTitle: { fontSize: 14, fontWeight: "800", color: colors.ink },
  hint: { fontSize: 12, color: colors.inkMuted },
  name: { fontWeight: "700", color: colors.ink, fontSize: 14 },
  meta: { fontSize: 12, color: colors.inkMuted, marginTop: 2 },
  acaoSecundaria: { color: colors.inkMuted, fontWeight: "700", fontSize: 12 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 13,
    color: colors.ink,
  },
});
