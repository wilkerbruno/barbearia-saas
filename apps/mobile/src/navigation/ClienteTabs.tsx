import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { HomeStackNavigator } from "./HomeStack";
import { BookingsScreen } from "../screens/cliente/BookingsScreen";
import { ProfileScreen } from "../screens/cliente/ProfileScreen";
import { colors } from "../theme/tokens";

const Tab = createBottomTabNavigator();

// Navegação do papel CLIENTE: Início (com o fluxo de agendamento embutido),
// Agendamentos e Perfil — mesma estrutura do app do cliente no protótipo de telas.
export function ClienteTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.inkMuted,
      }}
    >
      <Tab.Screen name="Início" component={HomeStackNavigator} />
      <Tab.Screen name="Agendamentos" component={BookingsScreen} />
      <Tab.Screen name="Perfil" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
