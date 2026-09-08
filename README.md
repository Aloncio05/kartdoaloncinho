# Kart do Aloncinho

Jogo de kart 3D para navegador, com salas online de até 8 jogadores, três voltas e um circuito original inspirado em corridas arcade.

## Jogar localmente

Requer Node.js 22.13 ou superior.

```sh
npm ci
npm run server
```

Em outro terminal:

```sh
npm run dev
```

Abra http://127.0.0.1:5173. O modo treino funciona sem servidor. Para testar salas localmente, abra navegadores/perfis diferentes ou abas independentes. São oito vagas por sala; CPUs preenchem as vagas restantes se o anfitrião habilitar a opção.

## Comandos

| Ação | Teclado | Controle padrão Xbox / equivalente |
|---|---|---|
| Acelerar | W ou seta para cima | RT ou A |
| Frear | S ou seta para baixo | LT ou B |
| Virar | A/D ou setas | Analógico esquerdo |
| Derrapar | Espaço ou Shift esquerdo | RB |
| Usar item | E ou X | X |
| Pausar treino | P ou Esc | Start |

Conecte um controle reconhecido pelo navegador e pressione um botão. O mapeamento usa a Gamepad API padrão; controles sem mapeamento padrão podem exigir configuração no sistema. Em dispositivos touch, botões de direção e ação aparecem na tela. O modo online não pausa a corrida para os outros jogadores.

## Salas e personalização

1. Personalize nome, cor do kart e capacete na garagem.
2. Crie uma sala e compartilhe seu convite ou código de seis caracteres.
3. Os amigos entram pelo convite ou por “Entrar em uma sala”.
4. Cada jogador confirma “Estou pronto”. O anfitrião inicia a corrida.
5. Complete três voltas. O servidor espera todos os humanos terminarem, até o limite de sete minutos, e libera a revanche.

São quatro itens: turbo, escudo, óleo e pulso (atinge o adversário à frente em até 150 metros). Derrapagens carregadas geram mini turbo ou super turbo ao soltar o comando. A física inclui aceleração, frenagem, perda de velocidade fora da pista e contato entre karts.

## Publicar

**Um site estático não serve.** As salas precisam de um servidor Node rodando; em hospedagem estática o botão "Criar sala online" nunca conecta. É por isso que existem os dois caminhos abaixo — o primeiro é o recomendado.

### Caminho recomendado: só o Render (um serviço, sem variável nenhuma)

O mesmo serviço serve o jogo e as salas, então não há duas URLs para combinar e nada para configurar errado.

No Render: **New > Blueprint**, conecte este repositório, branch `main`, e confirme. O `render.yaml` já traz tudo:

- Build: `npm ci --include=dev --ignore-scripts && npm run build`
- Start: `npm run server`
- Health check: `/health`

A URL que o Render devolver (`https://...onrender.com`) já é o jogo completo. Não preencha `CLIENT_ORIGIN`: sem ela o servidor aceita a própria origem, que é o caso aqui.

Se preferir criar como **Web Service** na mão, use exatamente os comandos acima. O `--include=dev` é obrigatório: com `NODE_ENV=production` o npm pularia o Vite e o build falharia.

### Caminho alternativo: Vercel (front) + Render (servidor)

Só vale a pena se você quiser o carregamento inicial mais rápido da Vercel. Exige acertar duas variáveis, nesta ordem:

1. Publique o servidor no Render (acima) e copie a URL.
2. Na Vercel, importe o mesmo repositório (framework Vite, raiz do projeto) e defina `VITE_SERVER_URL` com a URL do Render, sem barra final.
3. Copie a URL da Vercel e defina `CLIENT_ORIGIN` no Render com ela, sem barra final. Para vários domínios, separe por vírgula. Não use `*`.
4. Faça deploy de novo na Vercel — o Vite embute `VITE_SERVER_URL` durante o build.

Esquecer o passo 3 ou 4 é o erro clássico: o site abre normalmente e ninguém consegue entrar na sala.

### Conferência após publicar

- A URL publicada seguida de `/health` deve responder `{"ok":true,...}`.
- Abra a URL em dois dispositivos/redes, crie uma sala e entre pelo convite.
- Confirme personalização, pronto, largada, posições e uso de itens sincronizados.
- Faça uma corrida com oito conexões simultâneas antes de anunciar o jogo.
- Teste em um celular deitado: os botões de direção e ação precisam aparecer.

## Operação e limites

- O servidor é autoritativo: clientes enviam comandos; o servidor calcula posições, colisões, itens, tempo e resultado a 60 Hz, com snapshots a 20 Hz.
- O cliente interpola os snapshots. A resposta online depende da latência até o servidor; escolha uma região próxima dos jogadores.
- A sessão guarda um token aleatório no sessionStorage. Quem cai durante a corrida tem dois minutos para voltar e retomar o kart; enquanto estiver fora, a CPU assume, para a corrida não travar esperando. No lobby a espera é de 20 segundos: passado isso a vaga é liberada, o anfitrião passa para outro jogador e quem caiu pode entrar de novo pelo código.
- A reconexão é ilimitada: se o servidor reiniciar ou a rede oscilar, o cliente continua tentando até voltar. Se a sala tiver expirado nesse meio-tempo, o jogo avisa e volta ao menu.
- As salas ficam na memória de uma única instância. Reiniciar ou fazer deploy do servidor encerra as partidas em andamento. Não aumente para múltiplas instâncias sem implementar armazenamento e coordenação compartilhados.
- No plano gratuito do Render pode haver suspensão por inatividade e espera na primeira conexão. Disponibilidade contínua exige um plano adequado, contratado pelo titular da conta.
- Gráficos usam WebGL 2 e aceleração de hardware. A qualidade segue uma direção própria de corrida cartoon; não usa personagens ou arquivos da Nintendo.
- O uso de WebMCP é opcional e detectado no navegador. Sua ausência não impede o jogo.

## Verificação

```sh
npm test
npm run lint
npm run build
```

A suíte verifica direção no referencial da câmera, teclado/controle, freio, saída de pista, drift, itens, três voltas, pilotos CPU e conclusão online. Um teste de integração abre nove conexões Socket.IO reais para validar oito jogadores simultâneos, rejeição do nono, permissões do anfitrião, personalização, sincronização, entradas inválidas e reconexão.

Testes locais não substituem a validação no endereço publicado nem uma sessão com controles físicos e oito pessoas em redes distintas.
