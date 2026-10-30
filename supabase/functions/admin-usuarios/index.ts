// Funcao admin-usuarios — cadastro de usuarios pelo ADMINISTRADOR e pelo MASTER do Painel Cia Beauty.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const ABAS = ["inicio", "entregas", "simulador", "produtos", "carteira", "compras", "notas", "vendas", "estoque"];
const PAPEIS = ["admin", "master", "editor", "leitor"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, service, { auth: { persistSession: false } });

    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: quem, error: e1 } = await admin.auth.getUser(token);
    if (e1 || !quem?.user) return json({ erro: "Sessão inválida. Entre de novo." }, 401);
    const { data: perfil } = await admin.from("perfis").select("papel, ativo").eq("user_id", quem.user.id).maybeSingle();
    if (!perfil || !perfil.ativo || !["admin", "master"].includes(perfil.papel)) return json({ erro: "Só o administrador ou o master podem gerenciar usuários." }, 403);
    const souAdmin = perfil.papel === "admin";
    // master não cria, altera nem exclui administradores
    const alvoEhAdmin = async (id: string) => {
      const { data } = await admin.from("perfis").select("papel").eq("user_id", id).maybeSingle();
      return data?.papel === "admin";
    };

    const body = await req.json();
    const acao = body.acao;
    const limpaAbas = (a: unknown) => Array.isArray(a) ? a.filter((x) => ABAS.includes(String(x))) : ABAS;

    if (acao === "listar") {
      const { data, error } = await admin.from("perfis").select("*").order("criado_em");
      if (error) throw error;
      return json({ usuarios: data });
    }

    if (acao === "criar") {
      const email = String(body.email || "").trim().toLowerCase();
      const senha = String(body.senha || "");
      const papel = PAPEIS.includes(body.papel) ? body.papel : "leitor";
      if (papel === "admin" && !souAdmin) return json({ erro: "Só o administrador do sistema pode criar outro administrador." }, 403);
      if (!email.includes("@")) return json({ erro: "E-mail inválido." }, 400);
      if (senha.length < 8) return json({ erro: "A senha precisa ter pelo menos 8 caracteres." }, 400);
      const { data: novo, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
      if (error) return json({ erro: error.message.includes("already") ? "Esse e-mail já está cadastrado." : error.message }, 400);
      const { error: e2 } = await admin.from("perfis").upsert({
        user_id: novo.user!.id, email, nome: String(body.nome || "").trim(), papel, abas: limpaAbas(body.abas), ativo: true,
      });
      if (e2) throw e2;
      return json({ ok: true });
    }

    if (acao === "atualizar") {
      const id = String(body.user_id || "");
      if (id === quem.user.id && (body.papel && body.papel !== perfil.papel || body.ativo === false))
        return json({ erro: "Você não pode alterar o seu próprio papel nem se desativar." }, 400);
      if (!souAdmin && (await alvoEhAdmin(id) || body.papel === "admin"))
        return json({ erro: "Só o administrador do sistema pode alterar administradores." }, 403);
      const upd: Record<string, unknown> = {};
      if (body.nome !== undefined) upd.nome = String(body.nome).trim();
      if (body.papel !== undefined && PAPEIS.includes(body.papel)) upd.papel = body.papel;
      if (body.abas !== undefined) upd.abas = limpaAbas(body.abas);
      if (body.ativo !== undefined) upd.ativo = !!body.ativo;
      const { error } = await admin.from("perfis").update(upd).eq("user_id", id);
      if (error) throw error;
      if (body.ativo !== undefined) await admin.auth.admin.updateUserById(id, { ban_duration: body.ativo ? "none" : "876000h" });
      return json({ ok: true });
    }

    if (acao === "senha") {
      if (!souAdmin && await alvoEhAdmin(String(body.user_id || ""))) return json({ erro: "Só o administrador do sistema pode alterar administradores." }, 403);
      const senha = String(body.senha || "");
      if (senha.length < 8) return json({ erro: "A senha precisa ter pelo menos 8 caracteres." }, 400);
      const { error } = await admin.auth.admin.updateUserById(String(body.user_id), { password: senha });
      if (error) return json({ erro: error.message }, 400);
      return json({ ok: true });
    }

    if (acao === "excluir") {
      const id = String(body.user_id || "");
      if (id === quem.user.id) return json({ erro: "Você não pode excluir o seu próprio usuário." }, 400);
      if (!souAdmin && await alvoEhAdmin(id)) return json({ erro: "Só o administrador do sistema pode excluir administradores." }, 403);
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) return json({ erro: error.message }, 400);
      return json({ ok: true });
    }

    return json({ erro: "Ação desconhecida." }, 400);
  } catch (err) {
    return json({ erro: String((err as Error)?.message || err) }, 500);
  }
});
