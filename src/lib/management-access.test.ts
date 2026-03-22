import { describe, expect, it } from "vitest"

import { isManagementActionDisabled } from "@/lib/management-access"

describe("isManagementActionDisabled", () => {
  it("disables actions while another request is busy", () => {
    expect(
      isManagementActionDisabled({
        busyAction: "load-dashboard",
        managementKey: "secret",
      }),
    ).toBe(true)
  })

  it("disables actions when the management key is blank", () => {
    expect(
      isManagementActionDisabled({
        busyAction: null,
        managementKey: "   ",
      }),
    ).toBe(true)
  })

  it("enables actions when no request is busy and a key is present", () => {
    expect(
      isManagementActionDisabled({
        busyAction: null,
        managementKey: "secret",
      }),
    ).toBe(false)
  })
})
