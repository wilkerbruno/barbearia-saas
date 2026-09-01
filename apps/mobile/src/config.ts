// O app do cliente é "white-label": cada barbearia assinante publica sua própria
// build apontando para o seu id de barbearia (ou você resolve isso por deep link /
// domínio antes do login, numa versão multi-barbearia do mesmo app).
// Por enquanto, fixo via variável de ambiente para simplificar o MVP.
export const BARBEARIA_ID = process.env.EXPO_PUBLIC_BARBEARIA_ID ?? "";
