import { afterEach, describe, expect, it, vi } from "vitest"

import { createManagementClient } from "@/lib/management-api"
import { MANAGEMENT_BASE_PATH } from "@/types/management"

const fetchMock = vi.fn<typeof fetch>()
const BACKEND_ORIGIN = "https://backend.example:9443"

describe("createManagementClient", () => {
  afterEach(() => {
    fetchMock.mockReset()
    vi.unstubAllGlobals()
  })

  it("uses an absolute management URL for the selected backend origin", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    await createManagementClient(BACKEND_ORIGIN).getJson("/status")

    expect(fetchMock).toHaveBeenCalledWith(
      `${BACKEND_ORIGIN}${MANAGEMENT_BASE_PATH}/status`,
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

    await createManagementClient(BACKEND_ORIGIN).getJson("/status")

    const callArgs = fetchMock.mock.calls[0]
    expect(callArgs).toBeDefined()
    const requestInit = callArgs![1] as RequestInit
    const headers = requestInit.headers as Headers
    expect(headers.get("Authorization")).toBeNull()
  })

  it("allows empty POST requests for path-based management actions", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    await createManagementClient(BACKEND_ORIGIN).postJson("/auth-files/example.json/usage")

    const callArgs = fetchMock.mock.calls[0]
    expect(callArgs).toBeDefined()

    const requestInit = callArgs![1] as RequestInit
    const headers = requestInit.headers as Headers

    expect(requestInit.method).toBe("POST")
    expect(headers.get("Content-Type")).toBeNull()
    expect(requestInit.body).toBeUndefined()
  })

  it("requires an explicit backend origin instead of falling back to same-origin", () => {
    expect(() => createManagementClient("")).toThrow(
      "Enter a backend origin before continuing.",
    )
  })
})
