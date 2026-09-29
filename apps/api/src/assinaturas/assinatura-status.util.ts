import { StatusAssinatura } from "@barbearia-saas/shared";

// Estado mínimo (de uma Assinatura) necessário pra calcular se ela já está
// "fora da carência" — ou seja, se deve sumir pro cliente final. Extraído em
// funções puras (sem acessar o banco) pra poder ser usado tanto num check
// pontual (AssinaturasService.estaForaDaCarencia, que primeiro roda
// expirarTrialSeVencido) quanto numa listagem em massa (BarbeariasService.
// listarProximas, que busca várias barbearias de uma vez e não vale a pena
// fazer um flip individual por linha só pra exibir a lista).
export interface AssinaturaParaCarencia {
  status: StatusAssinatura;
  bloqueadaEm: Date | null;
  trialTerminaEm: Date | null;
}

// A partir de quando essa assinatura está "bloqueada" pra fins de carência.
// Cobre o caso de um TRIAL que já venceu mas ainda não foi virado CANCELADA
// no banco (expirarTrialSeVencido só roda sob demanda) — nesse caso usa
// trialTerminaEm como se fosse o bloqueadaEm, senão uma listagem em massa
// mostraria a barbearia pra sempre até alguém abrir a tela dela e disparar o
// flip. Retorna null se a assinatura está em dia (TRIAL ainda dentro do
// prazo, ou ATIVA).
export function calcularBloqueadaEmEfetivo(assinatura: AssinaturaParaCarencia): Date | null {
  if (assinatura.status === StatusAssinatura.ATIVA) return null;
  if (assinatura.status === StatusAssinatura.TRIAL) {
    if (assinatura.trialTerminaEm && assinatura.trialTerminaEm.getTime() <= Date.now()) {
      return assinatura.trialTerminaEm;
    }
    return null;
  }
  // INADIMPLENTE/CANCELADA
  return assinatura.bloqueadaEm;
}

// true quando já passou `horasCarenciaAposVencimento` desde que a assinatura
// ficou bloqueada — é nesse instante que a barbearia deve sumir da busca/
// agendamento do cliente final (a equipe já foi bloqueada bem antes disso,
// na hora, ver AssinaturaGuard).
export function estaForaDaCarencia(assinatura: AssinaturaParaCarencia, horasCarenciaAposVencimento: number): boolean {
  const bloqueadaEmEfetivo = calcularBloqueadaEmEfetivo(assinatura);
  if (!bloqueadaEmEfetivo) return false;
  const limiteMs = bloqueadaEmEfetivo.getTime() + horasCarenciaAposVencimento * 60 * 60 * 1000;
  return Date.now() >= limiteMs;
}

// A partir de quantos dias antes do vencimento o aviso (push + pop-up)
// aparece — mesmo número usado pelo cron de push (AssinaturasService.
// verificarAvisosDeVencimento) e pelo endpoint que alimenta o pop-up do app
// (AssinaturasService.resumoVencimento), pra sempre concordarem sobre quando
// a assinatura está "vencendo".
export const DIAS_AVISO_VENCIMENTO = 3;

// Estado mínimo pra calcular quantos dias faltam até o próximo vencimento —
// TRIAL conta a partir de trialTerminaEm, ATIVA a partir de proximaCobrancaEm
// (a próxima cobrança recorrente). INADIMPLENTE/CANCELADA não têm "dias
// restantes" (já venceu) — a equipe já está bloqueada nesse ponto.
export interface AssinaturaParaVencimento {
  status: StatusAssinatura;
  trialTerminaEm: Date | null;
  proximaCobrancaEm: Date | null;
}

// Dias até o vencimento (pode dar negativo se já passou e o status ainda não
// foi atualizado — ex: cobrança recorrente atrasada, webhook ainda não
// chegou). null quando não há uma data de referência ou o status não é
// TRIAL/ATIVA.
export function diasRestantesVencimento(assinatura: AssinaturaParaVencimento): number | null {
  const referencia =
    assinatura.status === StatusAssinatura.TRIAL
      ? assinatura.trialTerminaEm
      : assinatura.status === StatusAssinatura.ATIVA
        ? assinatura.proximaCobrancaEm
        : null;
  if (!referencia) return null;
  return Math.ceil((referencia.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}
