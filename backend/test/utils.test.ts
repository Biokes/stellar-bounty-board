import { describe, expect, it } from "vitest";
import {
  isValidStellarAddress,
  isValidSorobanContractAddress,
  isValidStellarOrContractAddress,
} from "../src/utils";

// ── Real valid keys (checksum verified) ──────────────────────────────────────

const VALID_G_1 = "GD54RBDMCCXNJTYDHZFIJWLEZ66WAVIGSUMD6MKQC5RGKPDQHTFYB2OR";
const VALID_G_2 = "GBOJA4ACB6VF6TXFNCUHUNJVIHDC44XX4FUYHGAAY2SEV46PLCIVJEIL";
const VALID_G_3 = "GAMKI5XDR5QC63CW2IDESPSIYPUK6C672TOTD2S3FOTSZPUUIZLYWFVK";
const VALID_C_1 = "CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526";
// ── isValidStellarAddress ─────────────────────────────────────────────────────

describe("isValidStellarAddress", () => {
  describe("valid G... addresses", () => {
    it("accepts first valid G... address", () => {
      expect(isValidStellarAddress(VALID_G_1)).toBe(true);
    });

    it("accepts second valid G... address", () => {
      expect(isValidStellarAddress(VALID_G_2)).toBe(true);
    });

    it("accepts third valid G... address", () => {
      expect(isValidStellarAddress(VALID_G_3)).toBe(true);
    });

    it("trims surrounding whitespace before validating", () => {
      expect(isValidStellarAddress(`  ${VALID_G_1}  `)).toBe(true);
    });
  });

  describe("invalid addresses", () => {
    it("rejects empty string", () => {
      expect(isValidStellarAddress("")).toBe(false);
    });

    it("rejects whitespace-only string", () => {
      expect(isValidStellarAddress("   ")).toBe(false);
    });

    it("rejects a C... contract address", () => {
      expect(isValidStellarAddress(VALID_C_1)).toBe(false);
    });

    it("rejects a random string", () => {
      expect(isValidStellarAddress("not-a-stellar-address")).toBe(false);
    });

    it("rejects a G... address with bad checksum", () => {
      const bad = VALID_G_1.slice(0, -1) + (VALID_G_1.endsWith("R") ? "A" : "R");
      expect(isValidStellarAddress(bad)).toBe(false);
    });

    it("rejects a too-short G... string", () => {
      expect(isValidStellarAddress("GABC")).toBe(false);
    });

    it("rejects a S... secret key", () => {
      expect(isValidStellarAddress("SCZANGBA5KCPOXJZjoyce6BNGJMX5SOWQ3GLR2BGMZEHXR3IXJK")).toBe(false);
    });

    it("rejects a number passed as string", () => {
      expect(isValidStellarAddress("12345678")).toBe(false);
    });
  });
});

// ── isValidSorobanContractAddress ─────────────────────────────────────────────

describe("isValidSorobanContractAddress", () => {
  describe("valid C... addresses", () => {
    it("accepts a valid C... contract address", () => {
      expect(isValidSorobanContractAddress(VALID_C_1)).toBe(true);
    });

    it("trims surrounding whitespace before validating", () => {
      expect(isValidSorobanContractAddress(`  ${VALID_C_1}  `)).toBe(true);
    });
  });

  describe("invalid addresses", () => {
    it("rejects a G... account address", () => {
      expect(isValidSorobanContractAddress(VALID_G_1)).toBe(false);
    });

    it("rejects empty string", () => {
      expect(isValidSorobanContractAddress("")).toBe(false);
    });

    it("rejects whitespace-only string", () => {
      expect(isValidSorobanContractAddress("   ")).toBe(false);
    });

    it("rejects a random string", () => {
      expect(isValidSorobanContractAddress("CINVALID")).toBe(false);
    });
  });
});

// ── isValidStellarOrContractAddress ──────────────────────────────────────────

describe("isValidStellarOrContractAddress", () => {
  it("accepts a valid G... address", () => {
    expect(isValidStellarOrContractAddress(VALID_G_1)).toBe(true);
  });

  it("accepts a valid C... address", () => {
    expect(isValidStellarOrContractAddress(VALID_C_1)).toBe(true);
  });

  it("rejects an invalid address", () => {
    expect(isValidStellarOrContractAddress("invalid")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidStellarOrContractAddress("")).toBe(false);
  });
});

// ── Schema integration — stellarAccountSchema uses isValidStellarAddress ──────

describe("createBountySchema — maintainer field uses StrKey validation", () => {
  it("accepts a valid G... maintainer address", async () => {
    const { createBountySchema } = await import("../src/validation/schemas");
    const result = createBountySchema.safeParse({
      repo: "owner/repo",
      issueNumber: 1,
      title: "Fix the widget spinner on slow networks",
      summary: "Ensure the loading state does not flash when latency is high for users.",
      maintainer: VALID_G_1,
      tokenSymbol: "XLM",
      amount: 100,
      deadlineDays: 14,
      labels: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid maintainer address with a clear error message", async () => {
    const { createBountySchema } = await import("../src/validation/schemas");
    const result = createBountySchema.safeParse({
      repo: "owner/repo",
      issueNumber: 1,
      title: "Fix the widget spinner on slow networks",
      summary: "Ensure the loading state does not flash when latency is high for users.",
      maintainer: "INVALID-ADDRESS",
      tokenSymbol: "XLM",
      amount: 100,
      deadlineDays: 14,
      labels: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join(" ");
      expect(messages).toMatch(/valid Stellar public key/i);
    }
  });

  it("rejects a G... address with bad checksum", async () => {
    const { createBountySchema } = await import("../src/validation/schemas");
    const bad = VALID_G_1.slice(0, -1) + (VALID_G_1.endsWith("R") ? "A" : "R");
    const result = createBountySchema.safeParse({
      repo: "owner/repo",
      issueNumber: 1,
      title: "Fix the widget spinner on slow networks",
      summary: "Ensure the loading state does not flash when latency is high for users.",
      maintainer: bad,
      tokenSymbol: "XLM",
      amount: 100,
      deadlineDays: 14,
      labels: [],
    });
    expect(result.success).toBe(false);
  });
});