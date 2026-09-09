import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { BarbeariaProxima, ItemAgendamentoLote, Pagamento } from "@barbearia-saas/shared";
import { HomeScreen } from "../screens/cliente/HomeScreen";
import { MapScreen } from "../screens/cliente/MapScreen";
import { BarbeariaDetailScreen } from "../screens/cliente/BarbeariaDetailScreen";
import { BookingScreen } from "../screens/cliente/BookingScreen";
import { CartaoScreen } from "../screens/cliente/CartaoScreen";
import { PagamentoScreen } from "../screens/cliente/PagamentoScreen";
import { darkStackScreenOptions } from "./stackHeaderOptions";

// Um item pré-selecionado na tela da barbearia (serviço OU pacote) que chega
// pronto pra tela de Agendar, pulando direto pra escolha de dia/horário.
export type ItemPreSelecionado = { servicoId?: string } | { pacoteId?: string };

export type HomeStackParamList = {
  // Lista de barbearias perto do cliente (com busca por nome) — tela inicial.
  Home: undefined;
  // Mesmas barbearias da Home, num mapa — recebe a lista já carregada lá pra
  // não precisar pedir localização/buscar de novo.
  Map: { barbearias: BarbeariaProxima[]; minhaLat: number; minhaLng: number };
  // Detalhe de uma barbearia: serviços/pacotes pra agendar + avaliações.
  BarbeariaDetail: { barbeariaId: string; nome: string };
  Agendar: { barbeariaId: string; nome: string; itensPreSelecionados?: ItemPreSelecionado[] };
  // Formulário nativo de cartão — só entra aqui quando o cliente escolhe
  // "Cartão" em Agendar; tokeniza e cobra na hora (ver CartaoScreen), sem
  // sair do app. Pix e "usar pacote mensal" vão direto pra Pagamento.
  Cartao: { barbeariaId: string; inicio: string; itens: ItemAgendamentoLote[]; valorCentavos: number };
  // Cobrança (Pix/Cartão) gerada ao confirmar o agendamento — ver
  // AgendamentosService.criarLote/AgendamentoLoteCriado.
  Pagamento: { pagamento: Pagamento; aviso: string };
};

const Stack = createNativeStackNavigator<HomeStackParamList>();

// Pilha da aba "Início": lista (ou mapa) de barbearias → detalhe (serviços +
// avaliações) → agendamento, mantendo a barra de abas escondida durante o fluxo.
export function HomeStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ ...darkStackScreenOptions, headerShown: false }}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="Map" component={MapScreen} options={{ headerShown: true, title: "Mapa" }} />
      <Stack.Screen
        name="BarbeariaDetail"
        component={BarbeariaDetailScreen}
        options={({ route }) => ({ headerShown: true, title: route.params.nome })}
      />
      <Stack.Screen name="Agendar" component={BookingScreen} options={{ headerShown: true, title: "Agendar horário" }} />
      <Stack.Screen
        name="Cartao"
        component={CartaoScreen}
        options={{ headerShown: true, title: "Pagar com cartão", gestureEnabled: false }}
      />
      <Stack.Screen
        name="Pagamento"
        component={PagamentoScreen}
        options={{ headerShown: true, title: "Pagamento", gestureEnabled: false }}
      />
    </Stack.Navigator>
  );
}
