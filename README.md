# processo-recolhido

Mod do Claude Code que deixa o chat mais limpo: em cada resposta, todo o
processo (o texto em que o Claude narra o que está fazendo e as chamadas de
ferramenta) fica recolhido numa linha só, com um botão ▼ no canto direito.

```
⚙ Processo · 7 etapas                          ▼
```

- Recolhido por padrão; ▼ abre, ▲ minimiza de novo. Cada resposta abre e fecha sozinha.
- Enquanto o Claude trabalha, a linha mostra "· em andamento…" e a contagem sobe.
- A resposta final nunca é escondida.
- Funciona no app (desktop e celular) e no terminal.

## Instalar

No prompt de uma sessão do Claude Code no terminal:

```
/plugin install processo-recolhido --marketplace eiklucas-maker/claude-processo-recolhido
```

Responda `y` para adicionar o marketplace e escolha o escopo (user).

Pelo shell:

```bash
claude plugin install processo-recolhido --marketplace eiklucas-maker/claude-processo-recolhido
```

No app desktop, onde `/plugin` não roda: clique em + ao lado da caixa de
mensagem, depois Plugins, Add marketplace com
`eiklucas-maker/claude-processo-recolhido`, e então Add plugin.

### Em toda sessão na nuvem (claude.ai/code)

Cada sessão na nuvem começa num computador novo. Para o mod carregar em todas,
coloque esta linha no Setup script do ambiente (menu do ambiente na barra de
título da sessão, depois Edit):

```bash
claude plugin install processo-recolhido --marketplace eiklucas-maker/claude-processo-recolhido || true
```
