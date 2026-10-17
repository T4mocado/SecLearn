// Who may do what. Every role check goes through here, so the table below is the whole access policy.
// No server imports: the nav components use it too.

export type Role = "learner" | "admin";
/** A signed-in role, or a visitor without an account. */
export type Actor = Role | "guest";
export type DocVisibility = "public" | "authenticated";

export type Action =
  | "lesson:read"
  | "chat:ask"
  | "chat:history"
  | "quiz:generate"
  | "admin:access"
  | "lesson:manage"
  | "document:manage"
  | "user:manage";

const learnerActions: readonly Action[] = ["lesson:read", "chat:ask", "chat:history", "quiz:generate"];

const PERMISSIONS: Record<Actor, readonly Action[]> = {
  guest: ["lesson:read", "chat:ask"],
  learner: learnerActions,
  admin: [...learnerActions, "admin:access", "lesson:manage", "document:manage", "user:manage"],
};

const DOC_VISIBILITIES: Record<Actor, readonly DocVisibility[]> = {
  guest: ["public"],
  learner: ["public", "authenticated"],
  admin: ["public", "authenticated"],
};

export function actorOf(user: { role: Role } | null | undefined): Actor {
  return user?.role ?? "guest";
}

export function can(actor: Actor, action: Action): boolean {
  return PERMISSIONS[actor].includes(action);
}

/** Documents whose chunks this actor's chat answers may draw on. */
export function docVisibilitiesFor(actor: Actor): DocVisibility[] {
  return [...DOC_VISIBILITIES[actor]];
}

/**
 * A quiz is generated from the creator's own conversation, so only the creator may open it, admins included.
 * A published quiz is open to every signed-in user.
 */
export function canAccessQuiz(user: { id: string }, quiz: { createdById: string; published: boolean }): boolean {
  return quiz.createdById === user.id || quiz.published;
}

/**
 * Whether an admin may change another user's role or disabled state. Never your own,
 * and never in a way that leaves no active admin.
 */
export function userPatchError(
  actorId: string,
  target: { id: string; role: Role; disabledAt: Date | null },
  patch: { role?: Role; disabled?: boolean },
  activeAdminCount: number,
): string | null {
  const demotes = patch.role !== undefined && patch.role !== target.role;
  if (target.id === actorId) {
    if (patch.disabled) return "Cannot disable yourself";
    if (demotes) return "Cannot change your own role";
  }
  const removesAdmin = target.role === "admin" && !target.disabledAt && (demotes || patch.disabled === true);
  if (removesAdmin && activeAdminCount <= 1) return "Cannot remove the last active admin";
  return null;
}
