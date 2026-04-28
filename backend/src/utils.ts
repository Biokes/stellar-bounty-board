import type { RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { StrKey } from "@stellar/stellar-sdk";

/** Bypass strict limits in automated tests so suites can hit POST routes freely. */
export const limiter: RequestHandler =
  process.env.NODE_ENV === "test"
    ? (_req, _res, next) => next()
    : rateLimit({
        windowMs: 1 * 60 * 1000,
        limit: 5,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        ipv6Subnet: 56,
      });

/**
 * Returns true if `address` is a valid Stellar Ed25519 public key (G... format).
 *
 * Uses `StrKey.isValidEd25519PublicKey` from `@stellar/stellar-sdk` for
 * cryptographic correctness — checksums are verified, not just the prefix/length.
 *
 * @example
 * isValidStellarAddress("GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN") // true
 * isValidStellarAddress("CINVALID") // false
 * isValidStellarAddress("")         // false
 */
export function isValidStellarAddress(address: string): boolean {
  if (typeof address !== "string" || address.trim() === "") return false;
  return StrKey.isValidEd25519PublicKey(address.trim());
}

/**
 * Returns true if `address` is a valid Soroban contract address (C... format).
 *
 * Uses `StrKey.isValidContract` from `@stellar/stellar-sdk`.
 *
 * @example
 * isValidSorobanContractAddress("CA7QYNF7SOWQ3GLR2BGMZEHXR3IXJKZXBAKBZ3HVXKMQ7KAZSQ5LXKL") // true
 * isValidSorobanContractAddress("GAAZI4TCR3TY...") // false — that's a G... key
 */
export function isValidSorobanContractAddress(address: string): boolean {
  if (typeof address !== "string" || address.trim() === "") return false;
  return StrKey.isValidContract(address.trim());
}

/**
 * Returns true if `address` is either a valid Stellar account (G...) or
 * a valid Soroban contract (C...).
 *
 * Useful for fields that accept both account and contract addresses.
 */
export function isValidStellarOrContractAddress(address: string): boolean {
  return isValidStellarAddress(address) || isValidSorobanContractAddress(address);
}