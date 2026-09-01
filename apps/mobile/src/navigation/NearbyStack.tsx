import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { NearbyScreen } from "../screens/cliente/NearbyScreen";
import { BarbeariaDetailScreen } from "../screens/cliente/BarbeariaDetailScreen";
import { darkStackScreenOptions } from "./stackHeaderOptions";

export type NearbyStackParamList = {
  Nearby: undefined;
  BarbeariaDetail: { barbeariaId: string; nome: string };
};

const Stack = createNativeStackNavigator<NearbyStackParamList>();

// Pilha da aba "Perto de você": lista de barbearias próximas (por GPS) que
// empilha o detalhe/avaliação de uma barbearia por cima.
export function NearbyStackNavigator() {
  return (
    <Stack.Navigator screenOptions={darkStackScreenOptions}>
      <Stack.Screen name="Nearby" component={NearbyScreen} options={{ title: "Perto de você" }} />
      <Stack.Screen
        name="BarbeariaDetail"
        component={BarbeariaDetailScreen}
        options={({ route }) => ({ title: route.params.nome })}
      />
    </Stack.Navigator>
  );
}
