import type { RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";

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
 * Validates a Stellar account address (G... format).
 * Uses the standard Stellar alphabet (base32) and checks length.
 */
const STELLAR_ADDRESS_REGEX = /^G[A-Z2-7]{55}$/;

/**
 * Validates a Soroban contract address (C... format).
 * Same base32 alphabet as Stellar accounts, different prefix.
 */
const SOROBAN_ADDRESS_REGEX = /^C[A-Z2-7]{55}$/;

/**
 * Checks if a string is a valid Stellar account (G...) address.
 */
export function isValidStellarAddress(address: string): boolean {
  if (!address || typeof address !== "string") return false;
  return STELLAR_ADDRESS_REGEX.test(address.trim());
}

/**
 * Checks if a string is a valid Soroban contract (C...) address.
 */
export function isValidSorobanAddress(address: string): boolean {
  if (!address || typeof address !== "string") return false;
  return SOROBAN_ADDRESS_REGEX.test(address.trim());
}

/**
 * Checks if a string is either a valid Stellar account or Soroban contract address.
 */
export function isValidStellarOrSorobanAddress(address: string): boolean {
  return isValidStellarAddress(address) || isValidSorobanAddress(address);
}