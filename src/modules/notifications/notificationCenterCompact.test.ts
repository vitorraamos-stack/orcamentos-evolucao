import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const bell=readFileSync("src/components/notifications/NotificationBell.tsx","utf8");
const preferences=readFileSync("src/components/notifications/PushNotificationPreferences.tsx","utf8");

describe("Central de notificações compacta",()=>{
  it("prioriza o histórico antes das opções do dispositivo e preserva sua rolagem",()=>{
    expect(bell.indexOf('role="region" aria-label="Histórico de avisos"')).toBeGreaterThan(0);
    expect(bell.indexOf('role="region" aria-label="Histórico de avisos"'))
      .toBeLessThan(bell.indexOf("<PushNotificationPreferences userId={user!.id} />"));
    expect(bell).toContain("min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain");
    expect(bell).toContain("h-[min(90dvh,760px)]");
    expect(bell).toContain("markRead(notice.id)");
    expect(bell).toContain("setLocation(notice.href)");
  });
  it("inicia configurações recolhidas, com expansão acessível e ferramentas de teste secundárias",()=>{
    expect(preferences).toContain("const [expanded, setExpanded] = useState(false)");
    expect(preferences).toContain("const [showPilotTools, setShowPilotTools] = useState(false)");
    expect(preferences).toContain("aria-expanded={expanded}");
    expect(preferences).toContain('aria-controls="push-device-settings"');
    expect(preferences).toContain("Ferramentas de teste");
    expect(preferences).toContain("showPilotTools &&");
    expect(preferences).toContain("onClick={activate}");
    expect(preferences).toContain("void disable()");
    expect(preferences).toContain("void sendManualTest()");
  });
  it("remove o aviso obsoleto que informava push em preparação",()=>{
    expect(bell).not.toContain("Notificações push com o app fechado estão em preparação.");
    expect(preferences).not.toContain("avisos operacionais automáticos continuam desativados.");
  });
});
