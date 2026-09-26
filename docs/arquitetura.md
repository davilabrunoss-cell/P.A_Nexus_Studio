# Arquitetura e regras da P.A Nexus Studio

## Componentes

- **Servidor:** Node.js 24, Express 5, API JSON e arquivos estáticos em um único processo. Porta padrão 3210, interface de loopback 127.0.0.1. Variáveis opcionais: `PORT` e `DATA_DIR`.
- **Dados:** SQLite nativo (`node:sqlite`), chaves estrangeiras e WAL. Sem serviço de banco externo.
- **Interface:** HTML, CSS e JavaScript nativos, rotas por hash, sem etapa de compilação. Todos os recursos de execução são locais.
- **Mídia:** Multer recebe o arquivo em disco; o cabeçalho binário é verificado antes de atribuir uma extensão segura. Express oferece HTTP Range para avançar e retomar vídeos.
- **Nuvem:** `server-cloud.js` mantém a mesma API sobre PostgreSQL do Supabase; Render executa o processo em `0.0.0.0:$PORT`. Capas e vídeos são enviados ao bucket privado do Supabase e entregues por redirecionamento assinado após checar publicação ou papel de produtora. O fluxo local acima permanece independente.

## Modelo

`users → profiles → favorites / progress`; `projects → seasons → episodes`.

- Contas têm papel `viewer` ou `producer`. O cadastro público cria somente espectadores.
- Sessões duram sete dias e ficam no banco. Cookie HttpOnly e SameSite Strict. Senhas são protegidas com scrypt e salt individual.
- O servidor verifica propriedade do perfil para lista e progresso. Trocar o identificador de perfil no cliente não concede acesso aos dados de outra conta.
- Até cinco perfis por conta. Cores disponíveis: violet, coral, mint e blue.
- Catálogo público contém somente projetos com status `published`. APIs de administração e uploads exigem papel producer.
- Na nuvem, as tabelas `nexus_*` têm RLS ativo. `anon` e `authenticated` não têm acesso direto; apenas o usuário PostgreSQL `nexus_app` usado pelo backend possui grants e política de acesso. A chave secreta do Supabase fica só no servidor Render. A conta da produtora é criada no primeiro início por variáveis protegidas; as credenciais demonstrativas locais não são criadas na nuvem.
- Publicação exige ao menos um vídeo vinculado. Temporadas ordenadas por número; episódios ordenados por número. Um novo número usa o maior número existente mais um, preservando a numeração após exclusões.
- Cada projeto possui de 1 a 12 gêneros, armazenados como JSON; `genre` preserva o primeiro gênero para compatibilidade com os registros anteriores. O catálogo filtra e pesquisa todos os gêneros de cada projeto.
- `releaseDate` e `scheduledDate` são datas independentes no formato ISO. A primeira pode ser alterada na produtora; a segunda publica rascunhos automaticamente na data de São Paulo quando há pelo menos um episódio com vídeo. A verificação ocorre a cada minuto e nas leituras do catálogo e da lista da produtora. Sem vídeo, o rascunho permanece pendente. Ao publicar automaticamente, uma data de lançamento vazia recebe a data efetiva. Voltar manualmente para rascunho cancela a data programada para evitar republicação imediata.
- Bancos existentes recebem as novas colunas por migração aditiva. Gêneros antigos são preservados como lista com um item; datas exatas antigas ficam vazias em vez de receber uma data inventada.
- Remover o último vídeo disponível, seu episódio ou sua temporada retorna automaticamente o projeto a rascunho. Selecionar um projeto como destaque desmarca o destaque anterior; os demais continuam acessíveis no seletor da vitrine.
- Criação inicial aceita 1 a 20 temporadas e 1 a 100 episódios por temporada. A criação da estrutura é transacional.
- O player salva aproximadamente a cada três segundos e também ao pausar, encerrar ou fechar. Conteúdo com 95% ou mais assistido é considerado concluído para a prateleira de continuação; a próxima reprodução começa do início.
- A escolha do perfil usa localStorage apenas como preferência. Dados de conta, lista e progresso pertencem ao banco, não ao armazenamento local do navegador.
- Capas e vídeos de rascunhos enviados pelo usuário não são servidos publicamente. A produtora pode acessá-los enquanto edita; mídias vinculadas a projetos publicados ficam disponíveis ao catálogo.
- Capas de desenho, temporada e episódio são independentes. Alterações pendentes dos formulários do desenho e de cada temporada são preservadas em memória, por tipo e identificador, ao salvar outro formulário ou trocar de temporada. Cada formulário continua exigindo seu próprio salvamento; recarregar a página descarta alterações ainda não salvas. Atualizar somente o título da temporada preserva sua capa existente.
- Durante uploads no editor, salvamentos e navegação por botões aguardam o término do envio para evitar descartar o formulário que recebe o arquivo.
- Exclusão de projeto ou temporada remove os registros dependentes por cascata. Arquivos físicos são preservados; limpar mídia órfã exige manutenção explícita.

## Proteções e limites

Escape de conteúdo exibido em HTML; consultas SQL parametrizadas; URLs de mídia restritas a recursos locais; verificação de origem em requisições que alteram estado; limitação de tentativas de login; limites de tamanho e validação do tipo de upload; proteção contra acesso cruzado a perfis.

O player depende dos codecs do navegador. Não há conversão automática, HLS nem fila de processamento. Na versão local, uploads abandonados permanecem no disco e existem contas demonstrativas conhecidas.

Na nuvem, o banco e as mídias persistem fora do Render. O upload em memória é limitado a 50 MiB por arquivo e a chave do Storage não é enviada ao navegador. URLs assinadas de mídia duram uma hora; referências de rascunhos não são disponibilizadas a espectadores. O plano gratuito pode adormecer e impõe cotas de armazenamento e tráfego. Não há transcodificação automática nem DRM.

O endereço público gratuito `pa-nexus-studio.pages.dev` pertence a um projeto Cloudflare Pages exclusivo deste repositório. O Pages serve os arquivos de `public` e sua Function encaminha apenas `/api/*` ao serviço Node próprio no Render. O navegador permanece na origem do Pages; o backend aceita essa origem por `PUBLIC_ORIGIN`, além da origem direta do Render. `BACKEND_ORIGIN` fica nas variáveis do projeto Pages. Nenhuma configuração do Hub Central é compartilhada ou alterada.

## Testes

`npm test` inicia outro servidor com banco e uploads temporários. Verifica catálogo, HTTP Range, autenticação e autorização, criação em lote, rascunhos, imagens e vídeos reais, publicação, lista, progresso, isolamento entre perfis, origem, caminhos de mídia e exclusão em cascata. Os dados do usuário não são utilizados pelos testes.
