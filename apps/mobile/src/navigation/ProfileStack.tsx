import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ProfileScreen } from "../screens/cliente/ProfileScreen";
import { MeusPacotesScreen } from "../screens/cliente/MeusPacotesScreen";
import { darkStackScreenOptions } from "./stackHeaderOptions";

export type ProfileStackParamList = {
  Perfil: undefined;
  // Assinaturas de pacote mensal do cliente (ver PacotesMensaisService).
  MeusPacotes: undefined;
};

const Stack = createNativeStackNavigator<ProfileStackParamList>();

export function ProfileStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ ...darkStackScreenOptions, headerShown: false }}>
      <Stack.Screen name="Perfil" component={ProfileScreen} />
      <Stack.Screen name="MeusPacotes" component={MeusPacotesScreen} options={{ headerShown: true, title: "Meus pacotes" }} />
    </Stack.Navigator>
  );
}
