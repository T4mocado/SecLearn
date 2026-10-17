import { test } from "node:test";
import assert from "node:assert/strict";
import { actorOf, can, canAccessQuiz, docVisibilitiesFor, userPatchError } from "./permissions";

test("guests may read lessons and ask, nothing else", () => {
  assert.equal(can("guest", "lesson:read"), true);
  assert.equal(can("guest", "chat:ask"), true);
  assert.equal(can("guest", "chat:history"), false);
  assert.equal(can("guest", "quiz:generate"), false);
  assert.equal(can("guest", "admin:access"), false);
});

test("learners get their own history and quizzes, no admin area", () => {
  assert.equal(can("learner", "chat:history"), true);
  assert.equal(can("learner", "quiz:generate"), true);
  for (const action of ["admin:access", "lesson:manage", "document:manage", "user:manage"] as const) {
    assert.equal(can("learner", action), false, action);
  }
});

test("admins can do everything a learner can, plus manage content and users", () => {
  for (const action of ["lesson:read", "chat:ask", "chat:history", "quiz:generate"] as const) {
    assert.equal(can("admin", action), true, action);
  }
  for (const action of ["admin:access", "lesson:manage", "document:manage", "user:manage"] as const) {
    assert.equal(can("admin", action), true, action);
  }
});

test("actorOf maps a missing user to guest", () => {
  assert.equal(actorOf(null), "guest");
  assert.equal(actorOf(undefined), "guest");
  assert.equal(actorOf({ role: "learner" }), "learner");
});

test("guest answers only use public documents", () => {
  assert.deepEqual(docVisibilitiesFor("guest"), ["public"]);
  assert.deepEqual(docVisibilitiesFor("learner"), ["public", "authenticated"]);
  assert.deepEqual(docVisibilitiesFor("admin"), ["public", "authenticated"]);
});

test("an unpublished quiz is open to its creator only, not to admins", () => {
  const quiz = { createdById: "u1", published: false };
  assert.equal(canAccessQuiz({ id: "u1" }, quiz), true);
  assert.equal(canAccessQuiz({ id: "admin" }, quiz), false);
  assert.equal(canAccessQuiz({ id: "u2" }, { ...quiz, published: true }), true);
});

test("an admin cannot disable or demote themselves", () => {
  const me = { id: "a1", role: "admin" as const, disabledAt: null };
  assert.equal(userPatchError("a1", me, { disabled: true }, 3), "Cannot disable yourself");
  assert.equal(userPatchError("a1", me, { role: "learner" }, 3), "Cannot change your own role");
  assert.equal(userPatchError("a1", me, { role: "admin" }, 3), null);
});

test("the last active admin cannot be demoted or disabled", () => {
  const other = { id: "a2", role: "admin" as const, disabledAt: null };
  assert.equal(userPatchError("a1", other, { role: "learner" }, 1), "Cannot remove the last active admin");
  assert.equal(userPatchError("a1", other, { disabled: true }, 1), "Cannot remove the last active admin");
  assert.equal(userPatchError("a1", other, { role: "learner" }, 2), null);
});

test("disabled admins and learners do not count toward the last-admin rule", () => {
  const disabledAdmin = { id: "a2", role: "admin" as const, disabledAt: new Date() };
  assert.equal(userPatchError("a1", disabledAdmin, { role: "learner" }, 1), null);
  const learner = { id: "u1", role: "learner" as const, disabledAt: null };
  assert.equal(userPatchError("a1", learner, { disabled: true }, 1), null);
});
