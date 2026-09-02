# Build context: a RAIZ do monorepo (mesmo motivo do apps/api/Dockerfile — o
# painel depende do pacote packages/shared via pnpm workspace). No EasyPanel,
# ao criar o serviço do painel:
#   - Build method: Dockerfile
#   - Build context / Root directory: a raiz do repositório (não apps/admin-web)
#   - Dockerfile path: apps/admin-web/Dockerfile
#
# Diferente da API, aqui NÃO precisa compilar packages/shared num passo
# separado antes: o next.config.js já tem `transpilePackages:
# ["@barbearia-saas/shared"]`, que manda o próprio bundler do Next.js
# transpilar o .ts do pacote compartilhado direto (é o motivo de esse ajuste
# existir no next.config.js) — sem isso daria o mesmo tipo de erro de "onde
# foi parar o arquivo compilado" que o comentário no Dockerfile da API explica.
FROM node:22-slim
RUN corepack enable
WORKDIR /repo

# Copia o repo inteiro (o .dockerignore na raiz evita node_modules/dist/etc
# do seu computador vazando pra dentro da imagem).
COPY . .

# Instala só o necessário pro painel (não puxa NestJS/Expo do resto do
# monorepo). O .npmrc na raiz do repo reduz conexões em paralelo e adiciona
# retries — builds em servidores com rede instável (ex.: alguns hosts do
# EasyPanel) às vezes dão ECONNRESET/EAI_AGAIN ao baixar pacotes.
RUN pnpm install --frozen-lockfile --filter "@barbearia-saas/admin-web..."

# IMPORTANTE: variáveis NEXT_PUBLIC_* são gravadas DIRETO no JavaScript que
# vai pro navegador NO MOMENTO DO BUILD — não é como o resto do sistema, onde
# uma variável de ambiente do container em runtime já resolve. Se você trocar
# a URL da API depois, precisa gerar uma imagem nova (rebuild), não só
# reiniciar o container com outra variável de ambiente.
#
# No EasyPanel: defina NEXT_PUBLIC_API_URL nas "Build variables" do serviço
# (não só nas "Environment variables" de runtime) para que ela chegue aqui
# como build arg. Localmente, `docker build --build-arg
# NEXT_PUBLIC_API_URL=https://sua-api.com/api ...`.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN pnpm --filter @barbearia-saas/admin-web build

# Trava o build cedo (com mensagem clara) se um dia o build do Next parar de
# gerar a pasta esperada, em vez de só descobrir em produção que o `next
# start` não tem o que servir.
RUN test -d /repo/apps/admin-web/.next || (echo "ERRO: apps/admin-web/.next não foi gerado" && exit 1)

WORKDIR /repo/apps/admin-web
ENV NODE_ENV=production
EXPOSE 3001

# `next start` serve o build de produção gerado acima (não é um servidor de
# desenvolvimento). Porta 3001 fixa (ver package.json) pra não bater com a
# porta 3000 da API quando os dois rodam na mesma máquina/rede interna.
CMD ["npx", "next", "start", "-p", "3001"]
