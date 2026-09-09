import React, { useMemo } from "react";
import { Linking, Platform, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { BarbeariaProxima } from "@barbearia-saas/shared";
import { colors } from "../../theme/tokens";
import { HomeStackParamList } from "../../navigation/HomeStack";

type Props = NativeStackScreenProps<HomeStackParamList, "Map">;

// Mensagens que o mapa (JS rodando dentro da WebView, ver montarHtml) manda
// de volta pro React Native quando o cliente toca num pin.
type MensagemDoMapa = { tipo: "detalhe"; id: string; nome: string } | { tipo: "rota"; id: string };

// Abre o app de navegação do celular na localização da barbearia. No Android,
// o esquema "geo:" deixa o próprio sistema abrir o seletor entre todos os
// apps de mapa instalados (Google Maps, Waze etc.) quando há mais de um — é
// o que o cliente pediu ("escolher abrir no Google Maps, Waze ou qualquer
// outro"). No iOS não existe um seletor do sistema; abre no Mapas da Apple
// (ou no app padrão de navegação, se o cliente tiver configurado um a partir
// do iOS 17.4).
function abrirNoMapa(barbearia: Pick<BarbeariaProxima, "nome" | "latitude" | "longitude">) {
  if (barbearia.latitude == null || barbearia.longitude == null) return;
  const label = encodeURIComponent(barbearia.nome);
  const url =
    Platform.OS === "ios"
      ? `maps:0,0?q=${label}@${barbearia.latitude},${barbearia.longitude}`
      : `geo:${barbearia.latitude},${barbearia.longitude}?q=${barbearia.latitude},${barbearia.longitude}(${label})`;
  Linking.openURL(url).catch(() => {
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${barbearia.latitude},${barbearia.longitude}`);
  });
}

// Mapa com OpenStreetMap (via Leaflet, carregado numa WebView) — não depende
// de conta nem chave de API do Google, ao contrário do react-native-maps no
// Android.
function montarHtml(barbearias: BarbeariaProxima[], minhaLat: number, minhaLng: number): string {
  const pins = barbearias
    .filter((b) => b.latitude != null && b.longitude != null)
    .map((b) => ({ id: b.id, nome: b.nome, lat: b.latitude, lng: b.longitude, nota: b.notaMedia }));

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html, body, #mapa { height: 100%; margin: 0; padding: 0; }
  .leaflet-popup-content { font-family: -apple-system, Roboto, sans-serif; }
  .popup-titulo { font-weight: 700; margin-bottom: 4px; }
  .popup-acoes a { color: #b8862f; font-weight: 600; text-decoration: none; }
</style>
</head>
<body>
<div id="mapa"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var pins = ${JSON.stringify(pins)};
  var mapa = L.map('mapa').setView([${minhaLat}, ${minhaLng}], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(mapa);

  var iconeCliente = L.divIcon({
    className: '',
    html: '<div style="width:16px;height:16px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 0 4px rgba(0,0,0,0.5);"></div>',
    iconSize: [16, 16],
  });
  L.marker([${minhaLat}, ${minhaLng}], { icon: iconeCliente }).addTo(mapa).bindPopup('Você está aqui');

  function enviar(msg) {
    window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  }

  pins.forEach(function (b) {
    var marcador = L.marker([b.lat, b.lng]).addTo(mapa);
    var nota = b.nota > 0 ? ('★ ' + b.nota.toFixed(1)) : 'Ainda sem avaliações';
    var conteudo = document.createElement('div');
    conteudo.innerHTML =
      '<div class="popup-titulo">' + b.nome + '</div>' +
      '<div>' + nota + '</div>' +
      '<div class="popup-acoes" style="margin-top:6px;display:flex;gap:10px;">' +
      '<a id="detalhe-' + b.id + '">Ver detalhes</a>' +
      '<a id="rota-' + b.id + '">Como chegar</a>' +
      '</div>';
    marcador.bindPopup(conteudo);
    marcador.on('popupopen', function () {
      var elDetalhe = document.getElementById('detalhe-' + b.id);
      var elRota = document.getElementById('rota-' + b.id);
      if (elDetalhe) elDetalhe.onclick = function () { enviar({ tipo: 'detalhe', id: b.id, nome: b.nome }); };
      if (elRota) elRota.onclick = function () { enviar({ tipo: 'rota', id: b.id }); };
    });
  });
</script>
</body>
</html>`;
}

export function MapScreen({ route, navigation }: Props) {
  const { barbearias, minhaLat, minhaLng } = route.params;
  const html = useMemo(() => montarHtml(barbearias, minhaLat, minhaLng), [barbearias, minhaLat, minhaLng]);

  function receberMensagem(evento: WebViewMessageEvent) {
    let msg: MensagemDoMapa;
    try {
      msg = JSON.parse(evento.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.tipo === "detalhe") {
      navigation.navigate("BarbeariaDetail", { barbeariaId: msg.id, nome: msg.nome });
      return;
    }
    if (msg.tipo === "rota") {
      const barbearia = barbearias.find((b) => b.id === msg.id);
      if (barbearia) abrirNoMapa(barbearia);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <WebView
        source={{ html }}
        originWhitelist={["*"]}
        style={styles.webview}
        onMessage={receberMensagem}
        javaScriptEnabled
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  webview: { flex: 1, backgroundColor: colors.background },
});
