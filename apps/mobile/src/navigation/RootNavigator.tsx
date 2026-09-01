import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { Papel } from "@barbearia-saas/shared";
import { useAuthStore } from "../store/authStore";
import { colors } from "../theme/tokens";
import { AuthNavigator } from "./AuthNavigator";
import { ClienteTabs } from "./ClienteTabs";
import { FuncionarioTabs } from "./FuncionarioTabs";
import { BarbeariaTabs } from "./BarbeariaTabs";

// Um único app React Native serve os três papéis operacionais (cliente,
// funcionário, dono da barbearia); o SAAS_ADMIN usa o painel web separado
// (apps/admin-web), então não tem uma stack mobile aqui.
export function RootNavigator() {
  const { usuario, carregando, restaurarSessao } = useAuthStore();

  useEffect(() => {
    restaurarSessao();
  }, [restaurarSessao]);

  if (carregando) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {!usuario && <AuthNavigator />}
      {usuario?.papel === Papel.CLIENTE && <ClienteTabs />}
      {usuario?.papel === Papel.FUNCIONARIO && <FuncionarioTabs />}
      {usuario?.papel === Papel.BARBEARIA_ADMIN && <BarbeariaTabs />}
    </NavigationContainer>
  );
}
