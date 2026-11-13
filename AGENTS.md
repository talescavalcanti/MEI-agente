# MEIagente — instruções para agentes

Vale para toda mudança neste repositório, seja funcionalidade nova ou correção de bug, e para qualquer agente (orquestrador ou builder).

## Fluxo de git (obrigatório)

```text
main  ←  developer  ←  feat/<slug> | fix/<slug>
```

1. **Uma mudança = uma branch**, criada a partir de `origin/developer` atualizada.
   - Funcionalidade: `feat/<slug>` (ex.: `feat/t03-clientes`).
   - Correção: `fix/<slug>` (ex.: `fix/whatsapp-duplicado`).
2. **Cada agente trabalha no próprio worktree.** Vários agentes dividem esta pasta, então **nunca** rode `git checkout`/`git switch` em `/Users/talescavalcanti/Desktop/projetos/MEIagente`:

   ```bash
   cd /Users/talescavalcanti/Desktop/projetos/MEIagente
   git fetch origin
   git worktree add ../MEIagente-wt/<slug> -b feat/<slug> origin/developer
   cd ../MEIagente-wt/<slug> && npm ci
   ```

3. **Commits** pequenos, em português, no padrão `tipo: descrição` (`feat`, `fix`, `test`, `docs`, `chore`, `refactor`).
   - **Sem `Co-Authored-By`** e sem nenhuma linha de atribuição a IA, no commit e no PR.
   - Nunca commitar `.env*` (só `.env.example`), segredo, `node_modules` ou `.next`.
4. **Antes de publicar**, na branch: `npm test` passa; se a tarefa mexeu em `src/`, `npm run lint` e `npm run build` também. Saída colada no relatório. Teste falhando não sobe.
5. **Push e merge automáticos, sem pedir confirmação:**

   ```bash
   git fetch origin && git merge origin/developer      # resolve conflito só em arquivo seu
   npm test                                            # de novo, depois do merge
   git push -u origin feat/<slug>
   gh pr create --base developer --head feat/<slug> --title "<tipo>: <descrição>" --body "<o que mudou e como foi verificado>"
   gh pr merge --merge --delete-branch
   ```

   Conflito em arquivo fora da sua fronteira: **pare** e avise o orquestrador, não resolva por conta própria.
6. **Depois do merge**, remova o worktree: `git worktree remove ../MEIagente-wt/<slug>`.
7. **`main` só recebe merge de `developer` quando o dono pedir.** Nunca commit direto em `main` nem em `developer` (exceção: o orquestrador, para plano e instruções).
8. Nunca `push --force`, `reset --hard` em branch compartilhada, nem apagar branch de outro agente.

## Regras do projeto

- O plano é [`docs/superpowers/plans/2026-11-12-mei-agente-mvp.md`](docs/superpowers/plans/2026-11-12-mei-agente-mvp.md). A seção **Global Constraints** vale para toda tarefa. A especificação é o [`README.md`](README.md).
- **Fronteira de arquivos:** mexa só nos arquivos listados na sua tarefa. Precisa de outro? Pergunte ao orquestrador antes.
- `/Users/talescavalcanti/Desktop/projetos/meu-chat` é a base de código de referência: **somente leitura**. Nunca abra o `.env.local` de lá.
- **Sem API do Claude/Anthropic.** O modelo do agente roda pela **Featherless** (API compatível com OpenAI); só `src/lib/agente/llm.ts` conhece o provedor.
- Nada de deploy, de rodar SQL em banco real ou de chamada paga a modelo sem o ok do dono. Testes usam PGlite e LLM falso.
- TDD: teste que falha, implementação mínima, teste que passa, commit.
- Texto de interface em português do Brasil, sem travessão.

## Relatório ao terminar

Avise o orquestrador com `maestri ask "orq MEIagente" "<relatório>"` contendo: branch e link do PR mergeado, arquivos criados/alterados, saída dos comandos de verificação, o que **não** foi verificado e qualquer desvio do plano.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices
<!-- END:nextjs-agent-rules -->
