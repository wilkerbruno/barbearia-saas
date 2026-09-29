import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import { Usuario } from "@barbearia-saas/shared";

const TOKEN_KEY = "barbearia_saas_token";
const USER_KEY = "barbearia_saas_user";

interface AuthState {
  token: string | null;
  usuario: Usuario | null;
  carregando: boolean; // true enquanto restaura a sessão salva no dispositivo
  // true quando a última resposta da API disse que a assinatura da barbearia
  // não está em dia (código ASSINATURA_BLOQUEADA, ver api/client.ts) — o
  // RootNavigator usa isso pra forçar FUNCIONARIO/BARBEARIA_ADMIN pra fora
  // das telas normais (ver comentário lá). Nunca afeta CLIENTE/SAAS_ADMIN.
  assinaturaBloqueada: boolean;
  entrar: (token: string, usuario: Usuario) => Promise<void>;
  restaurarSessao: () => Promise<void>;
  logout: () => void;
  setAssinaturaBloqueada: (bloqueada: boolean) => void;
}

// Estado global de autenticação. A tela raiz (RootNavigator) decide qual
// conjunto de telas mostrar com base em `usuario.papel`.
export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  usuario: null,
  carregando: true,
  assinaturaBloqueada: false,

  entrar: async (token, usuario) => {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(usuario));
    set({ token, usuario, assinaturaBloqueada: false });
  },

  restaurarSessao: async () => {
    const [token, usuarioJson] = await Promise.all([
      SecureStore.getItemAsync(TOKEN_KEY),
      SecureStore.getItemAsync(USER_KEY),
    ]);
    set({
      token: token ?? null,
      usuario: usuarioJson ? JSON.parse(usuarioJson) : null,
      carregando: false,
      assinaturaBloqueada: false,
    });
  },

  logout: () => {
    SecureStore.deleteItemAsync(TOKEN_KEY);
    SecureStore.deleteItemAsync(USER_KEY);
    set({ token: null, usuario: null, assinaturaBloqueada: false });
  },

  setAssinaturaBloqueada: (assinaturaBloqueada) => set({ assinaturaBloqueada }),
}));
