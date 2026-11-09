import { describe, expect, it } from "vitest";
import { getCurrentUserDisplayName } from "./userDisplay";

describe("getCurrentUserDisplayName", () => {
  it("prioritizes the saved full name over login email", () => {
    expect(getCurrentUserDisplayName({ email: "shai@empresa.com", user_metadata: { full_name: " Shai Munhoz " } })).toBe("Shai Munhoz");
  });
  it("uses the alternate saved name or email for legacy accounts", () => {
    expect(getCurrentUserDisplayName({ email: "user@empresa.com", user_metadata: { name: "Colaborador" } })).toBe("Colaborador");
    expect(getCurrentUserDisplayName({ email: "user@empresa.com" })).toBe("user@empresa.com");
    expect(getCurrentUserDisplayName(null)).toBe("Usuário");
  });
});
