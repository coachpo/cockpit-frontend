import { afterEach, describe, expect, it, vi } from "vitest"

import { createManagementClient } from "@/lib/management-api"

const fetchMock = vi.fn<typeof fetch>()

describe("createManagementClient", () => {
  afterEach(() => {
    fetchMock.mockReset()
    vi.unstubAllGlobals()
  })

  it("uses a same-origin relative management path when base URL is blank", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    await createManagementClient("", "secret").getJson("/status")

    expect(fetchMock).toHaveBeenCalledWith(
      "/v0/management/status",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    )
  })

  it("normalizes overrides before building management request URLs", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    await createManagementClient(" https://backend.example.com/// ", "secret").getJson(
      "/status",
    )

    expect(fetchMock).toHaveBeenCalledWith(
      "https://backend.example.com/v0/management/status",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    )
  })
})
