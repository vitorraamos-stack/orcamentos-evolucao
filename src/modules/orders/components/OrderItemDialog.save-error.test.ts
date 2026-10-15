import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dialog = readFileSync(new URL("./OrderItemDialog.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../pages/OrderDetailPage.tsx", import.meta.url), "utf8");

describe("OS item save error regression contracts", () => {
  it("keeps the draft and dialog open when saving rejects", () => {
    expect(dialog).toContain('await onSave(parsed.data as OrderItemInput); onOpenChange(false);');
    expect(dialog).toContain('catch (saveError)');
    expect(dialog).toContain('setError(saveError instanceof Error ? saveError.message');
    expect(dialog).toContain('finally { setSaving(false); }');
    expect(dialog).toContain('{error && <p className="text-sm text-destructive">{error}</p>}');
  });

  it("propagates failures for both create and update instead of swallowing them", () => {
    const create = page.slice(page.indexOf('const createItem ='), page.indexOf('const removeItem ='));
    const update = page.slice(page.indexOf('const updateItem ='), page.indexOf('const moveItem ='));
    expect(create).toContain('catch (error) { toast.error(message(error)); throw error; }');
    expect(update).toContain('catch (error) { toast.error(message(error)); throw error; }');
  });
});
