# Ferramentaria 1.0.0 — Checklist de validação

## Checagens efetuadas ao preparar o ZIP

- [x] Código TypeScript/TSX analisado quanto a erros de sintaxe com compilador TypeScript.
- [x] `package.json` e `package-lock.json` alinhados com a versão 1.0.0.
- [x] Pastas do projeto, `.gitignore`, modelos CSV, imagens de ícone, scripts BAT e testes incluídos.
- [x] Exportação isolada de XLSX com 9 abas (inclusive `Pecas`), nome de peça e código com zeros à esquerda; integridade ZIP testada.
- [x] HTML de relatório PDF isolado contém o nome da peça escapado corretamente.
- [x] ZIP gerado e testado quanto à integridade dos arquivos.
- [ ] `npm ci` — tentativa falhou por DNS de registry.npmjs.org neste ambiente (`EAI_AGAIN`).
- [ ] `npm test` — dependências npm não instaladas.
- [ ] `npm run build` e `npm run dist` — não executados; requerem dependências e validação no Windows.
- [ ] Abertura do Electron, exportação PDF real e funcionamento do instalador no Windows — pendentes de teste no PC.

## Conferência recomendada no Windows

1. Extraia o ZIP em pasta fora de OneDrive, de preferência em `C:\Projetos\Ferramentaria-v1`.
2. Entre em `ferramentaria`, execute `npm ci`, `npm test`, `npm run build` e depois `npm run dev`.
3. Confira a abertura automática da base SQLite local: não existe modo de demonstração. Os registros precisam persistir após fechar e reabrir o aplicativo.
4. Cadastre duas peças em **Máquinas, obras e peças**, tente cadastrar uma peça duplicada com letras maiúsculas/minúsculas diferentes: deve ser bloqueada.
5. Registre saída escolhendo uma peça cadastrada. Veja a coluna **Peça** no Dashboard e em Movimentações e pesquise pelo nome da peça.
6. Feche e reabra: o cadastro e o nome da peça no histórico devem persistir.
7. Caso a base já tenha estornos antigos, confira se continuam visíveis e se seus saldos históricos são preservados. (O botão Estornar foi retirado na 1.0.5.)
8. Vá a Relatórios: filtre pela peça, confira o consumo e o histórico; exporte Excel (aba **Pecas**) e PDF (coluna **Peça**).
9. Importe backup antigo (de teste) sem `parts`: os insertos e históricos antigos devem permanecer intactos e o catálogo de peças deve aparecer vazio.
10. Veja os backups automáticos na pasta `%APPDATA%\ferramentaria\backups`; exporte um backup manual em local externo.
11. Execute `GERAR_INSTALADOR_WINDOWS.bat`, instale em máquina Windows x64 de teste e confira atalhos, banco local, relatórios, backup e atualização sem perda de dados.
12. Antes de uso operacional, confirme os dados contra a contagem física do estoque e faça backup em local seguro.

O instalador `.exe` só estará disponível após build Windows bem-sucedido; o ZIP entregue contém o código-fonte, não um executável compilado.

## Versão 1.0.1 — histórico e várias saídas para um funcionário

- Histórico do Dashboard, Movimentações e Abastecimento, e o extrato da página Relatórios: colunas **Máquina** e **Peça / Obra**. O detalhe **Peça:** aparece acima do detalhe **Obra:**, ambos dentro da mesma coluna.
- PDF e Excel: extratos agora usam Máquina e Peça / Obra, sem perder os filtros separados por obra e peça.
- Saída: **Registrar e adicionar outro inserto** salva a movimentação, mantém funcionário, máquina, obra, peça e observação e limpa o inserto e a quantidade. **Registrar e finalizar** salva e fecha o atendimento; **Encerrar sem novo registro** fecha sem adicionar mais quando já houve retiradas.
- Testes adicionados para sequência de saídas e agrupamento da exportação.
- Nesta execução: análise sintática TypeScript/TSX e validação isolada da geração de PDF/Excel passaram; `npm ci` não concluiu devido a DNS `EAI_AGAIN` para `registry.npmjs.org`, portanto os testes completos, o render do Electron e o instalador `.exe` não foram executados aqui.
- Para validar no Windows: entrar na pasta com `package.json`, executar `npm ci`, `npm test`, `npm run dev`. Teste com dois insertos diferentes para o mesmo funcionário, verificando saldo e duas linhas separadas no histórico. Para instalador, `npm run dist` depois de passar testes e build.


## Checklist da versão 1.0.2 — código do inserto e fim da demonstração

- [ ] Ao iniciar pelo Electron, **não há botão de demonstração** nem cadastros fictícios. A base SQLite local abre automaticamente.
- [ ] Com cadastro de inserto `F2018494`, digitar esse código na saída mostra a descrição correta e saldo.
- [ ] Digitar em minúsculas ou com espaços externos continua a localizar o código cadastrado.
- [ ] Código parcial ou inexistente mostra aviso e não grava movimentação no banco.
- [ ] `Registrar e adicionar outro inserto` limpa apenas código, descrição e quantidade. Funcionário, máquina, obra, peça e observação permanecem preenchidos.
- [ ] Entrada de estoque também oferece os campos código e descrição (apenas leitura).
- [ ] Fechar e abrir mantém os cadastros e saídas reais da instalação anterior.
- [ ] No navegador sem Electron não é possível trabalhar com cadastros temporários: mostra aviso de indisponibilidade da base real.
- [ ] Rodar `npm test`, `npm run build` e testar instalador Windows antes de uso operacional.


## Versão 1.0.3 — campo SSO digitável em Registrar saída

- [x] Removido `select` de funcionário da saída; agora existe `input` de SSO e campo `Nome do funcionário` somente leitura.
- [x] A correspondência SSO precisa ser completa, sem perder zeros à esquerda; espaços extras e caixa de letras não impedem o reconhecimento.
- [x] Em erro de SSO ou SSO desconhecido, a movimentação é bloqueada antes de atingir o banco.
- [x] O histórico continua associado ao ID do cadastro do funcionário, para manter compatibilidade com saídas anteriores.
- [x] Registro consecutivo mantém o SSO informado e nome correspondente.
- [x] Checagem sintática local TypeScript/TSX passou e validação isolada do SSO passou.
- [ ] Testes npm completos e Electron/NSIS no Windows ainda necessários: `npm ci`, `npm test`, `npm run build`, `npm run dev`, `npm run dist`.

### Teste manual sugerido

1. Cadastre funcionário com ID `0001`, SSO `00212504474` e nome `Funcionário Um`.
2. Em Movimentações > Registrar saída, digite `00212504474`. Confira o nome preenchido automaticamente sem escolher nada.
3. Tente SSO `212504474` e `002125`: nome deve ficar em branco e a saída deve ser bloqueada.
4. Registre saída para um inserto, clique Registrar e adicionar outro inserto: SSO, nome, máquina, obra, peça e observação precisam continuar preenchidos.
5. Confira duas movimentações no histórico associadas ao mesmo funcionário após registrar o segundo inserto.
6. Gere e teste o instalador `Ferramentaria-Setup-1.0.3-x64.exe` no Windows e faça backup da base atual antes de instalar por cima.


## Checklist 1.0.5

1. Cadastre máquina, obra, peça, funcionário e inserto. Tente registrar uma saída faltando cada campo; nenhuma deve ser gravada.
2. Digite máquina, obra e peça manualmente, e também escolha nas sugestões. Nomes não cadastrados devem ser rejeitados ao salvar; SSO e código inválidos também.
3. Registre uma saída. Em Histórico, clique no lápis e corrija peça e obra. Confirme alteração nos filtros, relatórios e tela inicial.
4. Edite código e quantidade com saldo suficiente. Confirme devolução ao inserto antigo e débito no novo, sem segunda movimentação.
5. Teste correção que produziria saldo negativo; deve falhar e preservar banco. Tente editar movimento estornado; deve falhar.
6. Confira código e descrição nos rankings, extrato, PDF e Excel. Faça backup/restauração e confira se a correção permanece.

## Checklist adicional 1.0.5 — validação manual pendente no Windows

1. Em Dashboard > Insertos mais utilizados, confirme que aparecem código e descrição do inserto.
2. Em Movimentações, confirme que existe apenas o botão Editar e que não aparece Estornar. Registros estornados anteriormente ainda devem aparecer no histórico.
3. Em Funcionários, edite o ID de um funcionário com saídas antigas; confirme o novo ID em seu cadastro e o nome associado às saídas antigas, sem perda de histórico ou saldo.
4. Tente mudar o ID para outro já cadastrado (inclusive mesma grafia com maiúsculas distintas): a alteração deve ser bloqueada sem modificar o histórico.
5. Depois de `npm ci --include=dev`, execute `npm test` e `npm run build` no Windows antes de gerar o instalador.

Verificação nesta preparação: sintaxe de 17 arquivos TS/TSX sem erros. Dependências não ficaram instaladas neste ambiente, portanto a bateria `npm test` e a compilação completa **não foram executadas aqui**.
