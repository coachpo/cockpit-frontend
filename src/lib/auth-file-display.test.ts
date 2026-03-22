import { describe, expect, it } from "vitest"

import { getAuthFileStatusLabel } from "@/lib/auth-file-display"

describe("getAuthFileStatusLabel", () => {
	it("defaults blank enabled auth status to active", () => {
		expect(getAuthFileStatusLabel({ status: "" })).toBe("active")
		expect(getAuthFileStatusLabel({ status: "   " })).toBe("active")
	})

	it("lets disabled win over status text", () => {
		expect(getAuthFileStatusLabel({ disabled: true, status: "" })).toBe("disabled")
		expect(getAuthFileStatusLabel({ disabled: true, status: "active" })).toBe("disabled")
	})

	it("preserves explicit non-blank status", () => {
		expect(getAuthFileStatusLabel({ status: "refreshing" })).toBe("refreshing")
	})
})
