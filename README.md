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

## Publicar no Render + Vercel

O frontend é estático, gerado pelo Vite. A sincronização usa um servidor Node/Socket.IO separado. Não publique o servidor como Static Site ou função efêmera da Vercel.

### 1. Servidor no Render

Crie **New > Web Service** e conecte este repositório:

- Nome sugerido: `kartdoaloncinho-server`
- Branch: `main`
- Runtime: Node
- Build command: `npm ci --omit=dev --ignore-scripts`
- Start command: `npm run server`
- Health check: `/health`
- Variável `CLIENT_ORIGIN`: a origem exata do site Vercel, sem barra final. Exemplo de formato: `https://seu-projeto.vercel.app`.

O arquivo `render.yaml` também permite criar o serviço via Blueprint. Copie a URL HTTPS realmente retornada pelo Render.

### 2. Frontend na Vercel

Importe o mesmo repositório, use a raiz e o framework Vite. O `vercel.json` define:

- Build: `npm run build`
- Saída: `dist`
- Variável `VITE_SERVER_URL`: URL HTTPS do servidor Render, sem barra final.

Depois de obter o endereço definitivo da Vercel, configure esse valor em `CLIENT_ORIGIN` no Render. Se você alterar `VITE_SERVER_URL`, faça um novo deploy na Vercel; o Vite incorpora essa variável durante o build. Para autorizar múltiplas origens, separe-as por vírgula. Não use `*`.

### 3. Conferência após publicar

- A URL do Render seguida de `/health` deve responder `{"ok":true,...}`.
- Abra a URL da Vercel em dois dispositivos/redes, crie uma sala e entre pelo convite.
- Confirme personalização, pronto, largada, posições e uso de itens sincronizados.
- Faça uma corrida com oito conexões simultâneas antes de anunciar o jogo.

## Operação e limites

- O servidor é autoritativo: clientes enviam comandos; o servidor calcula posições, colisões, itens, tempo e resultado a 60 Hz, com snapshots a 20 Hz.
- O cliente interpola os snapshots. A resposta online depende da latência até o servidor; escolha uma região próxima dos jogadores.
- A sessão guarda um token aleatório no sessionStorage e permite reconexão por até dois minutos. Após saída voluntária, a vaga na corrida vira CPU. Ao recarregar a página, a conexão é retomada automaticamente.
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
