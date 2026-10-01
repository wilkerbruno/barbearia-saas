import { create } from "zustand";
import * as secureStorage from "../utils/secureStorage";
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
  // Mescla campos novos no usuário logado (ex: depois de editar o perfil em
  // PATCH /usuarios/me) sem precisar deslogar/logar de novo — mantém o token
  // e o resto do estado como estão.
  atualizarUsuario: (dados: Partial<Usuario>) => Promise<void>;
}

// Estado global de autenticação. A tela raiz (RootNavigator) decide qual
// conjunto de telas mostrar com base em `usuario.papel`.
export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  usuario: null,
  carregando: true,
  assinaturaBloqueada: false,

  entrar: async (token, usuario) => {
    await secureStorage.setItem(TOKEN_KEY, token);
    await secureStorage.setItem(USER_KEY, JSON.stringify(usuario));
    set({ token, usuario, assinaturaBloqueada: false });
  },

  restaurarSessao: async () => {
    const [token, usuarioJson] = await Promise.all([
      secureStorage.getItem(TOKEN_KEY),
      secureStorage.getItem(USER_KEY),
    ]);
    set({
      token: token ?? null,
      usuario: usuarioJson ? JSON.parse(usuarioJson) : null,
      carregando: false,
      assinaturaBloqueada: false,
    });
  },

  logout: () => {
    secureStorage.deleteItem(TOKEN_KEY);
    secureStorage.deleteItem(USER_KEY);
    set({ token: null, usuario: null, assinaturaBloqueada: false });
  },

  setAssinaturaBloqueada: (assinaturaBloqueada) => set({ assinaturaBloqueada }),

  atualizarUsuario: async (dados) => {
    const atual = get().usuario;
    if (!atual) return;
    const atualizado = { ...atual, ...dados };
    await secureStorage.setItem(USER_KEY, JSON.stringify(atualizado));
    set({ usuario: atualizado });
  },
}));
