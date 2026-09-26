# P.A Nexus Studio

Plataforma local de streaming e gestão de produções de animação. Identidade visual em preto, branco e roxo inspirada na marca fornecida.

## Abrir

Clique duas vezes em **Iniciar Nexus.cmd**. O iniciador abre o site e mantém o servidor em segundo plano, sem janela extra. Se o servidor já estiver funcionando, apenas abre a plataforma.

- Site: http://127.0.0.1:3210
- Produtora: http://127.0.0.1:3210/#studio
- Requisito: Node.js 24 ou superior.
- Pela linha de comando: `npm ci` (na primeira vez) e `npm start`.
- Desenvolvimento: `npm run dev`.
- Testes: `npm test`.

## Acessos locais

A tela de entrada possui botões para experimentar as contas de demonstração sem digitar credenciais.

| Acesso     | E-mail                  | Senha            |
| ---------- | ----------------------- | ---------------- |
| Produtora  | studio@panexus.local    | NexusStudio@2026 |
| Espectador | visitante@panexus.local | NexusPlay@2026   |

Também é possível criar contas de espectador pela interface. Cada conta aceita até cinco perfis, com listas e histórico independentes. A conta da produtora também pode assistir ao catálogo.

## Criar sua produção

1. Abra **Área da produtora → Entrar na produtora** e entre na conta de demonstração da produtora.
2. Clique em **Novo projeto**. Defina título, sinopse, um ou mais gêneros (incluindo Terror), classificação, quantidade de temporadas e episódios por temporada. A estrutura é criada automaticamente como rascunho.
3. Em **Gerenciar produção**, configure a capa do desenho, a imagem de destaque e as informações gerais. Clique em **Salvar alterações**.
4. Selecione uma temporada, envie sua capa e salve a temporada.
5. Use o ícone de edição de cada episódio para definir título, descrição, capa e vídeo. Aguarde o envio terminar e clique em **Salvar episódio**. A duração é preenchida quando o navegador reconhece o vídeo.
6. Clique em **Publicar no catálogo** ou preencha **Data programada** para publicação automática na data escolhida. É necessário ao menos um episódio com vídeo. Sem vídeo, o projeto aguarda em rascunho e será publicado depois que um vídeo for salvo. Os episódios ainda sem vídeo aparecem como **Em breve**.
7. Abra **Ver plataforma** para assistir. **Publicar no catálogo** altera somente o catálogo neste computador; não realiza deploy externo.

Temporadas e episódios podem ser adicionados posteriormente. Exclusões pedem confirmação. Um projeto pode voltar a rascunho para sair da vitrine.

A **Data de lançamento** pode ser editada ou removida a qualquer momento. Na publicação automática, ela é preenchida com a data efetiva se estiver vazia. Para cancelar uma programação, limpe **Data programada** e salve. O agendamento segue o calendário de São Paulo e é verificado pelo servidor a cada minuto e também ao abrir o catálogo.

Remover o último vídeo de uma produção a retorna automaticamente para rascunho. Marcar um desenho como destaque substitui o destaque anterior.

As capas do desenho, de cada temporada e de cada episódio são independentes. Salvar o desenho preserva alterações pendentes da temporada, e vice-versa. As alterações pendentes também são preservadas ao trocar de temporada dentro da página; salve cada formulário antes de recarregar ou fechar o navegador.

## Arquivos e persistência

- Banco de dados: `data/nexus.sqlite`, criado automaticamente.
- Uploads: `data/uploads/`, com nomes gerados pelo servidor.
- Capas: JPG, PNG ou WebP, até 10 MB por arquivo.
- Vídeos: MP4 ou WebM, até 2 GB por arquivo. Recomendado: MP4 com H.264/AAC.
- O envio possui barra de progresso. Arquivos enviados são aplicados à produção ao salvar o respectivo formulário.
- Contas, perfis, lista, posição de reprodução e produções permanecem após reiniciar.
- Para backup, pare o servidor e copie a pasta `data` inteira. Para restaurar, recoloque a pasta com o servidor parado.
- Exclusões retiram registros do catálogo, mas preservam arquivos físicos enviados para evitar apagar mídias acidentalmente. Eles podem continuar ocupando espaço no disco.

## Publicação no Render e Supabase

A versão publicada usa `server-cloud.js` no plano gratuito do Render. Dados ficam no PostgreSQL do Supabase e mídias no bucket privado `nexus-media`; o navegador recebe URLs temporárias apenas para arquivos vinculados a projetos publicados ou para a produtora autenticada. A versão local continua usando SQLite e a pasta `data`.

O `render.yaml` define o serviço Node com `npm ci`, `npm run start:cloud` e verificação em `/api/health`. No Render, configure como segredos `DATABASE_URL` (pooler de sessão do Supabase), `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `STUDIO_EMAIL` e `STUDIO_PASSWORD` (ao menos 12 caracteres). Nenhum desses valores deve entrar no Git. O primeiro início cria a conta da produtora com essas credenciais; o cadastro público cria somente espectadores. Se a senha da produtora mudar depois, altere-a também no banco, pois mudar só a variável de ambiente não redefine uma conta já criada.

As migrações do banco estão em `database/cloud.sql`, `database/cloud-access.sql` e `database/cloud-demo.sql`. Após configurar as variáveis necessárias nesta máquina, `node scripts/migrate-local-to-cloud.mjs` copia projetos locais publicados e suas mídias referenciadas, sem copiar contas, sessões, perfis ou histórico pessoal. O script pula projetos que já existem no destino e não apaga o banco local.

No plano gratuito, cada upload de mídia está limitado a 50 MiB, com até 1 GB de armazenamento de arquivos e franquias de tráfego. O Render pode dormir após 15 minutos sem visitas; a primeira abertura pode demorar. Essa configuração é adequada para um lançamento pequeno e deve ser revista se houver muitos espectadores ou episódios grandes.

### Endereço gratuito no Cloudflare Pages

O projeto Pages `pa-nexus-studio` é separado do Hub Central e usa a pasta `public` do repositório como saída estática. O endereço gratuito é `https://pa-nexus-studio.pages.dev`; não requer domínio comprado. As Functions encaminham `/api/*` e `/uploads/*` ao serviço Node do Nexus no Render; o último caminho devolve o redirecionamento temporário do Storage privado. Configure `BACKEND_ORIGIN` no Pages com a URL HTTPS desse serviço, sem barra final, e `PUBLIC_ORIGIN=https://pa-nexus-studio.pages.dev` no Render. O arquivo `public/_routes.json` restringe as invocações da função a essas rotas. Sem `BACKEND_ORIGIN`, a interface carrega, mas login, catálogo e painel retornam indisponibilidade.

## Catálogo de exemplo

Aurora: além do portal, Órbita 9, O segredo do bosque e Neon Rush são produções fictícias de demonstração. As quatro artes foram geradas para este projeto. Todos os episódios iniciais usam uma prévia visual silenciosa de 12 segundos, criada a partir da ilustração de Aurora; não são episódios completos. Substitua ou exclua os exemplos pelo painel.

A marca original está em `public/assets/brand.jpeg`. A origem e os prompts das ilustrações estão em `docs/artes.md`.

## Escopo desta entrega

Versão funcional para uso local, sem hospedagem, assinatura, cobrança, envio de e-mails, recuperação de senha, DRM ou transcodificação automática. O servidor escuta apenas em `127.0.0.1`; o acesso em celular foi validado por simulação de tamanho de tela. Para disponibilizar na internet, é necessário configurar infraestrutura, HTTPS, contas reais de administração e armazenamento apropriado. As credenciais e os botões demonstrativos são intencionais nesta versão local.

Arquitetura e regras permanentes: `docs/arquitetura.md`. A memória operacional Bruno–Codex é mantida fora do repositório.
