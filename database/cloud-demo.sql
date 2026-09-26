-- Introductory examples use only versioned public assets from the repository.
INSERT INTO public.nexus_projects
  (id,title,description,genre,genres,rating,year,cover,banner,status,featured,demo)
VALUES
  ('aurora','Aurora: além do portal','Quando uma misteriosa luz atravessa o céu, Lia e seu pequeno companheiro descobrem que o universo é muito maior do que imaginavam. Uma jornada sobre coragem, amizade e os mundos que existem dentro de nós.','Aventura','["Aventura"]','10',2026,'/assets/aurora.png','/assets/aurora.png','published',true,true),
  ('orbita','Órbita 9','Uma tripulação improvável. Uma nave com personalidade. E uma galáxia inteira para se perder. Embarque nesta aventura fora de órbita.','Ficção científica','["Ficção científica"]','L',2026,'/assets/orbita.png','/assets/orbita.png','published',false,true),
  ('bosque','O segredo do bosque','Uma raposinha e uma guardiã da floresta precisam encontrar a última semente de luz antes que a magia do bosque desapareça.','Fantasia','["Fantasia"]','L',2026,'/assets/bosque.png','/assets/bosque.png','published',false,true),
  ('neon','Neon Rush','Nas pistas de uma cidade que nunca apaga, uma jovem piloto descobre que sua maior corrida começa fora do asfalto.','Ação','["Ação"]','12',2026,'/assets/neon.png','/assets/neon.png','published',false,true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.nexus_seasons (id,"projectId",number,title,cover)
SELECT id || '-season-1',id,1,'O início de tudo',cover FROM public.nexus_projects WHERE demo=true
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.nexus_episodes (id,"seasonId",number,title,description,cover,video,duration)
SELECT s.id || '-episode-' || n::text,s.id,n,
  CASE n WHEN 1 THEN 'O chamado' WHEN 2 THEN 'Um novo horizonte' ELSE 'Além do possível' END,
  'Prévia visual demonstrativa da plataforma. Substitua este arquivo pelo episódio original no painel da produtora.',
  s.cover,'/assets/demo.mp4',12
FROM public.nexus_seasons s JOIN public.nexus_projects p ON p.id=s."projectId"
CROSS JOIN generate_series(1,3) n WHERE p.demo=true
ON CONFLICT (id) DO NOTHING;
