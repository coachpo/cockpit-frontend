import { describe, expect, it } from "vitest"

import {
  getAuthFileUsageRefreshPath,
  mergeAuthFileUsageResponse,
} from "@/lib/auth-file-usage"

describe("getAuthFileUsageRefreshPath", () => {
  it("returns null when an auth file does not expose usage refresh", () => {
    expect(
      getAuthFileUsageRefreshPath({
        id: "auth-1",
        name: "Primary account",
      }),
    ).toBeNull()
  })

  it("builds the path-based usage refresh endpoint from the auth file name", () => {
    expect(getAuthFileUsageRefreshPath({
      id: "auth-1",
      name: "Primary account.json",
      usage_available: true,
    })).toBe("/auth-files/Primary%20account.json/usage")
  })

  it("returns null when the auth file name is blank", () => {
    expect(getAuthFileUsageRefreshPath({
      id: "auth-1",
      name: "   ",
      usage_available: true,
    })
    ).toBeNull()
  })
})

describe("mergeAuthFileUsageResponse", () => {
  it("stores an object probe response in auth-file usage", () => {
    const file = {
      id: "auth-1",
      name: "Primary account",
    }
    const response = {
      limits: [
        {
          label: "Messages",
          percentage: 0.25,
          used: "10 / 40",
        },
      ],
    }

    expect(mergeAuthFileUsageResponse(file, response)).toEqual({
      id: "auth-1",
      name: "Primary account",
      usage: response,
    })
  })

  it("preserves existing usage when the probe returns a non-object payload", () => {
    const file = {
      id: "auth-1",
      name: "Primary account",
      usage: {
        cached: {
          percentage: 0.5,
        },
      },
    }

    expect(mergeAuthFileUsageResponse(file, "unavailable")).toEqual(file)
  })

  it("ignores array payloads instead of replacing usage", () => {
    const file = {
      id: "auth-1",
      name: "Primary account",
      usage: {
        cached: {
          percentage: 0.5,
        },
      },
    }

    expect(
      mergeAuthFileUsageResponse(file, [{
        percentage: 0.25,
      }]),
    ).toEqual(file)
  })

  it("shallow-merges object probe responses over existing usage", () => {
    const file = {
      id: "auth-1",
      name: "Primary account",
      usage: {
        cached: {
          percentage: 0.5,
        },
        limits: [
          {
            label: "Messages",
            percentage: 0.5,
          },
        ],
      },
    }

    const response = {
      limits: [
        {
          label: "Messages",
          percentage: 0.25,
        },
      ],
      resets_at: "tomorrow",
    }

    expect(mergeAuthFileUsageResponse(file, response)).toEqual({
      id: "auth-1",
      name: "Primary account",
      usage: {
        cached: {
          percentage: 0.5,
        },
        limits: [
          {
            label: "Messages",
            percentage: 0.25,
          },
        ],
        resets_at: "tomorrow",
      },
    })
  })

  it("unwraps wrapped body-string responses before merging usage", () => {
    const file = {
      id: "auth-1",
      name: "Primary account",
      usage: {
        cached: {
          percentage: 0.5,
        },
      },
    }

    const response = {
      status_code: 200,
      header: {
        "content-type": ["application/json"],
      },
      body: JSON.stringify({
        plan_type: "team",
        rate_limit: {
          allowed: false,
          primary_window: {
            used_percent: 30,
          },
        },
      }),
    }

    expect(mergeAuthFileUsageResponse(file, response)).toEqual({
      id: "auth-1",
      name: "Primary account",
      usage: {
        cached: {
          percentage: 0.5,
        },
        plan_type: "team",
        rate_limit: {
          allowed: false,
          primary_window: {
            used_percent: 30,
          },
        },
      },
    })
  })
})
