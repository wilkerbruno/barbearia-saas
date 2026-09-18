import React, { useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AgendamentoLoteCriado, BarbeariaPublica, centavosParaReais, identificarBandeiraLocal } from "@barbearia-saas/shared";
import { api } from "../../api/client";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { colors, radius, spacing } from "../../theme/tokens";
import { HomeStackParamList } from "../../navigation/HomeStack";

type Props = NativeStackScreenProps<HomeStackParamList, "Cartao">;

// Página mínima carregada numa WebView OCULTA (nunca aparece na tela) só pra
// rodar o script antifraude do próprio Mercado Pago (security.js) — ele
// precisa de um DOM/`window` de verdade, que o React Native não tem
// nativamente, daí a WebView. Assim que o script preenche
// `window.MP_DEVICE_SESSION_ID`, manda esse valor de volta pro app via
// `postMessage` (ver onMessage abaixo) — é esse id que vai no header
// X-Meli-Session-Id da cobrança (ver MercadoPagoService.criarPagamentoCartao),
// ajudando o antifraude do MP a avaliar melhor o risco (ver histórico de
// recusas "high_risk"). Se o script não carregar/demorar demais (sem
// internet, bloqueio de rede etc.), manda uma mensagem vazia depois de um
// tempo — a coleta é só um extra, nunca pode travar o pagamento.
const HTML_DEVICE_ID = `
<!DOCTYPE html>
<html>
  <head><meta charset="utf-8" /></head>
  <body>
    <script src="https://www.mercadopago.com/v2/security.js" view="checkout"></script>
    <script>
      var tentativas = 0;
      var intervalo = setInterval(function () {
        tentativas++;
        if (window.MP_DEVICE_SESSION_ID) {
          clearInterval(intervalo);
          window.ReactNativeWebView.postMessage(window.MP_DEVICE_SESSION_ID);
        } else if (tentativas > 25) {
          clearInterval(intervalo);
          window.ReactNativeWebView.postMessage("");
        }
      }, 200);
    </script>
  </body>
</html>
`;

// Formulário nativo de cartão — o cliente digita os dados AQUI, dentro do
// app, e eles nunca chegam ao nosso servidor: primeiro tokenizamos direto
// com o Mercado Pago (usando a chave PÚBLICA da barbearia), e só o token de
// uso único gerado por eles é que vai pro nosso backend, que cobra na hora
// (ver AgendamentosService.criarLote/MercadoPagoService.criarPagamentoCartao).
// Isso é o que permite o cliente nunca ser levado a um navegador/checkout
// externo — só esse próprio formulário.
export function CartaoScreen({ route, navigation }: Props) {
  const { barbeariaId, inicio, itens, valorCentavos } = route.params;

  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [carregandoChave, setCarregandoChave] = useState(true);

  const [numero, setNumero] = useState("");
  const [validade, setValidade] = useState(""); // "MM/AA"
  const [cvv, setCvv] = useState("");
  const [nomeTitular, setNomeTitular] = useState("");
  const [cpf, setCpf] = useState("");
  const [enviando, setEnviando] = useState(false);

  // Id do aparelho coletado pela WebView oculta (ver HTML_DEVICE_ID acima) —
  // fica null até o script terminar (ou desistir); nesse meio tempo o
  // pagamento pode ser confirmado normalmente sem esperar por ele.
  const [deviceId, setDeviceId] = useState<string | null>(null);

  // Bandeira reconhecida AO VIVO, direto dos dígitos já digitados — sem
  // nenhuma chamada de rede (ver identificarBandeiraLocal no pacote
  // compartilhado). Existe pra duas coisas: o cliente confirmar visualmente
  // que digitou o cartão certo, e o time de dev conferir na hora que a
  // bandeira bate com o cartão de teste, sem precisar olhar log do servidor
  // (era esse o pedido depois do bug de "bandeira sempre aparecia master").
  const numeroLimpo = numero.replace(/\D/g, "");
  const bandeira = useMemo(() => identificarBandeiraLocal(numeroLimpo), [numeroLimpo]);

  useEffect(() => {
    api
      .get<BarbeariaPublica>(`/barbearias/${barbeariaId}/publico`)
      .then(({ data }) => setPublicKey(data.mercadoPagoPublicKey ?? null))
      .catch(() => setPublicKey(null))
      .finally(() => setCarregandoChave(false));
  }, [barbeariaId]);

  function validarCampos(): string | null {
    const numeroLimpo = numero.replace(/\s/g, "");
    if (numeroLimpo.length < 13 || numeroLimpo.length > 19) return "Número do cartão inválido.";
    const [mes, ano] = validade.split("/").map((p) => p.trim());
    if (!mes || !ano || mes.length !== 2 || ano.length !== 2) return "Validade inválida. Use o formato MM/AA.";
    const mesNum = Number(mes);
    if (Number.isNaN(mesNum) || mesNum < 1 || mesNum > 12) return "Mês de validade inválido.";
    if (cvv.length < 3 || cvv.length > 4) return "Código de segurança (CVV) inválido.";
    if (!nomeTitular.trim()) return "Informe o nome impresso no cartão.";
    if (cpf.replace(/\D/g, "").length !== 11) return "CPF inválido.";
    return null;
  }

  async function confirmar() {
    if (!publicKey) {
      Alert.alert(
        "Cartão indisponível",
        "Essa barbearia ainda não está pronta para receber pagamento com cartão. Tente pagar com Pix.",
      );
      return;
    }
    const erro = validarCampos();
    if (erro) {
      Alert.alert("Confira os dados do cartão", erro);
      return;
    }

    setEnviando(true);
    try {
      const numeroLimpo = numero.replace(/\s/g, "");
      const [mes, anoCurto] = validade.split("/").map((p) => p.trim());
      const anoCompleto = 2000 + Number(anoCurto);

      // Tokeniza direto com o Mercado Pago (chave pública) — o número do
      // cartão sai do aparelho só nessa chamada, direto pro Mercado Pago;
      // nosso servidor nunca vê esses dados, só o token abaixo.
      const respostaToken = await fetch(`https://api.mercadopago.com/v1/card_tokens?public_key=${publicKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          card_number: numeroLimpo,
          expiration_month: Number(mes),
          expiration_year: anoCompleto,
          security_code: cvv,
          cardholder: {
            name: nomeTitular.trim(),
            identification: { type: "CPF", number: cpf.replace(/\D/g, "") },
          },
        }),
      });
      const corpoToken: any = await respostaToken.json().catch(() => null);
      if (!respostaToken.ok || !corpoToken?.id) {
        Alert.alert(
          "Não foi possível validar o cartão",
          corpoToken?.message ?? corpoToken?.cause?.[0]?.description ?? "Confira os dados digitados e tente novamente.",
        );
        return;
      }

      const { data } = await api.post<AgendamentoLoteCriado>("/agendamentos/lote", {
        inicio,
        itens,
        metodoPagamento: "CARTAO",
        cartaoToken: corpoToken.id,
        cartaoBin: numeroLimpo.slice(0, 6),
        cartaoCpf: cpf.replace(/\D/g, ""),
        cartaoDeviceId: deviceId ?? undefined,
      });

      if (data.pagamento) {
        navigation.replace("Pagamento", { pagamento: data.pagamento, aviso: data.aviso });
      } else {
        // Caso raro: uma assinatura de pacote mensal cobria o horário e o
        // servidor usou a cota dela em vez de cobrar o cartão (ver
        // AgendamentosService.encontrarAssinaturaPacoteElegivel).
        Alert.alert("Agendamento confirmado!", "Reservado usando a cota do seu pacote mensal — o cartão não foi cobrado.");
        navigation.navigate("Home");
      }
    } catch (e: any) {
      Alert.alert("Pagamento não aprovado", e?.response?.data?.message ?? "Não foi possível concluir o pagamento. Tente outro cartão.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Invisível de propósito — só existe pra rodar o security.js do
          Mercado Pago em segundo plano (ver HTML_DEVICE_ID acima). */}
      <View style={styles.webviewOculta} pointerEvents="none">
        <WebView
          source={{ html: HTML_DEVICE_ID }}
          onMessage={(evento) => setDeviceId(evento.nativeEvent.data || null)}
          javaScriptEnabled
        />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={{ alignItems: "center", gap: spacing.xs }}>
          <Text style={styles.label}>Valor a pagar</Text>
          <Text style={styles.valor}>{centavosParaReais(valorCentavos)}</Text>
        </Card>

        <Text style={styles.sectionTitle}>Dados do cartão</Text>
        <Card style={{ gap: spacing.sm }}>
          <TextInput
            value={numero}
            onChangeText={(t) => setNumero(formatarNumeroCartao(t))}
            placeholder="Número do cartão"
            placeholderTextColor={colors.inkMuted}
            keyboardType="number-pad"
            maxLength={23}
            style={styles.input}
          />
          {numeroLimpo.length >= 6 && (
            <View style={[styles.badgeBandeira, { backgroundColor: bandeira ? corBandeira(bandeira.paymentMethodId) : colors.inkMuted }]}>
              <Text style={styles.badgeBandeiraTexto}>{bandeira ? bandeira.nome : "Bandeira não reconhecida"}</Text>
            </View>
          )}
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <TextInput
              value={validade}
              onChangeText={(t) => setValidade(formatarValidade(t))}
              placeholder="MM/AA"
              placeholderTextColor={colors.inkMuted}
              keyboardType="number-pad"
              maxLength={5}
              style={[styles.input, { flex: 1 }]}
            />
            <TextInput
              value={cvv}
              onChangeText={(t) => setCvv(t.replace(/\D/g, "").slice(0, 4))}
              placeholder="CVV"
              placeholderTextColor={colors.inkMuted}
              keyboardType="number-pad"
              maxLength={4}
              secureTextEntry
              style={[styles.input, { flex: 1 }]}
            />
          </View>
          <TextInput
            value={nomeTitular}
            onChangeText={setNomeTitular}
            placeholder="Nome impresso no cartão"
            placeholderTextColor={colors.inkMuted}
            autoCapitalize="characters"
            style={styles.input}
          />
          <TextInput
            value={cpf}
            onChangeText={(t) => setCpf(formatarCpf(t))}
            placeholder="CPF do titular"
            placeholderTextColor={colors.inkMuted}
            keyboardType="number-pad"
            maxLength={14}
            style={styles.input}
          />
        </Card>

        <Text style={styles.hint}>
          Pagamento processado com segurança pelo Mercado Pago — seus dados de cartão não passam pelos nossos servidores.
        </Text>

        <Button
          label={carregandoChave ? "Carregando…" : "Pagar agora"}
          onPress={confirmar}
          loading={enviando}
          disabled={carregandoChave || !publicKey}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

// Cor de referência de cada bandeira só pro selo visual (não são os logos
// oficiais — evitamos embutir marca registrada de terceiros; o texto já
// deixa claro qual bandeira foi identificada, que é o que importa pra
// conferir visualmente sem log).
function corBandeira(paymentMethodId: string): string {
  switch (paymentMethodId) {
    case "visa":
      return "#1A1F71";
    case "master":
      return "#EB5D24";
    case "elo":
      return "#000000";
    case "amex":
      return "#2E77BB";
    case "hipercard":
      return "#B10000";
    case "diners":
      return "#0079BE";
    default:
      return colors.inkMuted;
  }
}

function formatarNumeroCartao(valor: string): string {
  const digitos = valor.replace(/\D/g, "").slice(0, 19);
  return digitos.replace(/(\d{4})(?=\d)/g, "$1 ");
}

function formatarValidade(valor: string): string {
  const digitos = valor.replace(/\D/g, "").slice(0, 4);
  if (digitos.length <= 2) return digitos;
  return `${digitos.slice(0, 2)}/${digitos.slice(2)}`;
}

function formatarCpf(valor: string): string {
  const digitos = valor.replace(/\D/g, "").slice(0, 11);
  return digitos
    .replace(/(\d{3})(?=\d)/, "$1.")
    .replace(/(\d{3})\.(\d{3})(?=\d)/, "$1.$2.")
    .replace(/(\d{3})\.(\d{3})\.(\d{3})(?=\d)/, "$1.$2.$3-");
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  webviewOculta: { position: "absolute", width: 1, height: 1, opacity: 0 },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxl },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: colors.inkMuted, textTransform: "uppercase", marginTop: spacing.md },
  label: { fontSize: 12, color: colors.inkMuted },
  valor: { fontSize: 28, fontWeight: "800", color: colors.ink },
  hint: { fontSize: 11, color: colors.inkMuted, lineHeight: 16 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: colors.ink,
  },
  badgeBandeira: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  badgeBandeiraTexto: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
});
