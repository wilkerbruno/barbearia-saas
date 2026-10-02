# APK pra download

O botão "Baixar o app" da landing page aponta pra:

    /downloads/barberone-latest.apk

Sempre que gerar um novo build com `eas build --local`, copie o .apk
resultante pra cá com ESSE MESMO NOME (barberone-latest.apk) e dê
commit + push. O link da página nunca muda — só o conteúdo do arquivo.

Exemplo (no seu terminal WSL, depois do build):

    cp /caminho/do/build-1234567890.apk apps/landing/public/downloads/barberone-latest.apk
    git add apps/landing/public/downloads/barberone-latest.apk
    git commit -m "chore: atualiza apk de download da landing page"
    git push

Se o arquivo .apk ficar grande (algumas dezenas de MB), considere configurar
Git LFS pra esse caminho, pra não inchar o histórico do repositório.
