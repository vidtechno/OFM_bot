import { describe, expect, it, vi } from "vitest";
import { UserRepository } from "../src/users/user.repository.js";

describe("UserRepository", () => {
  it("Telegram userni telegram_id bo'yicha upsert qiladi", async () => {
    const single = vi.fn().mockResolvedValue({
      data: { id: "user-id", telegram_id: 42, username: "manager", first_name: "Ali", last_name: null, language_code: "uz" },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ single });
    const upsert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ upsert });
    const repository = new UserRepository({ from } as never);

    await repository.upsertFromTelegram({ id: 42, is_bot: false, first_name: "Ali", username: "manager", language_code: "uz" });

    expect(from).toHaveBeenCalledWith("users");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ telegram_id: 42, username: "manager", first_name: "Ali" }),
      { onConflict: "telegram_id" },
    );
  });
});
