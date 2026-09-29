import { Linking, Platform } from "react-native";

// Abre o app de navegação do celular na localização da barbearia. No Android,
// o esquema "geo:" deixa o próprio sistema abrir o seletor entre todos os
// apps de mapa instalados (Google Maps, Waze etc.) quando há mais de um. No
// iOS não existe um seletor do sistema; abre no Mapas da Apple (ou no app
// padrão de navegação, se o cliente tiver configurado um a partir do iOS
// 17.4). Extraído de MapScreen (tela de mapa da Home) pra ser reaproveitado
// em qualquer lugar que mostre uma barbearia com endereço (detalhe da
// barbearia, "meus agendamentos" etc).
export function abrirNoMapa(barbearia: { nome: string; latitude?: number | null; longitude?: number | null }): void {
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
