// Tokens visuais do app — mesma paleta "moderno minimalista" usada no protótipo
// de telas (canvas de design). Os valores em hex abaixo são a conversão
// aproximada das cores oklch do protótipo; ajuste livremente aqui, num único
// lugar, sem precisar mexer em cada tela.
export const colors = {
  background: "#F7F5F2",
  surface: "#FFFFFF",
  surfaceAlt: "#F1EFEC",
  ink: "#2A2420",
  inkMuted: "#837A73",
  border: "#DEDAD4",
  accent: "#C1652E",
  accentSoft: "#F5E4D7",
  accentInk: "#FFFFFF",
  success: "#4F9464",
  successSoft: "#E4F1E7",
  danger: "#C1442E",
  dangerSoft: "#F6E1DC",
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
