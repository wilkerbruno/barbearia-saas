import React, { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Asset } from "expo-asset";
import * as Sharing from "expo-sharing";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { alertar } from "../../utils/alertaCompat";
import { colors, spacing } from "../../theme/tokens";

// Imagem estática (não desenhada na hora): o conteúdo é sempre o mesmo —
// aponta pra barberone.store — já que a plataforma ainda não tem uma página
// de agendamento própria por barbearia (o cliente baixa o app e procura a
// barbearia de lá). Se um dia existir um link direto por barbearia, esse QR
// Code passa a ser gerado dinamicamente com o id da barbearia em vez de usar
// esse arquivo fixo em assets/.
const QRCODE_ASSET = require("../../../assets/qrcode-agendamento.png");

// Cartaz com QR Code pra imprimir e deixar na barbearia (balcão, vitrine,
// etc) — "Mais" > "QR Code para imprimir" (ver MaisScreen/MaisStack).
export function QrCodeScreen() {
  const [compartilhando, setCompartilhando] = useState(false);

  // Usa expo-asset (Asset.fromModule + downloadAsync) em vez de
  // Image.resolveAssetSource direto: no Android, o caminho "cru" de um
  // asset embutido no pacote (android_asset) não é acessível por outros
  // apps — downloadAsync copia o arquivo pra uma pasta que o app consegue
  // compartilhar de verdade via Sharing.shareAsync (mesmo padrão recomendado
  // na documentação do Expo pra compartilhar um asset local).
  async function compartilhar() {
    setCompartilhando(true);
    try {
      const disponivel = await Sharing.isAvailableAsync();
      if (!disponivel) {
        alertar("Não disponível", "Esse aparelho não consegue compartilhar ou salvar arquivos.");
        return;
      }
      const asset = Asset.fromModule(QRCODE_ASSET);
      await asset.downloadAsync();
      const uri = asset.localUri ?? asset.uri;
      await Sharing.shareAsync(uri, {
        dialogTitle: "Salvar ou imprimir QR Code",
        mimeType: "image/png",
        UTI: "public.png",
      });
    } catch {
      alertar("Não foi possível compartilhar", "Tente novamente em instantes.");
    } finally {
      setCompartilhando(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.content}>
        <Text style={styles.hint}>
          Baixe ou compartilhe esse cartaz e deixe impresso no balcão — seus clientes escaneiam e caem direto no
          agendamento.
        </Text>
        <Card style={styles.cardImagem}>
          <Image source={QRCODE_ASSET} style={styles.imagem} resizeMode="contain" />
        </Card>
        <Button label="Baixar / compartilhar" onPress={compartilhar} loading={compartilhando} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, padding: spacing.xl, gap: spacing.lg, justifyContent: "center" },
  hint: { fontSize: 13, color: colors.inkMuted, textAlign: "center", lineHeight: 18 },
  cardImagem: { padding: spacing.sm, alignItems: "center" },
  imagem: { width: "100%", aspectRatio: 1200 / 1600, borderRadius: 12 },
});
