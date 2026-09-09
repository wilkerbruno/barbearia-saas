import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Calendar } from "react-native-calendars";
import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  AgendamentoLoteCriado,
  AssinaturaPacoteCliente,
  AVISO_NAO_COMPARECIMENTO,
  centavosParaReais,
  MetodoPagamento,
  Pacote,
  Servico,
  StatusAssinaturaPacote,
} from "@barbearia-saas/shared";
import { api } from "../../api/client";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { colors, radius, spacing } from "../../theme/tokens";
import { HomeStackParamList } from "../../navigation/HomeStack";

type Props = NativeStackScreenProps<HomeStackParamList, "Agendar">;

const HOJE = new Date();
const HOJE_ISO = formatarDataLocal(HOJE);
const LIMITE_DIAS_FUTUROS = 60; // até quantos dias à frente dá pra agendar

// Fluxo de agendamento: 1) escolher um ou mais serviços (pode repetir o mesmo,
// ex: 2x corte pra pai e filho) → 2) escolher um dia no calendário → 3)
// escolher um horário livre (já considerando a duração total dos serviços
// escolhidos) → 4) conferir o resumo (duração e valor total) e confirmar.
// O profissional é escolhido automaticamente pelo servidor entre quem estiver
// livre naquele horário — simplifica o fluxo pro cliente.
// Duração de um pacote = soma da duração de cada serviço incluído nele,
// exatamente como o servidor calcula em resolverItem() — precisa bater com
// o back-end pra não pedir um horário que na verdade não cabe o pacote todo.
function duracaoDoPacote(pacote: Pacote): number {
  return pacote.servicos.reduce((total, ps) => total + ps.servico.duracaoMinutos, 0) || 30;
}

// "PACOTE" é uma opção a mais além dos métodos de pagamento avulso de
// verdade — quando escolhida, nenhum Pagamento é criado (ver criarLote no
// backend); é só a cota da assinatura mensal sendo usada.
type FormaPagamento = MetodoPagamento | "PACOTE";

export function BookingScreen({ route, navigation }: Props) {
  const { barbeariaId } = route.params;
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [pacotes, setPacotes] = useState<Pacote[]>([]);
  const [quantidades, setQuantidades] = useState<Record<string, number>>({});
  const [quantidadesPacotes, setQuantidadesPacotes] = useState<Record<string, number>>({});

  // Quando o cliente já escolheu os itens na Home, pulamos direto pra
  // escolha de dia/horário — a seleção só reaparece se ele tocar "Alterar itens".
  const temPreSelecao = !!route.params?.itensPreSelecionados?.length;
  const [mostrarSelecao, setMostrarSelecao] = useState(!temPreSelecao);

  const [mesVisivel, setMesVisivel] = useState({ ano: HOJE.getFullYear(), mes: HOJE.getMonth() + 1 });
  const [diasDisponiveis, setDiasDisponiveis] = useState<string[]>([]);
  const [carregandoDias, setCarregandoDias] = useState(false);
  const [diaSelecionado, setDiaSelecionado] = useState<string | undefined>();

  const [horarios, setHorarios] = useState<string[]>([]);
  const [carregandoHorarios, setCarregandoHorarios] = useState(false);
  const [horarioSelecionado, setHorarioSelecionado] = useState<string | undefined>();

  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento>(MetodoPagamento.PIX);
  const [enviando, setEnviando] = useState(false);

  // Assinaturas ATIVAS do cliente nessa barbearia — usadas pra oferecer "usar
  // meu pacote mensal" quando ela cobrir os serviços/dia/cota escolhidos (a
  // conferência de verdade é sempre no servidor, isso aqui só decide se
  // mostra a opção).
  const [assinaturasAtivas, setAssinaturasAtivas] = useState<AssinaturaPacoteCliente[]>([]);
  useEffect(() => {
    api
      .get<AssinaturaPacoteCliente[]>("/pacotes-mensais/minhas-assinaturas")
      .then(({ data }) =>
        setAssinaturasAtivas(data.filter((a) => a.barbeariaId === barbeariaId && a.status === StatusAssinaturaPacote.ATIVA)),
      )
      .catch(() => setAssinaturasAtivas([]));
  }, [barbeariaId]);

  // Carrega o catálogo de serviços e pacotes e já marca o que veio por
  // parâmetro (quando o cliente escolheu tudo direto na Home).
  useEffect(() => {
    Promise.all([
      api.get<Servico[]>(`/barbearias/${barbeariaId}/servicos`),
      api.get<Pacote[]>(`/barbearias/${barbeariaId}/pacotes`),
    ]).then(([servicosRes, pacotesRes]) => {
      setServicos(servicosRes.data);
      setPacotes(pacotesRes.data);

      const itens = route.params?.itensPreSelecionados;
      if (itens?.length) {
        const novasQuantidades: Record<string, number> = {};
        const novasQuantidadesPacotes: Record<string, number> = {};
        for (const item of itens) {
          if ("servicoId" in item && item.servicoId) {
            novasQuantidades[item.servicoId] = (novasQuantidades[item.servicoId] ?? 0) + 1;
          } else if ("pacoteId" in item && item.pacoteId) {
            novasQuantidadesPacotes[item.pacoteId] = (novasQuantidadesPacotes[item.pacoteId] ?? 0) + 1;
          }
        }
        setQuantidades(novasQuantidades);
        setQuantidadesPacotes(novasQuantidadesPacotes);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barbeariaId]);

  const itensSelecionados = useMemo(() => {
    const doServicos = servicos
      .filter((s) => (quantidades[s.id] ?? 0) > 0)
      .map((s) => ({
        tipo: "servico" as const,
        id: s.id,
        nome: s.nome,
        duracaoMinutos: s.duracaoMinutos,
        precoCentavos: s.precoCentavos,
        quantidade: quantidades[s.id],
      }));
    const doPacotes = pacotes
      .filter((p) => (quantidadesPacotes[p.id] ?? 0) > 0)
      .map((p) => ({
        tipo: "pacote" as const,
        id: p.id,
        nome: p.nome,
        duracaoMinutos: duracaoDoPacote(p),
        precoCentavos: p.precoCentavos,
        quantidade: quantidadesPacotes[p.id],
      }));
    return [...doServicos, ...doPacotes];
  }, [servicos, pacotes, quantidades, quantidadesPacotes]);
  const totalItens = itensSelecionados.reduce((total, item) => total + item.quantidade, 0);
  const duracaoTotalMinutos = itensSelecionados.reduce((total, item) => total + item.duracaoMinutos * item.quantidade, 0);
  const precoTotalCentavos = itensSelecionados.reduce((total, item) => total + item.precoCentavos * item.quantidade, 0);

  // Existe uma assinatura de pacote mensal que cobre exatamente o que foi
  // escolhido? Só serviços avulsos contam (nada de Pacote-combo), todos
  // precisam estar incluídos no MESMO pacote, no dia da semana permitido e
  // com cota sobrando — o servidor confere tudo de novo antes de confirmar.
  const assinaturaElegivel = useMemo(() => {
    if (itensSelecionados.length === 0 || !diaSelecionado) return null;
    if (itensSelecionados.some((item) => item.tipo !== "servico")) return null;
    const diaSemana = new Date(`${diaSelecionado}T00:00:00`).getDay();
    const servicoIds = itensSelecionados.map((item) => item.id);
    return (
      assinaturasAtivas.find((assinatura) => {
        const pacote = assinatura.pacoteMensal;
        if (!pacote) return false;
        const idsIncluidos = new Set(pacote.servicos.map((ps) => ps.servicoId));
        if (!servicoIds.every((id) => idsIncluidos.has(id))) return false;
        if (!pacote.diasSemanaPermitidos.includes(diaSemana)) return false;
        return (assinatura.usosNaSemana ?? 0) + totalItens <= pacote.vezesPorSemana;
      }) ?? null
    );
  }, [itensSelecionados, diaSelecionado, totalItens, assinaturasAtivas]);

  // Se a seleção mudou e o pacote deixou de cobrir, volta pro Pix (não deixa
  // a opção "Pacote mensal" marcada escondida sem aparecer mais na lista).
  useEffect(() => {
    if (formaPagamento === "PACOTE" && !assinaturaElegivel) setFormaPagamento(MetodoPagamento.PIX);
  }, [assinaturaElegivel, formaPagamento]);

  function alterarQuantidade(servicoId: string, delta: number) {
    setQuantidades((atual) => ({ ...atual, [servicoId]: Math.max(0, (atual[servicoId] ?? 0) + delta) }));
    // A duração total muda, então o dia/horário escolhidos antes podem não
    // caber mais — melhor pedir pra escolher de novo do que arriscar um
    // agendamento que estoura o horário de outro cliente.
    setDiaSelecionado(undefined);
    setHorarioSelecionado(undefined);
  }

  function alterarQuantidadePacote(pacoteId: string, delta: number) {
    setQuantidadesPacotes((atual) => ({ ...atual, [pacoteId]: Math.max(0, (atual[pacoteId] ?? 0) + delta) }));
    setDiaSelecionado(undefined);
    setHorarioSelecionado(undefined);
  }

  // Recarrega os dias disponíveis sempre que o mês visível ou a duração total mudam.
  useEffect(() => {
    if (duracaoTotalMinutos === 0) {
      setDiasDisponiveis([]);
      return;
    }
    let cancelado = false;
    setCarregandoDias(true);
    const mes = `${mesVisivel.ano}-${String(mesVisivel.mes).padStart(2, "0")}`;
    api
      .get<string[]>(`/barbearias/${barbeariaId}/dias-disponiveis`, { params: { mes, duracaoMinutos: duracaoTotalMinutos } })
      .then(({ data }) => !cancelado && setDiasDisponiveis(data))
      .finally(() => !cancelado && setCarregandoDias(false));
    return () => {
      cancelado = true;
    };
  }, [barbeariaId, mesVisivel, duracaoTotalMinutos]);

  // Recarrega os horários sempre que o dia escolhido ou a duração total mudam.
  useEffect(() => {
    if (!diaSelecionado || duracaoTotalMinutos === 0) {
      setHorarios([]);
      return;
    }
    let cancelado = false;
    setCarregandoHorarios(true);
    setHorarioSelecionado(undefined);
    api
      .get<string[]>(`/barbearias/${barbeariaId}/horarios-disponiveis`, {
        params: { data: diaSelecionado, duracaoMinutos: duracaoTotalMinutos },
      })
      .then(({ data }) => !cancelado && setHorarios(data))
      .finally(() => !cancelado && setCarregandoHorarios(false));
    return () => {
      cancelado = true;
    };
  }, [barbeariaId, diaSelecionado, duracaoTotalMinutos]);

  const markedDates = useMemo(() => {
    const marcado: Record<string, any> = {};
    if (!carregandoDias && duracaoTotalMinutos > 0) {
      for (const dia of diasDoMes(mesVisivel.ano, mesVisivel.mes)) {
        if (dia < HOJE_ISO) continue; // dias passados: o minDate do calendário já cuida de não deixar navegar
        marcado[dia] = diasDisponiveis.includes(dia)
          ? { marked: true, dotColor: colors.accent }
          : { disabled: true, disableTouchEvent: true };
      }
    }
    if (diaSelecionado) {
      marcado[diaSelecionado] = {
        ...(marcado[diaSelecionado] ?? {}),
        selected: true,
        selectedColor: colors.accent,
        selectedTextColor: colors.accentInk,
      };
    }
    return marcado;
  }, [diasDisponiveis, diaSelecionado, mesVisivel, carregandoDias, duracaoTotalMinutos]);

  async function confirmar() {
    if (!diaSelecionado || !horarioSelecionado || itensSelecionados.length === 0) return;
    // Offset fixo do horário de Brasília: evita depender do fuso configurado
    // no aparelho do cliente pra não agendar num horário errado.
    const inicio = `${diaSelecionado}T${horarioSelecionado}:00-03:00`;
    const itens = itensSelecionados.flatMap((item) =>
      Array.from({ length: item.quantidade }, () =>
        item.tipo === "servico" ? { servicoId: item.id } : { pacoteId: item.id },
      ),
    );

    // Cartão nunca cria o agendamento direto por aqui — primeiro precisa do
    // formulário nativo (tokeniza e cobra na hora, sem sair do app); é a
    // CartaoScreen quem chama POST /agendamentos/lote depois de tokenizar.
    if (formaPagamento === MetodoPagamento.CARTAO) {
      navigation.navigate("Cartao", { barbeariaId, inicio, itens, valorCentavos: precoTotalCentavos });
      return;
    }

    setEnviando(true);
    try {
      const usandoPacote = formaPagamento === "PACOTE" && assinaturaElegivel;
      const { data } = await api.post<AgendamentoLoteCriado>("/agendamentos/lote", {
        inicio,
        itens,
        metodoPagamento: usandoPacote ? undefined : (formaPagamento as MetodoPagamento),
        usarAssinaturaPacoteId: usandoPacote ? assinaturaElegivel.id : undefined,
      });
      if (data.pagamento) {
        navigation.replace("Pagamento", { pagamento: data.pagamento, aviso: data.aviso });
      } else {
        Alert.alert("Agendamento confirmado!", "Reservado usando a cota do seu pacote mensal.");
        navigation.navigate("Home");
      }
    } catch (e: any) {
      Alert.alert("Não foi possível agendar", e?.response?.data?.message ?? "Tente outro horário.");
    } finally {
      setEnviando(false);
    }
  }

  const dataHoraSelecionada = diaSelecionado && horarioSelecionado ? `${diaSelecionado}T${horarioSelecionado}:00-03:00` : undefined;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {mostrarSelecao ? (
          <>
            <Text style={styles.sectionTitle}>Serviços</Text>
            <View style={{ gap: spacing.sm }}>
              {servicos.map((s) => {
                const quantidade = quantidades[s.id] ?? 0;
                return (
                  <Card key={s.id} style={styles.servicoLinha}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemNome}>{s.nome}</Text>
                      <Text style={styles.itemMeta}>
                        {s.duracaoMinutos} min · {centavosParaReais(s.precoCentavos)}
                      </Text>
                    </View>
                    <View style={styles.stepper}>
                      <Pressable onPress={() => alterarQuantidade(s.id, -1)} disabled={quantidade === 0} hitSlop={8}>
                        <Ionicons name="remove-circle" size={26} color={quantidade === 0 ? colors.border : colors.accent} />
                      </Pressable>
                      <Text style={styles.stepperValor}>{quantidade}</Text>
                      <Pressable onPress={() => alterarQuantidade(s.id, 1)} hitSlop={8}>
                        <Ionicons name="add-circle" size={26} color={colors.accent} />
                      </Pressable>
                    </View>
                  </Card>
                );
              })}
            </View>

            {pacotes.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Pacotes</Text>
                <View style={{ gap: spacing.sm }}>
                  {pacotes.map((p) => {
                    const quantidade = quantidadesPacotes[p.id] ?? 0;
                    return (
                      <Card key={p.id} style={styles.servicoLinha}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.itemNome}>{p.nome}</Text>
                          <Text style={styles.itemMeta}>
                            {duracaoDoPacote(p)} min · {centavosParaReais(p.precoCentavos)}
                          </Text>
                          {p.descricao && <Text style={styles.itemMeta}>{p.descricao}</Text>}
                        </View>
                        <View style={styles.stepper}>
                          <Pressable onPress={() => alterarQuantidadePacote(p.id, -1)} disabled={quantidade === 0} hitSlop={8}>
                            <Ionicons name="remove-circle" size={26} color={quantidade === 0 ? colors.border : colors.accent} />
                          </Pressable>
                          <Text style={styles.stepperValor}>{quantidade}</Text>
                          <Pressable onPress={() => alterarQuantidadePacote(p.id, 1)} hitSlop={8}>
                            <Ionicons name="add-circle" size={26} color={colors.accent} />
                          </Pressable>
                        </View>
                      </Card>
                    );
                  })}
                </View>
              </>
            )}
          </>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Itens selecionados</Text>
            <View style={{ gap: spacing.sm }}>
              {itensSelecionados.map((item) => (
                <Card key={`${item.tipo}-${item.id}`} style={styles.servicoLinha}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemNome}>
                      {item.quantidade}x {item.nome}
                    </Text>
                    <Text style={styles.itemMeta}>
                      {item.duracaoMinutos} min · {centavosParaReais(item.precoCentavos)}
                    </Text>
                  </View>
                </Card>
              ))}
            </View>
            <Pressable onPress={() => setMostrarSelecao(true)} hitSlop={8}>
              <Text style={styles.linkAlterar}>Alterar itens</Text>
            </Pressable>
          </>
        )}

        {totalItens > 0 && (
          <Card style={styles.resumoCard}>
            <Text style={styles.resumoTexto}>
              {totalItens} {totalItens === 1 ? "item" : "itens"} selecionado{totalItens === 1 ? "" : "s"} · ~
              {duracaoTotalMinutos} min
            </Text>
            <Text style={styles.resumoValor}>{centavosParaReais(precoTotalCentavos)}</Text>
          </Card>
        )}

        {totalItens > 0 && (
          <>
            <Text style={styles.sectionTitle}>Escolha o dia</Text>
            <View style={styles.calendarioWrapper}>
              <Calendar
                current={HOJE_ISO}
                minDate={HOJE_ISO}
                maxDate={formatarDataLocal(new Date(HOJE.getTime() + LIMITE_DIAS_FUTUROS * 86_400_000))}
                onMonthChange={(m: { year: number; month: number }) => setMesVisivel({ ano: m.year, mes: m.month })}
                onDayPress={(d: { dateString: string }) => diasDisponiveis.includes(d.dateString) && setDiaSelecionado(d.dateString)}
                markedDates={markedDates}
                disableAllTouchEventsForDisabledDays
                theme={calendarTheme}
              />
            </View>
            {carregandoDias && <Text style={styles.hint}>Verificando dias disponíveis…</Text>}
            {!carregandoDias && diasDisponiveis.length === 0 && (
              <Text style={styles.hint}>Nenhum dia disponível nesse mês para essa combinação de serviços.</Text>
            )}
          </>
        )}

        {diaSelecionado && (
          <>
            <Text style={styles.sectionTitle}>Horários disponíveis</Text>
            {carregandoHorarios ? (
              <Text style={styles.hint}>Carregando horários…</Text>
            ) : horarios.length === 0 ? (
              <Text style={styles.hint}>Nenhum horário livre nesse dia. Escolha outro dia.</Text>
            ) : (
              <View style={styles.horariosGrid}>
                {horarios.map((h) => {
                  const selecionado = h === horarioSelecionado;
                  return (
                    <Pressable key={h} onPress={() => setHorarioSelecionado(h)}>
                      <View style={[styles.horarioChip, selecionado && styles.horarioChipSelecionado]}>
                        <Text style={[styles.horarioTexto, selecionado && styles.horarioTextoSelecionado]}>{h}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </>
        )}

        {dataHoraSelecionada && (
          <>
            <Text style={styles.sectionTitle}>Confirmar</Text>
            <Card style={{ gap: spacing.sm }}>
              <View style={{ gap: 4 }}>
                {itensSelecionados.map((item) => (
                  <View key={`${item.tipo}-${item.id}`} style={styles.confirmLinha}>
                    <Text style={styles.confirmServico}>
                      {item.quantidade}x {item.nome}
                    </Text>
                    <Text style={styles.confirmServico}>{centavosParaReais(item.precoCentavos * item.quantidade)}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.divisor} />
              <Text style={styles.confirmData}>
                {new Date(dataHoraSelecionada).toLocaleDateString("pt-BR", {
                  weekday: "long",
                  day: "2-digit",
                  month: "long",
                })}{" "}
                às {horarioSelecionado}
              </Text>
              <View style={styles.confirmLinha}>
                <Text style={styles.confirmTotalLabel}>Total (~{duracaoTotalMinutos} min)</Text>
                <Text style={styles.confirmTotalValor}>{centavosParaReais(precoTotalCentavos)}</Text>
              </View>
            </Card>

            <Text style={styles.sectionTitle}>Forma de pagamento</Text>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              {(
                [
                  { valor: MetodoPagamento.PIX as FormaPagamento, label: "Pix" },
                  { valor: MetodoPagamento.CARTAO as FormaPagamento, label: "Cartão" },
                  ...(assinaturaElegivel ? [{ valor: "PACOTE" as FormaPagamento, label: "Pacote mensal" }] : []),
                ]
              ).map((opcao) => {
                const selecionado = formaPagamento === opcao.valor;
                return (
                  <Pressable key={opcao.valor} onPress={() => setFormaPagamento(opcao.valor)} style={{ flex: 1 }}>
                    <View style={[styles.horarioChip, styles.metodoChip, selecionado && styles.horarioChipSelecionado]}>
                      <Text style={[styles.horarioTexto, selecionado && styles.horarioTextoSelecionado]}>{opcao.label}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
            {formaPagamento === "PACOTE" && assinaturaElegivel && (
              <Text style={styles.hint}>
                Usa {totalItens} de {assinaturaElegivel.pacoteMensal!.vezesPorSemana - (assinaturaElegivel.usosNaSemana ?? 0)} usos
                restantes essa semana no seu pacote — sem cobrança avulsa.
              </Text>
            )}

            <Card style={styles.avisoCard}>
              <Text style={styles.avisoTexto}>
                {formaPagamento === "PACOTE"
                  ? "Política de cancelamento: em caso de não comparecimento ao horário agendado sem cancelamento prévio, a vaga ainda é contada como usada na sua cota semanal do pacote."
                  : AVISO_NAO_COMPARECIMENTO}
              </Text>
            </Card>

            <Button
              label={
                formaPagamento === "PACOTE"
                  ? "Confirmar agendamento"
                  : formaPagamento === MetodoPagamento.CARTAO
                    ? "Continuar para pagamento"
                    : "Confirmar e pagar"
              }
              onPress={confirmar}
              loading={enviando}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const calendarTheme = {
  backgroundColor: colors.background,
  calendarBackground: colors.surface,
  textSectionTitleColor: colors.inkMuted,
  selectedDayBackgroundColor: colors.accent,
  selectedDayTextColor: colors.accentInk,
  todayTextColor: colors.accent,
  dayTextColor: colors.ink,
  textDisabledColor: colors.border,
  dotColor: colors.accent,
  selectedDotColor: colors.accentInk,
  arrowColor: colors.accent,
  monthTextColor: colors.ink,
  indicatorColor: colors.accent,
  textDayFontWeight: "600" as const,
  textMonthFontWeight: "800" as const,
  textDayHeaderFontWeight: "700" as const,
};

function formatarDataLocal(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function diasDoMes(ano: number, mes: number): string[] {
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const dias: string[] = [];
  for (let dia = 1; dia <= ultimoDia; dia++) {
    dias.push(`${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`);
  }
  return dias;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxl },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.inkMuted,
    textTransform: "uppercase",
    marginTop: spacing.md,
  },
  hint: { fontSize: 12, color: colors.inkMuted },
  linkAlterar: { fontSize: 13, fontWeight: "700", color: colors.accent, marginTop: -spacing.xs },
  servicoLinha: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  itemNome: { fontSize: 14, fontWeight: "700", color: colors.ink },
  itemMeta: { fontSize: 12, color: colors.inkMuted, marginTop: 2 },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  stepperValor: { fontSize: 15, fontWeight: "800", color: colors.ink, minWidth: 16, textAlign: "center" },
  resumoCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  resumoTexto: { fontSize: 13, fontWeight: "700", color: colors.accent, flex: 1, paddingRight: spacing.sm },
  resumoValor: { fontSize: 16, fontWeight: "800", color: colors.accent },
  calendarioWrapper: { borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  horariosGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  horarioChip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  horarioChipSelecionado: { backgroundColor: colors.accent, borderColor: colors.accent },
  horarioTexto: { fontSize: 13, fontWeight: "700", color: colors.ink },
  horarioTextoSelecionado: { color: colors.accentInk },
  metodoChip: { alignItems: "center" },
  avisoCard: { backgroundColor: colors.dangerSoft },
  avisoTexto: { fontSize: 11, color: colors.danger, lineHeight: 16 },
  confirmLinha: { flexDirection: "row", justifyContent: "space-between" },
  confirmServico: { fontSize: 13, color: colors.ink, fontWeight: "600" },
  divisor: { height: 1, backgroundColor: colors.border },
  confirmData: { fontSize: 13, color: colors.inkMuted, textTransform: "capitalize" },
  confirmTotalLabel: { fontSize: 14, fontWeight: "800", color: colors.ink },
  confirmTotalValor: { fontSize: 16, fontWeight: "800", color: colors.accent },
});
