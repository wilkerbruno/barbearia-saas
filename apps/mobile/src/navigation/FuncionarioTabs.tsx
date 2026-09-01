import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { FuncionarioAgendaScreen } from "../screens/funcionario/AgendaScreen";
import { FuncionarioFinanceiroScreen } from "../screens/funcionario/FinanceiroScreen";
import { FuncionarioPerfilScreen } from "../screens/funcionario/PerfilScreen";
import { colors } from "../theme/tokens";

const Tab = createBottomTabNavigator();

// Navegação do papel FUNCIONARIO: Agenda, Financeiro e Perfil.
export function FuncionarioTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.inkMuted,
      }}
    >
      <Tab.Screen name="Agenda" component={FuncionarioAgendaScreen} />
      <Tab.Screen name="Financeiro" component={FuncionarioFinanceiroScreen} />
      <Tab.Screen name="Perfil" component={FuncionarioPerfilScreen} />
    </Tab.Navigator>
  );
}
