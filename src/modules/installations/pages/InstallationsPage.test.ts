import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./InstallationsPage.tsx", import.meta.url),
  "utf8"
);

describe("InstallationsPage team schedule visibility", () => {
  it("uses the global active dataset only for managers", () => {
    expect(source).toContain(
      "const canInspectGlobalTeamSchedule = hubPermissions.isManager"
    );
    expect(source).toMatch(
      /canInspectGlobalTeamSchedule\s*\? globalActiveInstallations/
    );
  });

  it("uses visible agenda for the user's own team and no source for foreign teams", () => {
    expect(source).toMatch(/teamIds\.includes\(t\.id\)\s*\? agenda\s*:\s*null/);
    expect(source).toContain("{schedule &&");
    expect(source).not.toMatch(
      /getTeamSchedulePresentation\([\s\S]*data\.installations/
    );
  });

  it("does not render availability or client details without a schedule source", () => {
    expect(source).toMatch(/\{schedule &&[\s\S]*Livre hoje/);
    expect(source).toMatch(/\{schedule && \([\s\S]*Nenhuma próxima instalação/);
    expect(source).toMatch(/schedule\.nextInstallation\.order\?\.client_name/);
  });
});

describe("InstallationsPage selected-week empty state", () => {
  it("renders week columns and the week empty state from weekAgenda", () => {
    expect(source).toContain(
      "const weekAgenda = filterInstallationsByWeek(filteredAgenda, weekStart)"
    );
    expect(source).toContain('agendaView === "week"');
    expect(source).toContain("const rows = weekAgenda.filter(");
    expect(source).toContain("weekAgenda.length ? (");
    expect(source).toContain("Nenhuma instalação programada nesta semana.");
  });

  it("keeps list empty state based on the complete filtered agenda", () => {
    expect(source).toContain('agendaView === "list" && !filteredAgenda.length');
  });
});
