import { afterEach, describe, expect, it, vi } from "vitest"

import { createManagementClient } from "@/lib/management-api"

const fetchMock = vi.fn<typeof fetch>()

describe("createManagementClient", () => {
  afterEach(() => {
    fetchMock.mockReset()
    vi.unstubAllGlobals()
  })

  it("uses a same-origin relative management path", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    await createManagementClient().getJson("/status")

    expect(fetchMock).toHaveBeenCalledWith(
      "/v0/management/status",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    )
  })

  it("does not send an Authorization header", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    await createManagementClient().getJson("/status")

    const callArgs = fetchMock.mock.calls[0]
    expect(callArgs).toBeDefined()
    const requestInit = callArgs![1] as RequestInit
    const headers = requestInit.headers as Headers
    expect(headers.get("Authorization")).toBeNull()
  })
})
