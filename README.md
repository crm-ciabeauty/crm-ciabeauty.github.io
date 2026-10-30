# Painel Cia Beauty

Painel de projetos, custos, compras, notas XML, vendas e estoque da Cia Beauty.

- **Site:** GitHub Pages (`index.html`, `shell.js`, `app.js`, `config.js`)
- **Banco e login:** Supabase, projeto `cia-beauty` (conta gstsoares27)
- **Estrutura do banco:** `supabase/schema.sql`
- **Função de usuários:** `supabase/functions/admin-usuarios/index.ts`

## Papéis
| Papel | O que faz |
|---|---|
| Administrador do sistema | Tudo, inclusive backup, restauração e administradores |
| Master | Tudo + usuários da equipe (não altera administradores) |
| Editor | Vê e altera |
| Leitor | Só consulta |

## Cuidados do plano gratuito
- **Pausa por inatividade:** `.github/workflows/manter-ativo.yml` chama o banco a cada 3 dias.
- **Backup:** cópia automática diária no banco (14 últimas) + botão "Baixar backup completo" em Configurações (inclui os XMLs). Baixe um por semana e guarde fora do sistema.
- **Tráfego:** os XMLs ficam na tabela `notas_xml` e só são baixados quando alguém abre a nota.
