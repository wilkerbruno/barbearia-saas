import { SetMetadata } from "@nestjs/common";
import { Papel } from "@barbearia-saas/shared";

export const ROLES_KEY = "roles";

// Uso: @Roles(Papel.BARBEARIA_ADMIN, Papel.SAAS_ADMIN)
export const Roles = (...papeis: Papel[]) => SetMetadata(ROLES_KEY, papeis);
