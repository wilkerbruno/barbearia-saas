# Build context: a RAIZ do monorepo (por causa do pnpm workspace — a API
# depende do pacote packages/shared). No EasyPanel, ao criar o serviço da API:
#   - Build method: Dockerfile
#   - Build context / Root directory: a raiz do repositório (não apps/api)
#   - Dockerfile path: apps/api/Dockerfile
#
# Ao subir o container pela primeira vez, ele cria todas as tabelas sozinho
# (via `prisma db push`, ver CMD no final) — não precisa de acesso SSH nem
# console pra rodar migração manualmente.

FROM node:22-alpine
RUN corepack enable
WORKDIR /repo

# Copia o repo inteiro (o .dockerignore abaixo evita node_modules/dist/etc.)
COPY . .

# Instala só o necessário pra API + o pacote compartilhado (não puxa
# Expo/Next do resto do monorepo).
RUN pnpm install --frozen-lockfile --filter "@barbearia-saas/api..."

RUN pnpm --filter @barbearia-saas/api prisma:generate
RUN pnpm --filter @barbearia-saas/api build

WORKDIR /repo/apps/api
ENV NODE_ENV=production
EXPOSE 3000

# `prisma db push` cria/atualiza as tabelas a partir do schema.prisma direto
# no banco configurado em DATABASE_URL — é o que "cria todas as tabelas" na
# primeira vez que o container sobe. Rodar de novo em deploys futuros é
# seguro para mudanças aditivas (novo campo, nova tabela); se um dia você
# fizer uma mudança destrutiva (remover coluna com dados, etc.), o comando
# para e avisa em vez de apagar algo sem confirmação. Quando o schema
# estabilizar, migre para `prisma migrate dev` (gera arquivos de migração
# versionados) + `prisma migrate deploy` aqui no CMD.
#
# Depois roda o seed (prisma/seed.ts): cria os 3 planos iniciais e, se você
# definir SAAS_ADMIN_EMAIL/SAAS_ADMIN_SENHA nas variáveis de ambiente do
# serviço, garante o primeiro usuário SAAS_ADMIN — tudo isso sem precisar de
# SSH nem console, porque roda dentro do próprio container a cada boot (é
# idempotente, então rodar de novo em todo redeploy não causa problema).
CMD ["sh", "-c", "npx prisma db push --skip-generate && npx ts-node prisma/seed.ts && node dist/main.js"]
