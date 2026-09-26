# Validação da entrega local

Data: 19/09/2026.

## Automação

- **13 testes de integração aprovados**, executados com `npm test` em banco e pasta de uploads temporários.
- Sintaxe JavaScript validada com `node --check`.
- Iniciador PowerShell validado pelo parser da linguagem.
- `npm audit --omit=dev`: nenhuma vulnerabilidade encontrada nas dependências de execução na data do teste.

## Navegador

- Entrada de espectador, seleção de perfil, busca por título, adicionar à lista e visualizar lista.
- Player de demonstração carregado com duração de 12 segundos e `readyState=4`.
- Sessão e dados preservados após reiniciar o servidor.
- Login da produtora, dashboard e editor de produção.
- Criação pela interface de um projeto temporário com duas temporadas e dois episódios por temporada.
- Upload pela interface da capa da produção, capa da temporada, capa do episódio e vídeo MP4. Duração detectada: 12 segundos.
- Projeto publicado **somente no catálogo local**, disponível nos detalhes para espectadores. Episódio enviado reproduzido até o fim; episódio sem arquivo indicado como Em breve.
- Projeto temporário retirado pela API após a validação. Mídias físicas de teste preservadas pela política do aplicativo.
- Revisão visual desktop e largura mobile de 390 px. Área de conteúdo reportada em 375 px, sem rolagem horizontal, tanto no catálogo quanto na produtora.
- Correção de evento tardio do player ao fechar, evitando acesso a estado já limpo.

Nenhum deploy externo foi realizado. Capacidade máxima de upload de 2 GB configurada, mas os testes usaram um clipe pequeno; não foi realizado teste de carga ou upload de 2 GB.

## Correção de independência das capas — 19/09/2026

- Corrigido descarte da capa pendente da temporada quando o salvamento do desenho recriava o editor. Rascunhos agora são separados por formulário e identificador.
- Endpoint da temporada preserva a capa quando uma atualização não envia esse campo.
- **16 testes aprovados**: 14 de integração e 2 de preservação dos formulários no DOM. Casos novos cobrem capas distintas de desenho, duas temporadas e episódio; alteração apenas do título; salvar em ordens diferentes e trocar temporadas.
- Conferência em navegador com banco isolado na porta 3211: upload de Bosque na temporada e Neon no desenho, salvamento do desenho antes da temporada, verificação das duas prévias, salvamento da temporada e recarregamento. Todas as comparações de URL permaneceram corretas e distintas.
- Dados e imagens do projeto real do usuário não foram modificados pelos testes.
