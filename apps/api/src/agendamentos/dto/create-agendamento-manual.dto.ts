import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsDateString, IsEnum, IsOptional, IsString, ValidateIf, ValidateNested } from "class-validator";
import { MetodoPagamento } from "@barbearia-saas/shared";

class ItemAgendamentoManualDto {
  @ValidateIf((dto) => !dto.pacoteId)
  @IsString()
  servicoId?: string;

  @ValidateIf((dto) => !dto.servicoId)
  @IsString()
  pacoteId?: string;
}

// Corpo de POST /agendamentos/manual — a própria barbearia lança um horário
// na agenda (cliente que ligou/chegou sem usar o app, ex: cliente avulso sem
// conta). Não passa por pagamento pelo app (ver AgendamentosService.criarManual).
export class CreateAgendamentoManualDto {
  @IsString()
  funcionarioId: string;

  @IsDateString()
  inicio: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ItemAgendamentoManualDto)
  itens: ItemAgendamentoManualDto[];

  // Cliente já cadastrado no app OU nome/telefone de alguém sem conta — um
  // dos dois é obrigatório (ver validação em AgendamentosService.criarManual).
  @IsOptional()
  @IsString()
  clienteId?: string;

  @IsOptional()
  @IsString()
  clienteAvulsoNome?: string;

  @IsOptional()
  @IsString()
  clienteAvulsoTelefone?: string;

  // Como a barbearia recebeu por fora (dinheiro na mão, Pix fora do app,
  // cartão na própria maquininha) — não passa pelo Mercado Pago da
  // integração, só fica registrado pro Financeiro separar os 3 cards
  // (Pix/Cartão/Dinheiro). Omitido = Dinheiro (ver AgendamentosService.criarManual).
  @IsOptional()
  @IsEnum(MetodoPagamento)
  metodoPagamento?: MetodoPagamento;
}
