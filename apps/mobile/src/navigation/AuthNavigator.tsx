import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { LoginScreen } from "../screens/auth/LoginScreen";
import { RegistrarClienteScreen } from "../screens/auth/RegistrarClienteScreen";

export type AuthStackParamList = {
  Login: undefined;
  RegistrarCliente: undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

// Pilha exibida enquanto ninguém está logado (ver RootNavigator).
export function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="RegistrarCliente" component={RegistrarClienteScreen} options={{ headerShown: true, title: "Criar conta" }} />
    </Stack.Navigator>
  );
}
