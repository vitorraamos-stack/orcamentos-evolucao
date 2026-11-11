import { describe, expect, it } from "vitest";
import {
  canSeeInstallation,
  installationScheduleFingerprint,
  projectNotices,
  type EventRow,
  type InstallationRow,
  type NotificationAudience,
} from "./notificationModel";

const orderId = "123e4567-e89b-42d3-a456-426614174000";
const userId = "123e4567-e89b-42d3-a456-426614174111";
const otherId = "123e4567-e89b-42d3-a456-426614174222";
const now = Date.UTC(2026, 10, 10, 19);
const when = new Date(now - 60_000).toISOString();
const audience: NotificationAudience = {
  userId, canViewArt: false, canViewProduction: false,
  canViewInstallations: false, isManager: false, teamIds: [],
};
const event = (type: string, payload: unknown, id = "11111111-1111-4111-8111-111111111111"): EventRow =>
  ({ id, os_id: orderId, type, payload, created_at: when });
const installation: InstallationRow = {
  id: "22222222-2222-4222-8222-222222222222",
  os_id: orderId,
  team_id: "33333333-3333-4333-8333-333333333333",
  responsible_id: otherId,
  status: "SCHEDULED",
  scheduled_start: new Date(now + 60_000).toISOString(),
  scheduled_end: new Date(now + 120_000).toISOString(),
  created_at: when,
  updated_at: when,
};
const labels = { [orderId]: "125" };

describe("Notificações operacionais V4 — etapa 1", () => {
  it("notifica apenas a pessoa recém-atribuída", () => {
    expect(projectNotices([event("assignee_changed", { to: userId, scope: "ART" })], [], audience, labels, [], now))
      .toMatchObject([{ kind: "assignment", href: "/os/" + orderId }]);
    expect(projectNotices([event("assignee_changed", { to: otherId })], [], audience, labels, [], now))
      .toEqual([]);
  });

  it("notifica Produção apenas após a liberação da Arte e conforme autorização", () => {
    const release = event("status_change", { board: "arte", from: "Para Aprovação", to: "Produzir" });
    expect(projectNotices([release], [], audience, labels, [], now)).toEqual([]);
    const allowed = { ...audience, canViewProduction: true };
    expect(projectNotices([release], [], allowed, labels, [], now)[0].kind).toBe("production_released");
    expect(projectNotices([event("status_change", { board: "arte", to: "Em Criação" })], [], allowed, labels, [], now)).toEqual([]);
    expect(projectNotices([event("status_change", { board: "producao", to: "Produzir" })], [], allowed, labels, [], now)).toEqual([]);
  });

  it("respeita o acesso ao quadro de Arte para novas OS", () => {
    expect(projectNotices([event("create", {})], [], audience, labels, [], now)).toEqual([]);
    expect(projectNotices([event("create", {})], [], { ...audience, canViewArt: true }, labels, [], now)[0].kind)
      .toBe("art_inbox");
  });

  it("restrige instalações ao responsável, integrante da equipe ou gestão com módulo", () => {
    expect(canSeeInstallation(installation, audience)).toBe(false);
    expect(canSeeInstallation(installation, { ...audience, canViewInstallations: true })).toBe(false);
    expect(canSeeInstallation(installation, { ...audience, canViewInstallations: true, teamIds: [installation.team_id!] })).toBe(true);
    expect(canSeeInstallation(installation, { ...audience, canViewInstallations: true, isManager: true })).toBe(true);
    expect(canSeeInstallation(installation, { ...audience, isManager: true })).toBe(false);
    const scoped = { ...audience, canViewInstallations: true, teamIds: [installation.team_id!] };
    expect(projectNotices([], [installation], scoped, labels, [], now)[0].kind).toBe("installation_scheduled");
    expect(projectNotices([], [installation], audience, labels, [], now)).toEqual([]);
  });

  it("não chama todo UPDATE de reagendamento; compara horário e equipe", () => {
    const changed = { ...installation, scheduled_start: new Date(now + 600_000).toISOString(), updated_at: when };
    expect(installationScheduleFingerprint(changed)).not.toBe(installationScheduleFingerprint(installation));
    expect(installationScheduleFingerprint({ ...installation, status: "IN_PROGRESS" }))
      .toBe(installationScheduleFingerprint(installation));
    const scoped = { ...audience, canViewInstallations: true, isManager: true };
    expect(projectNotices([], [changed], scoped, labels, [changed], now).some(n => n.kind === "installation_rescheduled")).toBe(true);
    expect(projectNotices([], [changed], scoped, labels, [], now).some(n => n.kind === "installation_rescheduled")).toBe(false);
  });

  it("não mostra eventos velhos, UUIDs inválidos ou dados privados dos clientes", () => {
    const old = { ...event("assignee_changed", { to: userId }), created_at: "2025-01-01T00:00:00Z" };
    const unsafe = { ...event("assignee_changed", { to: userId }), os_id: "https://example.com" };
    expect(projectNotices([old, unsafe], [], audience, labels, [], now)).toEqual([]);
    const notices = projectNotices([event("assignee_changed", { to: userId, client: "Cliente Secreto", address: "Rua Privada" })], [], audience, labels, [], now);
    expect(JSON.stringify(notices)).not.toContain("Cliente Secreto");
    expect(JSON.stringify(notices)).not.toContain("Rua Privada");
    expect(notices[0].description).toContain("OS 125");
  });
});
