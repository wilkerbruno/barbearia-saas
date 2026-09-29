import { IsArray, IsIn, IsInt, IsOptional, IsPositive, IsString, Min } from "class-validator";
import { TipoDesconto } from "@barbearia-saas/shared";

export class CreatePlanoDto {
  @IsString()
  nome: string;

  // Preço da mensalidade em centavos. Ex: R$ 129,00 = 12900.
  @IsInt()
  @IsPositive()
  precoCentavos: number;

  @IsOptional()
  @IsInt()
  limiteFuncionarios?: number; // omitido = ilimitado

  @IsArray()
  @IsString({ each: true })
  recursos: string[];

  // Desconto do plano ANUAL (12x o mensal) — ver calcularPrecoAnualCentavos
  // (pacote compartilhado). PERCENTUAL: descontoAnualValor em pontos
  // percentuais (0-100). VALOR_FIXO: descontoAnualValor em CENTAVOS abatidos
  // do total anual. Ambos opcionais na criação (default: 0% de desconto).
  @IsOptional()
  @IsIn([TipoDesconto.PERCENTUAL, TipoDesconto.VALOR_FIXO])
  descontoAnualTipo?: TipoDesconto;

  @IsOptional()
  @IsInt()
  @Min(0)
  descontoAnualValor?: number;
}
