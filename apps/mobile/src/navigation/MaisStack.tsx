import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { MaisScreen } from "../screens/barbearia/MaisScreen";
import { ServicosScreen } from "../screens/barbearia/ServicosScreen";
import { EquipeScreen } from "../screens/barbearia/EquipeScreen";
import { AssinaturaScreen } from "../screens/barbearia/AssinaturaScreen";

export type MaisStackParamList = {
  Mais: undefined;
  Servicos: undefined;
  Equipe: undefined;
  Assinatura: undefined;
};

const Stack = createNativeStackNavigator<MaisStackParamList>();

export function MaisStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Mais" component={MaisScreen} />
      <Stack.Screen name="Servicos" component={ServicosScreen} options={{ headerShown: true, title: "Serviços e pacotes" }} />
      <Stack.Screen name="Equipe" component={EquipeScreen} options={{ headerShown: true, title: "Equipe" }} />
      <Stack.Screen name="Assinatura" component={AssinaturaScreen} options={{ headerShown: true, title: "Assinatura" }} />
    </Stack.Navigator>
  );
}
