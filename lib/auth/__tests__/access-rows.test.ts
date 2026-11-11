import { describe, expect, it } from "vitest";
import { accessRows, sourceLabel, type Account, type AccessState } from "../access-rows";

const accounts: Account[] = [
  { username: "zoe", displayName: "Zoe", role: "viewer" },
  { username: "root", displayName: "root", role: "admin" },
  { username: "mira", displayName: "Mira", role: "editor" },
  { username: "own", displayName: "Owen", role: "editor" },
  { username: "tom", displayName: "Tom", role: "viewer" },
];

function state(visibility: AccessState["visibility"]): AccessState {
  return {
    visibility,
    owner: "own",
    members: [
      { userId: "1", username: "mira", displayName: "Mira", role: "admin" },
      { userId: "2", username: "zoe", displayName: "Zoe", role: "viewer" },
      { userId: "3", username: "own", displayName: "Owen", role: "viewer" },
    ],
  };
}

const summary = (s: AccessState) => accessRows(s, accounts).map((r) => `${r.username}:${r.role}:${r.source}`);

describe("accessRows", () => {
  it("lists owner, instance admins and grants when members only", () => {
    expect(summary(state("members"))).toEqual(["own:admin:owner", "root:admin:instance-admin", "mira:admin:grant", "zoe:viewer:grant"]);
  });

  it("adds everyone else at their usual role when visible to everyone", () => {
    expect(summary(state("instance"))).toEqual([
      "own:admin:owner",
      "root:admin:instance-admin",
      "mira:admin:grant",
      "tom:viewer:instance",
      "zoe:viewer:grant",
    ]);
  });

  it("ignores a grant for the owner, whose admin comes from owning it", () => {
    expect(accessRows(state("members"), accounts).filter((r) => r.username === "own")).toHaveLength(1);
  });
});

describe("sourceLabel", () => {
  it("says where the role comes from", () => {
    const rows = accessRows(state("instance"), accounts);
    expect(rows.map(sourceLabel)).toEqual(["Owner", "Instance admin", "Granted here, editor elsewhere", "Usual role", "Granted here"]);
  });
});
