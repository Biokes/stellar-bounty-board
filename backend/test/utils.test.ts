import { describe, it, expect } from "vitest";
import {
  isValidStellarAddress,
  isValidSorobanAddress,
  isValidStellarOrSorobanAddress,
} from "../src/utils";

const VALID_STELLAR = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const VALID_SOROBAN = "CCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

describe("isValidStellarAddress", () => {
  it("accepts a valid G... address", () => {
    expect(isValidStellarAddress(VALID_STELLAR)).toBe(true);
  });

  it("rejects a C... (Soroban) address", () => {
    expect(isValidStellarAddress(VALID_SOROBAN)).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidStellarAddress("")).toBe(false);
  });

  it("rejects a null or undefined input", () => {
    expect(isValidStellarAddress(null as unknown as string)).toBe(false);
    expect(isValidStellarAddress(undefined as unknown as string)).toBe(false);
  });

  it("rejects a short address", () => {
    expect(isValidStellarAddress("G1234")).toBe(false);
  });

  it("rejects an address with invalid characters", () => {
    expect(isValidStellarAddress("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWH0")).toBe(false);
  });

  it("accepts a trimmed address with whitespace", () => {
    expect(isValidStellarAddress(`  ${VALID_STELLAR}  `)).toBe(true);
  });

  it("rejects an address starting with lowercase g", () => {
    expect(isValidStellarAddress(`g${VALID_STELLAR.slice(1)}`)).toBe(false);
  });
});

describe("isValidSorobanAddress", () => {
  it("accepts a valid C... address", () => {
    expect(isValidSorobanAddress(VALID_SOROBAN)).toBe(true);
  });

  it("rejects a G... (Stellar) address", () => {
    expect(isValidSorobanAddress(VALID_STELLAR)).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidSorobanAddress("")).toBe(false);
  });

  it("rejects null or undefined", () => {
    expect(isValidSorobanAddress(null as unknown as string)).toBe(false);
  });

  it("rejects a short address", () => {
    expect(isValidSorobanAddress("C1234")).toBe(false);
  });
});

describe("isValidStellarOrSorobanAddress", () => {
  it("accepts a valid Stellar address", () => {
    expect(isValidStellarOrSorobanAddress(VALID_STELLAR)).toBe(true);
  });

  it("accepts a valid Soroban address", () => {
    expect(isValidStellarOrSorobanAddress(VALID_SOROBAN)).toBe(true);
  });

  it("rejects an invalid address", () => {
    expect(isValidStellarOrSorobanAddress("not-an-address")).toBe(false);
  });
});
