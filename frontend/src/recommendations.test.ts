import { describe, it, expect } from "vitest";
import { scoreMatch, createDefaultProfile } from "./recommendations";
import type { Bounty } from "./types";

function makeBounty(overrides: Partial<Bounty> = {}): Bounty {
  return {
    id: "test-1",
    repo: "ritik4ever/stellar-bounty-board",
    issueNumber: 1,
    title: "Test bounty",
    summary: "A test bounty for unit testing",
    maintainer: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    tokenSymbol: "XLM",
    amount: 100,
    status: "open",
    createdAt: Date.now(),
    deadlineAt: Date.now() + 86400,
    version: 1,
    events: [],
    labels: [],
    ...overrides,
  };
}

describe("scoreMatch", () => {
  it("returns 0 when skills array is empty", () => {
    const bounty = makeBounty({ labels: [{ name: "React", color: "61dafb" }] });
    expect(scoreMatch(bounty, [])).toBe(0);
  });

  it("returns 0 when skills array is undefined/null-like", () => {
    const bounty = makeBounty({ labels: [{ name: "React", color: "61dafb" }] });
    expect(scoreMatch(bounty, undefined as unknown as string[])).toBe(0);
    expect(scoreMatch(bounty, [] as string[])).toBe(0);
  });

  it("returns 0 when bounty has no labels, tags, or relevant text", () => {
    const bounty = makeBounty({ labels: [], title: "", summary: "" });
    expect(scoreMatch(bounty, ["React"])).toBe(0);
  });

  it("returns 1.0 when all skills match bounty labels exactly", () => {
    const bounty = makeBounty({
      labels: [
        { name: "React", color: "61dafb" },
        { name: "TypeScript", color: "3178c6" },
      ],
    });
    expect(scoreMatch(bounty, ["React", "TypeScript"])).toBe(1);
  });

  it("returns 0.5 when half of skills match", () => {
    const bounty = makeBounty({
      labels: [
        { name: "React", color: "61dafb" },
        { name: "CSS", color: "563d7c" },
      ],
    });
    // "Rust" does not match, "React" does -> 1/2 = 0.5
    expect(scoreMatch(bounty, ["React", "Rust"])).toBe(0.5);
  });

  it("is case-insensitive", () => {
    const bounty = makeBounty({
      labels: [{ name: "react", color: "61dafb" }],
    });
    expect(scoreMatch(bounty, ["React"])).toBe(1);
    expect(scoreMatch(bounty, ["REACT"])).toBe(1);
  });

  it("matches skills against bounty title", () => {
    const bounty = makeBounty({
      labels: [],
      title: "Add Rust backend integration",
    });
    expect(scoreMatch(bounty, ["Rust"])).toBe(1);
  });

  it("matches skills against bounty summary", () => {
    const bounty = makeBounty({
      labels: [],
      title: "",
      summary: "Implement a Solidity smart contract for Stellar",
    });
    expect(scoreMatch(bounty, ["Solidity"])).toBe(1);
  });

  it("matches skills against optional bounty.tags field", () => {
    const bounty = makeBounty({
      labels: [],
      tags: ["Web3", "Smart Contract"],
    } as Bounty & { tags: string[] });
    expect(scoreMatch(bounty, ["Web3"])).toBe(1);
    expect(scoreMatch(bounty, ["Smart Contract"])).toBe(1);
  });

  it("handles partial token matching (e.g. 'react' in 'react-native')", () => {
    const bounty = makeBounty({
      labels: [{ name: "react-native", color: "61dafb" }],
    });
    expect(scoreMatch(bounty, ["React"])).toBe(1);
  });

  it("returns 0 for skills that don't match anything", () => {
    const bounty = makeBounty({
      labels: [{ name: "documentation", color: "0075ca" }],
      title: "Write docs",
    });
    expect(scoreMatch(bounty, ["Python"])).toBe(0);
  });

  it("handles multiple skills with partial overlap", () => {
    const bounty = makeBounty({
      labels: [
        { name: "React", color: "61dafb" },
        { name: "JavaScript", color: "f0db4f" },
      ],
    });
    // "React" matches label, "TypeScript" does not, "JavaScript" matches label -> 2/3 ≈ 0.67
    const result = scoreMatch(bounty, ["React", "TypeScript", "JavaScript"]);
    expect(result).toBeCloseTo(2 / 3, 5);
  });
});

describe("createDefaultProfile", () => {
  it("includes empty skills array", () => {
    const profile = createDefaultProfile();
    expect(profile.skills).toEqual([]);
  });
});
