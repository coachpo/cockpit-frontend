import { describe, expect, it } from "vitest"

import {
  getInitialManagementBaseUrl,
  getManagementBaseUrlSummary,
  hasManagementBaseUrlOverride,
} from "@/lib/management-origin"

describe("getInitialManagementBaseUrl", () => {
  it("defaults to current-origin mode when no override is stored", () => {
    expect(
      getInitialManagementBaseUrl({
        isDev: true,
        storedBaseUrl: "",
      }),
    ).toBe("")
  })

  it("preserves an explicit override during local dev", () => {
    expect(
      getInitialManagementBaseUrl({
        isDev: true,
        storedBaseUrl: " https://backend.example.com/// ",
      }),
    ).toBe("https://backend.example.com")
  })

  it("reuses a normalized stored override outside dev", () => {
    expect(
      getInitialManagementBaseUrl({
        isDev: false,
        storedBaseUrl: " https://backend.example.com/// ",
      }),
    ).toBe("https://backend.example.com")
  })
})

describe("hasManagementBaseUrlOverride", () => {
  it("treats blank values as current-origin mode", () => {
    expect(hasManagementBaseUrlOverride("   ")).toBe(false)
  })

  it("treats non-empty values as explicit overrides", () => {
    expect(hasManagementBaseUrlOverride("https://backend.example.com/")).toBe(true)
  })
})

describe("getManagementBaseUrlSummary", () => {
  it("reports current origin when override is blank", () => {
    expect(getManagementBaseUrlSummary("   ")).toBe("current origin")
  })

  it("reports a normalized override when one exists", () => {
    expect(getManagementBaseUrlSummary(" https://backend.example.com/// ")).toBe(
      "https://backend.example.com",
    )
  })
})
