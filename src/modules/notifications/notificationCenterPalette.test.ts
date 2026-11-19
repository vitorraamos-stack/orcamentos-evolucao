import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const read=(file:string)=>readFileSync(file,"utf8");
const bell=read("src/components/notifications/NotificationBell.tsx");
const device=read("src/components/notifications/PushNotificationPreferences.tsx");
const shell=read("src/components/evolusystem-shell.css");
const palette=read("src/index.css");

describe("Central de Notificações — identidade visual oficial",()=>{
  it("herda a paleta aprovada e seus estados sem cores azuis legadas",()=>{
    for (const token of [
      "--evolu-page", "--evolu-panel", "--evolu-panel-raised",
      "--evolu-field", "--evolu-border", "--evolu-highlight",
      "--evolu-text", "--evolu-text-muted", "--evolu-action-bg",
      "--evolu-action-hover", "--evolu-action-text", "--evolu-danger",
      "--evolu-success",
    ]) expect(palette).toContain(token+":");

    for(const view of [bell,device]){
      expect(view).not.toMatch(/#[0-9a-f]{6}\b/i);
      expect(view).toContain("var(--evolu-panel");
      expect(view).toContain("var(--evolu-border)");
      expect(view).toContain("var(--evolu-highlight)");
      expect(view).toContain("var(--evolu-text)");
    }
    expect(bell).toContain("bg-[var(--evolu-danger)]");
    expect(bell).toContain("text-[var(--evolu-page)]");
    expect(device).toContain("text-[var(--evolu-success)]");
    expect(shell).toContain("background: var(--evolu-danger);");
    expect(shell).toContain("border: 2px solid var(--evolu-panel);");
  });

  it("preserva a central compacta, o histórico scrollável e as funções Push",()=>{
    expect(bell).toContain("h-[min(90dvh,760px)]");
    expect(bell).toContain('role="region" aria-label="Histórico de avisos"');
    expect(bell.indexOf("Histórico de avisos")).toBeLessThan(
      bell.indexOf("<PushNotificationPreferences userId={user!.id} />")
    );
    expect(bell).toContain("markRead(notice.id)");
    expect(bell).toContain("setLocation(notice.href)");
    expect(device).toContain("const [expanded, setExpanded] = useState(false)");
    expect(device).toContain("const [showPilotTools, setShowPilotTools] = useState(false)");
    expect(device).toContain("void sendManualTest()");
    expect(device).toContain("void chooseBackgroundTarget()");
    expect(device).toContain("void sendBackgroundTest()");
    expect(device).toContain("void disable()");
  });
});
