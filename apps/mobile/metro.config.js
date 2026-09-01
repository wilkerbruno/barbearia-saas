// Necessário porque este projeto é um monorepo com pnpm: o pnpm organiza o
// node_modules com links simbólicos (inclusive os próprios pacotes do
// Expo/React Native, e o packages/shared do monorepo), e por padrão o Metro
// não segue esses links — ele resolve o caminho relativo a partir do local
// físico real do arquivo dentro de node_modules/.pnpm/..., não da pasta do
// projeto. Foi exatamente isso que causava o erro
// "Unable to resolve ../../App" (o expo/AppEntry.js tentava subir 2 pastas
// a partir de dentro do .pnpm em vez de a partir de apps/mobile).
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Segue os links simbólicos do pnpm normalmente.
config.resolver.unstable_enableSymlinks = true;

// Deixa o Metro enxergar arquivos fora de apps/mobile: o node_modules da
// raiz do monorepo e o pacote packages/shared.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;
