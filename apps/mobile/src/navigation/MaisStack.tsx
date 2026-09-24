import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { MaisScreen } from "../screens/barbearia/MaisScreen";
import { ServicosScreen } from "../screens/barbearia/ServicosScreen";
import { PacotesScreen } from "../screens/barbearia/PacotesScreen";
import { PacotesMensaisScreen } from "../screens/barbearia/PacotesMensaisScreen";
import { EquipeScreen } from "../screens/barbearia/EquipeScreen";
import { FuncionarioHorariosScreen } from "../screens/barbearia/FuncionarioHorariosScreen";
import { AssinaturaScreen } from "../screens/barbearia/AssinaturaScreen";
import { LocalizacaoScreen } from "../screens/barbearia/LocalizacaoScreen";
import { LogoScreen } from "../screens/barbearia/LogoScreen";
import { ConectarMercadoPagoScreen } from "../screens/barbearia/ConectarMercadoPagoScreen";
import { darkStackScreenOptions } from "./stackHeaderOptions";

export type MaisStackParamList = {
  Mais: undefined;
  Servicos: undefined;
  Pacotes: undefined;
  PacotesMensais: undefined;
  Equipe: undefined;
  // Edição pelo dono da barbearia dos horários/folgas de um funcionário
  // específico da equipe (ver FuncionarioHorariosScreen).
  FuncionarioHorarios: { funcionarioId: string; nome: string };
  Assinatura: undefined;
  Localizacao: undefined;
  Logo: undefined;
  MercadoPago: undefined;
};

const Stack = createNativeStackNavigator<MaisStackParamList>();

export function MaisStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ ...darkStackScreenOptions, headerShown: false }}>
      <Stack.Screen name="Mais" component={MaisScreen} />
      <Stack.Screen name="Servicos" component={ServicosScreen} options={{ headerShown: true, title: "Serviços" }} />
      <Stack.Screen name="Pacotes" component={PacotesScreen} options={{ headerShown: true, title: "Pacotes" }} />
      <Stack.Screen
        name="PacotesMensais"
        component={PacotesMensaisScreen}
        options={{ headerShown: true, title: "Pacotes mensais" }}
      />
      <Stack.Screen name="Equipe" component={EquipeScreen} options={{ headerShown: true, title: "Equipe" }} />
      <Stack.Screen
        name="FuncionarioHorarios"
        component={FuncionarioHorariosScreen}
        options={{ headerShown: true, title: "Horários" }}
      />
      <Stack.Screen name="Assinatura" component={AssinaturaScreen} options={{ headerShown: true, title: "Assinatura" }} />
      <Stack.Screen name="Localizacao" component={LocalizacaoScreen} options={{ headerShown: true, title: "Localização" }} />
      <Stack.Screen name="Logo" component={LogoScreen} options={{ headerShown: true, title: "Logo da barbearia" }} />
      <Stack.Screen name="MercadoPago" component={ConectarMercadoPagoScreen} options={{ headerShown: true, title: "Mercado Pago" }} />
    </Stack.Navigator>
  );
}
