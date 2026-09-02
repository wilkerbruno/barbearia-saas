import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsDateString, IsOptional, IsString, ValidateIf, ValidateNested } from "class-validator";

// Um item do "carrinho" de serviços — igual ao CreateAgendamentoDto, mas sem o
// horário/profissional (que são únicos pra todo o lote, não por item).
class ItemAgendamentoLoteDto {
  @ValidateIf((dto) => !dto.pacoteId)
  @IsString()
  servicoId?: string;

  @ValidateIf((dto) => !dto.servicoId)
  @IsString()
  pacoteId?: string;
}

// O cliente escolhe um ou mais serviços (pode repetir o mesmo, ex: 2x corte
// pra pai e filho) e um único horário de início — o servidor encadeia cada
// item em sequência a partir daí (ver AgendamentosService.criarLote).
export class CreateAgendamentoLoteDto {
  // Se omitido, o servidor escolhe automaticamente qualquer profissional
  // disponível para o intervalo inteiro.
  @IsOptional()
  @IsString()
  funcionarioId?: string;

  @IsDateString()
  inicio: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ItemAgendamentoLoteDto)
  itens: ItemAgendamentoLoteDto[];
}
