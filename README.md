# Ferramentaria — Versão 1.0.5 (novas correções do cadastro e da saída)

Sistema Windows de controle de estoque de insertos. Interface React + TypeScript e Electron, com SQLite local no processo principal. **Cada instalação tem um banco próprio e não sincroniza com os outros computadores.** A marca Ferramentaria é provisória e editável.

## Novidades da versão 1.0.1

- **Cadastro de peças** em **Máquinas, obras e peças**, ao lado de máquinas e obras. O cadastro não permite nomes duplicados (sem distinção de maiúsculas/minúsculas).
- No formulário **Registrar saída**, o campo **Peça (nome da peça)** agora sugere nomes cadastrados e também permite digitação livre. Na versão atual, o campo é obrigatório e só salva quando o nome digitado já existe no cadastro. Nomes já registrados em saídas antigas continuam associados ao histórico.
- **Histórico de movimentações:** coluna **Peça** separada de **Máquina / obra**, com pesquisa também pelo nome da peça. Registros históricos sem peça aparecem com travessão.
- **Relatórios:** filtros por peça, gráfico de consumo por peça, coluna Peça no histórico da tela e no extrato PDF. O Excel já exportava o campo Peça e agora adiciona uma aba de ranking **Pecas** (9 abas no total).
- **Compatibilidade:** bases SQLite e backups JSON das fases anteriores continuam aceitos. O cadastro `parts` é criado vazio quando o banco ou backup antigo não o contém. Os registros antigos não são apagados.
- **Backups automáticos locais:** uma cópia JSON no início da execução e depois das alterações, com um arquivo por dia e retenção dos últimos 7 dias disponíveis. O sistema tenta salvar sem impedir o registro se o backup falhar. Backups manuais JSON e restauração com confirmação continuam disponíveis em Administração.
- **Distribuição Windows:** configurações electron-builder/NSIS para instalador x64, atalho na área de trabalho e menu Iniciar, ícone próprio e opção de escolher pasta de instalação. **O .exe ainda precisa ser compilado e testado num Windows.**

## Abrir a aplicação no Windows para testar

1. Instale **Node.js LTS** no computador de desenvolvimento.
2. Extraia **todo o ZIP** mantendo `INICIAR_NO_WINDOWS.bat` na mesma pasta da subpasta `ferramentaria`.
3. Dê dois cliques em `INICIAR_NO_WINDOWS.bat`. O script detecta a pasta do projeto, instala dependências (`npm ci`) na primeira execução e inicia o app. Na primeira instalação das dependências, é necessário internet.

Alternativamente, no VS Code, entre **dentro** da pasta que contém `package.json`:

```powershell
cd .\ferramentaria
npm ci
npm test
npm run dev
```

**Importante:** o aplicativo abre diretamente a base SQLite local (não há modo de demonstração). Se o banco não puder ser carregado, mostra uma mensagem de erro e permite tentar novamente. Para abrir a interface, use `npm run dev`, não `npm run dev:web`.

## Criar o instalador .exe (Fase 5)

No computador **Windows x64**, feche a aplicação e execute `GERAR_INSTALADOR_WINDOWS.bat` a partir da pasta extraída. O script executa:

```powershell
cd .\ferramentaria
npm ci
npm test
npm run dist
```

Se a compilação e o empacotamento terminarem sem erros, o arquivo será criado em:

`ferramentaria\release\Ferramentaria-Setup-1.0.3-x64.exe`

Para quem apenas instala o `.exe`, **não é necessário ter Node.js nem VS Code**. O instalador não está assinado digitalmente e o Windows SmartScreen poderá emitir um aviso. Não desative políticas de segurança da empresa para contorná-lo; para distribuição comercial/empresarial, utilize assinatura de código apropriada.

## Migrar de outra fase sem perder dados

1. Na instalação anterior, abra o aplicativo e faça **Administração → Exportar backup JSON**. Guarde a cópia num local seguro.
2. Feche a versão antiga e instale ou execute a versão 1.0.3 **no mesmo usuário Windows**. Mantivemos os identificadores e a pasta local do aplicativo para reutilizar o banco.
3. Abra o aplicativo e confirme se os insertos, funcionários e movimentações continuam visíveis. O cadastro de peças começa vazio numa base antiga.
4. Se precisar restaurar, use **Administração → Restaurar backup JSON**, confira os números apresentados e confirme. Essa operação **substitui os dados atuais**; o aplicativo cria uma cópia de recuperação antes disso.
5. Verifique uma retirada com nome de peça, feche o aplicativo e abra novamente. O histórico deverá manter a peça.

O SQLite em geral fica em `%APPDATA%\ferramentaria\ferramentaria.sqlite`, e os backups automáticos em `%APPDATA%\ferramentaria\backups`. O diretório real depende do perfil Windows. **Não coloque o SQLite em pasta sincronizada pelo OneDrive** e não copie o arquivo aberto enquanto o aplicativo está executando. Para movimentar dados entre máquinas, use Exportar/Restaurar backup JSON. Copiar o projeto para um novo computador não transfere os dados automaticamente.

## Regras e módulos

- **Insertos:** código, descrição, saldo, estoque mínimo e localização; código único. Saldo corrigido por movimentação, não por edição do cadastro.
- **Funcionários:** ID, SSO, nome e área. IDs/SSOs exclusivos.
- **Máquinas, obras e peças:** catálogos locais, sugestões nas saídas. Nas saídas, os três campos são obrigatórios e aceitam apenas valores cadastrados.
- **Saídas:** inserto existente, funcionário cadastrado, máquina, obra, peça e quantidade obrigatórios, com digitação assistida por sugestões, confirmação de cadastro existente e bloqueio de saldo negativo.
- **Abastecimento:** entrada de insertos e alerta de estoque mínimo.
- **Estornos:** sempre geram movimentação inversa vinculada à original; não apagam registros e não permitem duplicação ou saldo negativo.
- **Relatórios:** filtro por período, tipo, código, máquina, obra, peça e funcionário. Estornos são excluídos retroativamente do consumo líquido, mas mantidos no extrato de auditoria.
- **Excel:** exportação `.xlsx` com 9 abas (Resumo, Movimentacoes, Tendencia, Insertos, Maquinas, Obras, Pecas, Funcionarios e Estoque atual), até 50.000 movimentações por arquivo; códigos como texto para preservar zeros à esquerda.
- **PDF:** indicadores, rankings e até 100 movimentações em A4. Para extrato completo, use Excel.
- **Importação CSV:** insertos e funcionários a partir de CSV UTF-8 com os cabeçalhos da pasta `modelos/`. Nenhum registro é importado caso haja erro ou duplicidade no lote.
- **Administração:** alterar nome do app, exportar/restaurar backup JSON, importar CSV e conferir dados locais.

## Publicação no GitHub

Na pasta `ferramentaria`, execute após criar um repositório vazio:

```powershell
git init
git add .
git commit -m "Ferramentaria 1.0: catálogo de peças e instalador Windows"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
git push -u origin main
```

O `.gitignore` impede enviar `node_modules`, banco SQLite local, arquivos `.env`, builds e logs. **Não envie backups e dados reais de funcionários para repositórios públicos.** Para compartilhar o instalador, publique o executável depois de testá-lo usando GitHub Releases.

## Validação da entrega

A verificação neste ambiente abrange integridade dos arquivos, checagem de sintaxe TypeScript/TSX e testes de estrutura dos relatórios sem instalar pacotes novos. **O ambiente não consegue acessar registry.npmjs.org (`EAI_AGAIN`), portanto `npm ci`, `npm test`, `npm run build`, `npm run dist` e a abertura no Windows devem ser executados no PC de desenvolvimento.** Consulte `VALIDACAO.md` para o checklist.


## Atualização 1.0.1: histórico e retirada de vários tipos para o mesmo funcionário

- Em **Dashboard > Últimas movimentações**, **Movimentações**, **Abastecimento** e **Relatórios > Extrato**, o histórico tem duas colunas: **Máquina** e **Peça / Obra**. Dentro de Peça / Obra, o nome da peça aparece primeiro, e a obra aparece logo abaixo. O filtro por nome de peça e obra permanece disponível.
- Ao abrir **Registrar saída**, preencha funcionário, máquina, obra, peça, inserto e quantidade.
- Clique em **Registrar e adicionar outro inserto** para salvar a saída atual e manter o atendimento aberto. O formulário preserva **funcionário, máquina, obra, peça e observação**, limpa **inserto** e **quantidade** e mostra quantos tipos já foram registrados naquele atendimento.
- Escolha o próximo inserto, informe a quantidade e repita. Cada clique efetiva imediatamente **uma movimentação separada** no SQLite, com validação de estoque. Uma falha ao adicionar outro tipo não desfaz as saídas já registradas.
- Clique em **Registrar e finalizar** para salvar o último inserto e fechar o atendimento. Se já salvou tudo por **adicionar outro**, clique em **Encerrar sem novo registro**. Fechar/Cancelar **não cancela** as saídas previamente salvas.
- Não houve mudança de esquema do SQLite nem do formato dos backups; dados existentes são preservados.

**Para testar:** no VS Code, abra a pasta `ferramentaria` (com `package.json`), execute `npm ci` e `npm run dev`. Confira também `VALIDACAO.md`. O `.exe` ainda precisa ser gerado e validado no Windows com `GERAR_INSTALADOR_WINDOWS.bat`.


## Atualização 1.0.2: código digitado + descrição automática e operação real

- Em **Movimentações > Registrar saída**, não existe mais a lista obrigatória “Inserto”. Agora você **digita o Código do inserto** num campo de texto. O segundo campo, **Descrição do inserto**, é somente leitura e é preenchido assim que o código coincide com um cadastro existente; o saldo é mostrado em seguida. O código não diferencia maiúsculas e minúsculas, ignora espaços nas pontas e preserva zeros à esquerda.
- Enquanto digita, o campo de código pode sugerir os códigos existentes. Não é necessário selecionar uma opção: digitar um código completo cadastrado basta. Código inexistente ou parcial **não permite registrar** saídas nem entradas.
- Ao clicar em **Registrar e adicionar outro inserto**, o código, a descrição e a quantidade são limpos; o funcionário, máquina, obra, peça e observação permanecem. Cada saída continua sendo persistida no banco, separadamente.
- O antigo **modo de demonstração foi retirado por completo**. O aplicativo não gera nem mostra registros fictícios: lê o SQLite local automaticamente ao iniciar. Se a conexão com Electron/SQLite falhar, exibe um aviso e não aceita registros em memória volátil.
- Ao instalar/atualizar no mesmo perfil Windows, a base permanece no local anterior. Não há mudança no esquema do banco nem nos backups.

**Executar pelo terminal:** extraia o ZIP, abra a pasta `ferramentaria` (a que contém `package.json`) no VS Code e execute `npm ci` e `npm run dev`, um de cada vez. Se estiver na pasta que contém o arquivo `INICIAR_NO_WINDOWS.bat`, execute antes `cd .\ferramentaria` **uma única vez**.

**Teste recomendado:** cadastre um inserto `F2018494` com descrição e estoque, abra uma saída e digite `f2018494`: descrição e saldo devem aparecer. Registre a primeira saída com **adicionar outro**, digite outro código e finalize, conferindo ambas as movimentações. Em outra execução, os registros devem persistir.


## Versão 1.0.3 — funcionário por SSO digitado

Em **Movimentações > Registrar saída**, o operador digita o **SSO do funcionário** em campo livre (sem `select`/lista de seleção). Quando existe correspondência **exata** com o SSO de um funcionário cadastrado, o campo somente leitura **Nome do funcionário** mostra o nome automaticamente. O SSO é tratado como texto para preservar zeros à esquerda. SSO inválido ou incompleto impede a saída.

O sistema continua salvando o **ID interno do funcionário** na movimentação, preservando a compatibilidade com o SQLite e os históricos existentes. O botão **Registrar e adicionar outro inserto** preserva SSO, nome, máquina, obra, peça e observação, limpando apenas o código e a quantidade do inserto.

Para atualizar uma instalação, exporte backup JSON, gere o novo `.exe` com `npm run dist` no Windows e valide em uma instalação de teste antes de distribuir. O identificador do app e o caminho de armazenamento local não foram alterados. Em ambiente corporativo, solicite a aprovação do TI para instalar novas versões.


## Versão 1.0.5 — edição de movimentações, cadastros validados e descrição nos relatórios

- Em **Movimentações > Histórico**, o botão de lápis abre a correção de uma entrada ou saída. Os campos mantêm os valores atuais e permitem alterar código do inserto, quantidade, obra, máquina, peça, funcionário (saídas) e observação. Data, ID e tipo permanecem fixos.
- A correção atualiza o mesmo registro, sem criar nova saída; o saldo de insertos é recalculado na **mesma transação SQLite**. O sistema rejeita correções que causariam saldo negativo ou excederiam o limite de 1.000.000. Os dados corrigidos aparecem imediatamente em Dashboard, Histórico, Abastecimento e relatórios.
- Cada registro corrigido exibe um indicador de correção. O backup JSON preserva as revisões anteriores (`corrections`) para rastreabilidade. Registros já estornados ou de estorno não podem ser editados, para não invalidar o vínculo contábil.
- Em **Registrar saída**, não se salva antes de preencher inserto válido, quantidade, SSO de funcionário existente, máquina, obra e peça. Os três últimos são **campos de texto com sugestões de cadastro** e somente aceitam nomes já existentes, validados na interface e novamente no banco. O campo Observação permanece opcional.
- Em **Relatórios > Insertos mais consumidos**, exibe código e descrição. Em **Extrato de movimentações**, mostra ambos; o **PDF** e a aba **Insertos** do **Excel** também incluem os dois campos.
- Mantém o mesmo caminho SQLite e o mesmo formato `version: 1` de backup, com campos de correção opcionais. Faça backup antes de atualizar e teste com uma cópia da base.

**Para executar no Windows:** abra a pasta `ferramentaria` no VS Code, execute `npm ci`, `npm test`, `npm run build`, depois `npm run dev`. Para criar o instalador, execute `npm run dist` no Windows. O ZIP de código-fonte não contém um novo `.exe` compilado nem `node_modules`.

## Versão 1.0.5 — ajustes adicionais

- **Registrar saída:** Máquina, Obra e Peça podem ser digitadas normalmente; a lista de sugestões aparece conforme os nomes cadastrados. A gravação é recusada se qualquer um não existir no cadastro. A comparação ignora diferença de maiúsculas/minúsculas e espaços no início/fim; o nome é salvo com a grafia oficial do cadastro.
- **Dashboard > Insertos mais utilizados:** cada barra mostra código e descrição do inserto, além da quantidade.
- **Movimentações:** removido o botão de estornar da interface; o histórico de estornos antigos é preservado para auditoria. O botão Editar permanece.
- **Funcionários > Editar:** o ID agora é editável. Se for alterado, os movimentos atuais e as referências no histórico de correções e de estornos recebem o ID novo na mesma transação; IDs/SSOs duplicados são bloqueados.

O formato do backup e o identificador da aplicação permanecem os mesmos. Faça um backup antes de atualizar.
