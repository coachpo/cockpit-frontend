import { describe, expect, it } from "vitest"

import {
  getAuthFileUsageProbeRequest,
  mergeAuthFileUsageResponse,
} from "@/lib/auth-file-usage"

describe("getAuthFileUsageProbeRequest", () => {
  it("returns null when an auth file does not expose a usage probe", () => {
    expect(
      getAuthFileUsageProbeRequest({
        id: "auth-1",
        name: "Primary account",
      }),
    ).toBeNull()
  })

  it("extracts a valid per-file api-call payload", () => {
    const file = {
      id: "auth-1",
      name: "Primary account",
      usage_probe: {
        authIndex: "faba86331753f728",
        method: "GET",
        url: "https://chatgpt.com/backend-api/wham/usage",
        header: {
          Authorization: "Bearer $TOKEN$",
          "Content-Type": "application/json",
          "Chatgpt-Account-Id": "83c9c0d7-8a88-411a-9688-9702d5887a7e",
        },
        body: {
          source: "dashboard",
        },
      },
    }

    expect(getAuthFileUsageProbeRequest(file)).toEqual({
      authIndex: "faba86331753f728",
      method: "GET",
      url: "https://chatgpt.com/backend-api/wham/usage",
      header: {
        Authorization: "Bearer $TOKEN$",
        "Content-Type": "application/json",
        "Chatgpt-Account-Id": "83c9c0d7-8a88-411a-9688-9702d5887a7e",
      },
      body: {
        source: "dashboard",
      },
    })
  })

  it("returns null when a usage probe is missing its method or url", () => {
    expect(
      getAuthFileUsageProbeRequest({
        id: "auth-1",
        name: "Primary account",
        usage_probe: {
          method: "",
          url: "https://chatgpt.com/backend-api/wham/usage",
        },
      }),
    ).toBeNull()

    expect(
      getAuthFileUsageProbeRequest({
        id: "auth-1",
        name: "Primary account",
        usage_probe: {
          method: "GET",
          url: " ",
        },
      }),
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
