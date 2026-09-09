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
import { AcessoNaoSuportadoScreen } from "../screens/auth/AcessoNaoSuportadoScreen";

// Papéis com uma stack mobile de verdade. O SAAS_ADMIN (administrador da
// plataforma) usa o painel web separado (apps/admin-web) e não entra aqui —
// ver `papelSuportado` abaixo, que cobre esse e qualquer outro papel futuro
// sem tela própria no celular.
const PAPEIS_COM_STACK_MOBILE = [Papel.CLIENTE, Papel.FUNCIONARIO, Papel.BARBEARIA_ADMIN] as const;

export function RootNavigator() {
  const { usuario, carregando, restaurarSessao, logout } = useAuthStore();

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

  // Logado, mas com um papel sem tela no app mobile (ex.: SAAS_ADMIN): mostra
  // um aviso com botão de sair em vez de deixar a tela em branco/travada sem
  // nenhum jeito de voltar pro login a não ser reinstalando o app.
  const papelSemSuporteMobile = usuario && !PAPEIS_COM_STACK_MOBILE.includes(usuario.papel as any);

  return (
    <NavigationContainer>
      {!usuario && <AuthNavigator />}
      {papelSemSuporteMobile && <AcessoNaoSuportadoScreen onSair={logout} />}
      {usuario?.papel === Papel.CLIENTE && <ClienteTabs />}
      {usuario?.papel === Papel.FUNCIONARIO && <FuncionarioTabs />}
      {usuario?.papel === Papel.BARBEARIA_ADMIN && <BarbeariaTabs />}
    </NavigationContainer>
  );
}
