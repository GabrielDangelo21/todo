# Constância

Aplicativo pessoal de tarefas e constância para manter uma rotina equilibrada entre várias áreas da vida — por exemplo holandês, agência de viagens, impressão 3D e pedidos de pães. A ideia é facilitar fazer **um pouco de cada área todos os dias**, mesmo quando um projeto novo chama muita atenção.

Funciona no navegador do computador, sem conta e sem servidor. Os dados ficam guardados localmente (IndexedDB) e podem ser exportados como cópia de segurança.

## Funcionalidades

- **Hoje** — tela inicial com prazos vencidos e próximos (7 dias), pendências de dias anteriores agrupadas por área, atividades planejadas para hoje e concluídas no dia. O topo mostra os minutos ainda previstos e os minutos registrados.
- **Três tipos de tarefa** — pontual (com ou sem prazo), repetição em dias específicos da semana, ou meta de X vezes por semana.
- **Pendências sem cópias** — uma ocorrência não feita continua pendente nos dias seguintes, mostrando desde quando está aberta. Pode ser concluída, adiada ou ignorada; nada é descartado automaticamente.
- **Adiantar tarefas** — fazer hoje uma atividade prevista para outro dia; ela conta na semana e não reaparece no dia original.
- **Cronômetro persistente** — iniciar, pausar, retomar e concluir. Só um cronômetro ativo por vez. O tempo é calculado a partir dos horários gravados, então sobrevive a recarregar a página ou fechar a aba. Também é possível registrar e corrigir tempo manualmente.
- **Lembretes** — avisos na página e notificações do navegador enquanto o aplicativo está aberto. Avisos que venceram com o navegador fechado aparecem no resumo da próxima abertura.
- **Projetos e hábitos** — lista por área com filtros (todas, recorrentes, pontuais, concluídas, arquivadas), próximas datas e progresso recente.
- **Histórico** — dias da semana com o que foi concluído, o tempo registrado e o que ficou pendente, além de um resumo semanal de cada tarefa recorrente em relação à meta.
- **Configurações** — início da semana, notificações, gerenciamento de áreas (renomear, ocultar, reordenar, adicionar), exportação e importação de backup em JSON.
- **Funciona offline** depois do primeiro carregamento e pode ser instalado como aplicativo (PWA).

## Como executar

Requisitos: [Node.js](https://nodejs.org/) 20 ou mais recente.

```bash
npm install
npm run dev
```

Abra o endereço mostrado no terminal (normalmente `http://localhost:5173`).

### Outros comandos

| Comando | O que faz |
|---|---|
| `npm run build` | Verifica os tipos e gera a versão de produção em `dist/` |
| `npm run preview` | Serve localmente a versão de produção |
| `npm test` | Roda os testes automáticos |
| `npm run typecheck` | Só verifica os tipos do TypeScript |

Para instalar como aplicativo, abra a versão de produção (`npm run build` e `npm run preview`) no Chrome ou Edge e use a opção **Instalar aplicativo** da barra de endereços.

## Seus dados

- Tudo fica **apenas no navegador deste computador**. Nada é enviado para servidores externos.
- Limpar os dados do site ou trocar de perfil do navegador apaga as informações. Por isso, exporte uma cópia de segurança regularmente em **Configurações → Exportar dados**; o aplicativo mostra a data do último backup e lembra quando ele estiver antigo.
- A importação é integral: ela valida o arquivo, mostra o que será substituído e oferece baixar uma cópia dos dados atuais antes de trocar.

## Estrutura do projeto

```
src/
├── domain/        Regras puras, sem interface (testáveis)
│   ├── types.ts       Modelos: Área, Tarefa, Ocorrência, Sessão, Aviso, Preferências
│   ├── planning.ts    Geração de ocorrências, tela Hoje, atrasos, resumo semanal
│   ├── timer.ts       Cálculo de tempo a partir dos horários gravados
│   ├── reminders.ts   Quais lembretes estão vencidos e não foram exibidos
│   ├── backup.ts      Formato e validação do arquivo de backup
│   ├── defaults.ts    Áreas iniciais, criação e edição de tarefas
│   └── dates.ts       Datas locais e formatação em português
├── data/          Persistência e estado
│   ├── db.ts          Acesso ao IndexedDB
│   └── store.tsx      Estado do aplicativo e ações
├── ui/            Diálogos, avisos, lembretes e ações compartilhadas
├── views/         Telas: Hoje, Projetos e hábitos, Histórico, Configurações
└── tests/         Testes dos critérios de aceitação
```

A lógica de recorrência e atrasos fica separada da interface, o que facilita os testes e uma futura sincronização. Cada registro tem identificador estável e data de alteração.

## Testes

Os testes em `src/tests/` cobrem os critérios de aceitação da primeira versão:

1. Tarefa diária de 15 minutos aparece em Hoje, é cronometrada e vai para o histórico.
2. Tarefa de segunda, quarta e sexta só é planejada nesses dias e reaparece como pendente se não for feita.
3. Meta de 3 vezes por semana reduz o saldo a cada conclusão, e uma atividade antecipada não cria duplicidade.
4. Tarefa com prazo aparece antes, fica atrasada depois e gera aviso com o aplicativo aberto.
5. Cronômetro pausado, recarregado e retomado sem perda nem contagem duplicada.
6. Após dias sem abrir, o resumo mostra prazos e pendências sem descartar nada.
7. Exportar, limpar e importar restaura todos os dados sem alterações.

## Tecnologias

React 19, TypeScript, Vite, IndexedDB e Vitest (com `fake-indexeddb` nos testes).

## Próximos passos

A sincronização com o celular fica para uma etapa posterior. Ela exigirá escolher onde hospedar os dados, como autenticar o usuário e como resolver alterações feitas em dois aparelhos.
