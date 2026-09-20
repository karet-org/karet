// The username and password rules, which the form and the route both read.
//
// Worth testing as functions rather than through a route: they are the reason a
// hyphen is rejected before better-auth can turn it into a sign-in failure, and
// the reason the form's Create button and the endpoint's 422 agree.

import { describe, expect, it } from "vitest";
import { MIN_PASSWORD_LENGTH, USERNAME_PATTERN, cleanDisplayName, displayNameProblem, passwordProblem, usernameProblem } from "../account-rules";

describe("usernameProblem", () => {
  it("accepts what better-auth's username plugin accepts", () => {
    expect(usernameProblem("pat")).toBeNull();
    expect(usernameProblem("pat.smith_2")).toBeNull();
    expect(usernameProblem("a".repeat(32))).toBeNull();
  });

  it("rejects a hyphen, which the plugin refuses at sign-in", () => {
    expect(usernameProblem("pat-smith")).toMatch(/letters, numbers/);
  });

  it("rejects too short, too long, and anything exotic", () => {
    expect(usernameProblem("ab")).not.toBeNull();
    expect(usernameProblem("a".repeat(33))).not.toBeNull();
    expect(usernameProblem("pat smith")).not.toBeNull();
    expect(usernameProblem("pat@example.com")).not.toBeNull();
    expect(usernameProblem("")).not.toBeNull();
  });

  it("is the regex the store exports, so the two cannot drift", () => {
    expect(USERNAME_PATTERN.test("pat")).toBe(true);
    expect(USERNAME_PATTERN.test("pat-smith")).toBe(false);
  });
});

describe("passwordProblem", () => {
  // Pinned rather than read from the constant: every assertion below is relative
  // to it, so without this line the minimum could be lowered to 1 and the suite
  // would still pass. The number is also in the form's hint and the docs.
  it("is eight characters", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
  });

  it("accepts a password at the minimum length", () => {
    expect(passwordProblem("x".repeat(MIN_PASSWORD_LENGTH))).toBeNull();
  });

  it("rejects one character short, and says the number", () => {
    const problem = passwordProblem("x".repeat(MIN_PASSWORD_LENGTH - 1));
    expect(problem).toContain(String(MIN_PASSWORD_LENGTH));
  });

  it("rejects an empty password", () => {
    expect(passwordProblem("")).not.toBeNull();
  });
});

describe("displayNameProblem", () => {
  it("accepts names, in any script, with the punctuation names use", () => {
    for (const ok of ["Joey", "Anne-Marie", "O’Neill", "J. R. Smith", "李雷", "José 3rd"]) {
      expect(displayNameProblem(ok)).toBeNull();
    }
  });

  it("allows blank, which clears it back to the username", () => {
    expect(displayNameProblem("   ")).toBeNull();
  });

  it("rejects punctuation that is not part of a name", () => {
    for (const bad of ["Hello?", "admin!", "a@b", "<b>x</b>", "Joey \u{1f600}", "name;drop"]) {
      expect(displayNameProblem(bad)).toBe(
        "Use letters, numbers, spaces, apostrophes, hyphens or dots.",
      );
    }
  });

  it("rejects one over 64 characters before looking at the characters", () => {
    expect(displayNameProblem("x".repeat(65))).toContain("64 characters or fewer");
  });

  it("collapses whitespace, so two names cannot look the same but differ", () => {
    expect(cleanDisplayName("  Anne   Marie \n")).toBe("Anne Marie");
  });
});
