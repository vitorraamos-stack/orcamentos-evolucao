import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";

const read=(path:string)=>readFileSync(path,"utf8");
const sql=read("supabase/migrations/20261111150000_pwa_v4_operational_push_dispatch.sql");
const handler=read("api/push/dispatch.ts");
const sender=read("api/_shared/push/webPush.ts");
const store=read("api/_shared/push/dispatchStore.ts");
const vercel=JSON.parse(read("vercel.json")) as {
  git:{deploymentEnabled:Record<string,boolean>};crons?:unknown[]
};

describe("PWA V4 2E — contrato de isolamento e segurança",()=>{
  it("adiciona travas no banco desligadas por padrão",()=>{
    expect(sql).toContain("generation_enabled boolean not null default false");
    expect(sql).toContain("delivery_enabled boolean not null default false");
    expect(sql).toContain("values (true, false, false)");
    expect(sql).toContain("alter table private.push_v4_runtime_settings enable row level security");
    expect(sql).toContain("revoke all on private.push_v4_runtime_settings from public, anon, authenticated, service_role");
    expect(sql).toContain("grant select on private.push_v4_runtime_settings to service_role");
    expect(sql).not.toContain("grant update on private.push_v4_runtime_settings");
  });
  it("captura apenas transições canônicas, não um evento fabricado pelo navegador",()=>{
    expect(sql).toContain("after insert or update of art_status on public.os_orders");
    expect(sql).toContain("after insert or update of user_id, scope on public.os_order_assignees");
    expect(sql).toContain("on public.os_installations");
    expect(sql).toContain("new.scheduled_start is distinct from old.scheduled_start");
    expect(sql).toContain("new.team_id is distinct from old.team_id");
    expect(sql).toContain("new.art_status = 'Produzir'");
    expect(sql).toContain("new.art_status = 'Caixa de Entrada'");
    expect(sql).toContain("v_evt.recipient_hint_id");
    expect(sql).toContain("on conflict(source_key) do nothing");
    expect(sql).not.toMatch(/from public\.os_orders_event/i);
  });
  it("revalida permissões e estado antes de inserir e enviar",()=>{
    expect(sql).toContain("public.has_module_access(x.user_id,'hub_os')");
    expect(sql).toContain("public.has_module_access(x.user_id,v_evt.required_module)");
    expect(sql).toContain("o.archived=false");
    expect(sql).toContain("public.has_module_access(s.user_id,n.required_module)");
    expect(sql).toContain("n.recipient_id=s.user_id");
    expect(sql).toContain("s.revoked_at is null");
    expect(sql).toContain("j.status='processing'");
    expect(sql).toContain("v_evt.event_kind='assignment'");
  });
  it("assegura idempotência por evento, usuário e dispositivo, com lease transacional",()=>{
    expect(sql).toContain("on conflict (source_event_id,recipient_id) do nothing");
    expect(sql).toContain("on conflict (notification_id,subscription_id) do nothing");
    expect(sql).toContain("for update skip locked");
    expect(sql).toContain("interval '90 seconds'");
    expect(sql).toContain("when p_outcome='retry' then");
    expect(sql).toContain("p_http_status in (404,410)");
    expect(sql).toContain("attempt_count>=10");
    expect(sql).not.toMatch(/pg_catalog\.(least|greatest)\(/);
  });
  it("cria somente RPCs restritas ao service_role e não faz POST a serviços externos via banco",()=>{
    for (const fn of [
      "push_v4_expand_outbox(integer)","push_v4_job_eligible(uuid)",
      "push_v4_claim_jobs(integer)","push_v4_finish_job(uuid,text,integer)"
    ]){
      expect(sql).toContain("revoke all on function public."+fn);
      expect(sql).toContain("grant execute on function public."+fn+" to service_role");
    }
    expect(sql).toContain("private.push_v4_capture_operational_change()");
    expect(sql).toContain("security definer set search_path = ''");
    expect(sql).not.toMatch(/\bhttp_post\b|\bcron\.schedule\b/);
    expect(sql).not.toMatch(/grant\s+execute[^;]*to authenticated/i);
  });
  it("não ativa execução no browser ou agendamento no Vercel",()=>{
    expect(handler).toContain('PWA_PUSH_DELIVERY_ENABLED !== "true"');
    expect(handler).toContain('PWA_PUSH_GENERATION_ENABLED !== "true"');
    expect(handler).toContain("authorizedCron");
    expect(handler).toContain("store.eligible(job.job_id)");
    expect(sender).toContain('"aes-128-gcm"');
    expect(sender).toContain('redirect: "error"');
    expect(sender).toContain("validPushEndpoint");
    expect(store).toContain('admin.rpc("push_v4_claim_jobs"');
    expect(vercel.git.deploymentEnabled["feat/pwa-v4-event-engine-dispatch-20261111"]).toBe(false);
    expect(vercel.crons??[]).toEqual([]);
  });
});
