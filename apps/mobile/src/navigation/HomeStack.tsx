import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { HomeScreen } from "../screens/cliente/HomeScreen";
import { BookingScreen } from "../screens/cliente/BookingScreen";
import { darkStackScreenOptions } from "./stackHeaderOptions";

export type HomeStackParamList = {
  Home: undefined;
  Agendar: { servicoId?: string };
};

const Stack = createNativeStackNavigator<HomeStackParamList>();

// Pilha da aba "Início": a Home empilha a tela de agendamento por cima,
// mantendo a barra de abas escondida durante o fluxo (como no protótipo de telas).
export function HomeStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ ...darkStackScreenOptions, headerShown: false }}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="Agendar" component={BookingScreen} options={{ headerShown: true, title: "Agendar horário" }} />
    </Stack.Navigator>
  );
}
