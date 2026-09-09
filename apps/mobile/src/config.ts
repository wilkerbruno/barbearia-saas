// Não usado mais pelo fluxo do cliente: agora ele escolhe a barbearia na Home
// (lista de barbearias perto dele) em vez de o app estar fixo numa só — ver
// HomeScreen/BarbeariaDetailScreen. Mantido por enquanto por segurança, caso
// alguma outra parte do app ainda dependa de uma barbearia "padrão".
export const BARBEARIA_ID = process.env.EXPO_PUBLIC_BARBEARIA_ID ?? "";
