import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { BarbeariaDashboardScreen } from "../screens/barbearia/DashboardScreen";
import { BarbeariaAgendaScreen } from "../screens/barbearia/AgendaScreen";
import { BarbeariaFinanceiroScreen } from "../screens/barbearia/FinanceiroScreen";
import { MaisStackNavigator } from "./MaisStack";
import { tabBarScreenOptions } from "./tabBarOptions";

const Tab = createBottomTabNavigator();

// Navegação do papel BARBEARIA_ADMIN (dono): Início, Agenda, Financeiro e Mais
// (Mais reúne Serviços/Pacotes, Equipe, Localização e Assinatura do plano).
export function BarbeariaTabs() {
  return (
    <Tab.Navigator screenOptions={tabBarScreenOptions}>
      <Tab.Screen
        name="Início"
        component={BarbeariaDashboardScreen}
        options={{ tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? "home" : "home-outline"} size={size} color={color} /> }}
      />
      <Tab.Screen
        name="Agenda"
        component={BarbeariaAgendaScreen}
        options={{ tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? "calendar" : "calendar-outline"} size={size} color={color} /> }}
      />
      <Tab.Screen
        name="Financeiro"
        component={BarbeariaFinanceiroScreen}
        options={{ tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? "cash" : "cash-outline"} size={size} color={color} /> }}
      />
      <Tab.Screen
        name="Mais"
        component={MaisStackNavigator}
        options={{ tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? "menu" : "menu-outline"} size={size} color={color} /> }}
      />
    </Tab.Navigator>
  );
}
