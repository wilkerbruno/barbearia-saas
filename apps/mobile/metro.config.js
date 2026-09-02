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

// O "react-native-calendars" não declara "react" como dependência/peerDependency
// de verdade — só espera que já esteja disponível (prática comum em libs RN
// mais antigas, de antes das peerDependencies serem padrão). No pnpm, que
// isola cada pacote na própria pasta dentro de node_modules/.pnpm/..., isso
// faz o Metro resolver, a partir de DENTRO da pasta do react-native-calendars,
// uma cópia física de "react" diferente da que o resto do app usa. Duas
// cópias do módulo "react" ao mesmo tempo é o que causa "Invalid hook call" /
// "Cannot read property 'useState' of null" — o dispatcher interno de uma
// cópia não é o mesmo que a árvore de componentes está usando pra renderizar.
//
// A correção é forçar, só quando quem está pedindo é o react-native-calendars,
// a resolução de "react" a partir da pasta de apps/mobile (onde a única cópia
// "oficial" do projeto vive) em vez de a partir da pasta física dele.
// IMPORTANTE: isso é restrito ao react-native-calendars de propósito — uma
// versão anterior dessa correção forçava isso pra QUALQUER pacote pedindo
// "react-native"/"scheduler", o que quebrou o próprio react-native (ele tem
// uma dependência de verdade em "scheduler" que não existe dentro de
// apps/mobile e não precisa dessa ajuda).
const origemSingleton = path.join(projectRoot, "package.json");
const REACT_SINGLETON = new Set(["react", "react/jsx-runtime", "react/jsx-dev-runtime"]);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const pedindoDoCalendario = context.originModulePath.includes(`${path.sep}react-native-calendars${path.sep}`);
  if (pedindoDoCalendario && REACT_SINGLETON.has(moduleName)) {
    return context.resolveRequest({ ...context, originModulePath: origemSingleton }, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
