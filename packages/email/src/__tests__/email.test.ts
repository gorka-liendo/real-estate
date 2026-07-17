import { describe, expect, it, vi } from "vitest";
import { getEmailer, invitationEmail } from "../index.js";

describe("Emailer (driver console por defecto)", () => {
  it("usa el driver console sin credenciales", () => {
    expect(getEmailer().name).toBe("console");
  });

  it("console.send loguea y no entrega", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const res = await getEmailer().send({
      to: "a@b.com",
      subject: "Hola",
      html: "<p>hi</p>",
    });
    expect(res.delivered).toBe(false);
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  it("invitationEmail genera asunto y CTA con la URL", () => {
    const msg = invitationEmail({
      to: "nuevo@agencia.com",
      tenantName: "Agencia López",
      inviteUrl: "https://x/invite/abc",
    });
    expect(msg.subject).toContain("Agencia López");
    expect(msg.html).toContain("https://x/invite/abc");
    expect(msg.to).toBe("nuevo@agencia.com");
  });
});
