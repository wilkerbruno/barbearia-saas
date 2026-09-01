import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { FuncionarioAgendaScreen } from "../screens/funcionario/AgendaScreen";
import { FuncionarioFinanceiroScreen } from "../screens/funcionario/FinanceiroScreen";
import { FuncionarioPerfilScreen } from "../screens/funcionario/PerfilScreen";
import { tabBarScreenOptions } from "./tabBarOptions";

const Tab = createBottomTabNavigator();

// Navegação do papel FUNCIONARIO: Agenda, Financeiro e Perfil.
export function FuncionarioTabs() {
  return (
    <Tab.Navigator screenOptions={tabBarScreenOptions}>
      <Tab.Screen
        name="Agenda"
        component={FuncionarioAgendaScreen}
        options={{ tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? "calendar" : "calendar-outline"} size={size} color={color} /> }}
      />
      <Tab.Screen
        name="Financeiro"
        component={FuncionarioFinanceiroScreen}
        options={{ tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? "cash" : "cash-outline"} size={size} color={color} /> }}
      />
      <Tab.Screen
        name="Perfil"
        component={FuncionarioPerfilScreen}
        options={{ tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? "person" : "person-outline"} size={size} color={color} /> }}
      />
    </Tab.Navigator>
  );
}
