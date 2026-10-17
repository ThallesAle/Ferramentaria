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
7. Estorne uma saída: a peça deve permanecer tanto na saída original quanto no estorno, e o estoque deve retornar ao saldo anterior.
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
