import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { BarbeariasModule } from "./barbearias/barbearias.module";
import { ServicosModule } from "./servicos/servicos.module";
import { AgendamentosModule } from "./agendamentos/agendamentos.module";
import { FuncionariosModule } from "./funcionarios/funcionarios.module";
import { FinanceiroModule } from "./financeiro/financeiro.module";
import { PlanosModule } from "./planos/planos.module";
import { AssinaturasModule } from "./assinaturas/assinaturas.module";
import { PacotesMensaisModule } from "./pacotes-mensais/pacotes-mensais.module";
import { WebhooksModule } from "./webhooks/webhooks.module";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { RolesGuard } from "./common/guards/roles.guard";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    BarbeariasModule,
    ServicosModule,
    AgendamentosModule,
    FuncionariosModule,
    FinanceiroModule,
    PlanosModule,
    AssinaturasModule,
    PacotesMensaisModule,
    WebhooksModule,
  ],
  providers: [
    // Ordem importa: primeiro autentica (JWT), depois checa o papel (@Roles).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
