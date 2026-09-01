// Tokens visuais do app — tema escuro "barbearia clássica": couro, latão e
// madeira escura, com um dourado/âmbar de destaque (bem mais masculino/
// profissional que a paleta clara anterior). Como toda tela usa só os
// nomes abaixo (colors.*, nunca hex direto), trocar a paleta aqui já muda
// o app inteiro sem mexer em cada tela.
export const colors = {
  background: "#141110",
  surface: "#1D1917",
  surfaceAlt: "#26211D",
  ink: "#F3EDE4",
  inkMuted: "#9C9188",
  border: "#39322B",
  accent: "#CB9B4B", // dourado/latão — cor de destaque (botões, ícone ativo, estrelas)
  accentSoft: "#3B2E1B",
  accentInk: "#1B140B", // texto escuro sobre o dourado (contraste)
  success: "#6FA37D",
  successSoft: "#1D2A21",
  danger: "#D9695A",
  dangerSoft: "#33201C",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 14,
  xl: 16,
  pill: 999,
};

export const typography = {
  // Carregue Manrope/Work Sans via expo-font se quiser igualar 100% ao protótipo;
  // até lá, o sistema usa a fonte padrão da plataforma.
  heading: { fontWeight: "800" as const },
  subheading: { fontWeight: "700" as const },
  body: { fontWeight: "400" as const },
};
