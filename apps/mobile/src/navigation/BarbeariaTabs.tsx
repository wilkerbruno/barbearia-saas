import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { BarbeariaDashboardScreen } from "../screens/barbearia/DashboardScreen";
import { BarbeariaAgendaScreen } from "../screens/barbearia/AgendaScreen";
import { BarbeariaFinanceiroScreen } from "../screens/barbearia/FinanceiroScreen";
import { MaisStackNavigator } from "./MaisStack";
import { colors } from "../theme/tokens";

const Tab = createBottomTabNavigator();

// Navegação do papel BARBEARIA_ADMIN (dono): Início, Agenda, Financeiro e Mais
// (Mais reúne Serviços/Pacotes, Equipe e Assinatura do plano).
export function BarbeariaTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.inkMuted,
      }}
    >
      <Tab.Screen name="Início" component={BarbeariaDashboardScreen} />
      <Tab.Screen name="Agenda" component={BarbeariaAgendaScreen} />
      <Tab.Screen name="Financeiro" component={BarbeariaFinanceiroScreen} />
      <Tab.Screen name="Mais" component={MaisStackNavigator} />
    </Tab.Navigator>
  );
}
