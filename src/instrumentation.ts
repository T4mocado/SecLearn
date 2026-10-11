export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { validateProviderConfigAtBoot } = await import("@/lib/env");
    validateProviderConfigAtBoot();
  } catch (err) {
    console.error("[seclearn:env] boot validation failed", err);
  }
  try {
    const { recoverPendingDocuments } = await import("@/lib/ingest-queue");
    await recoverPendingDocuments();
  } catch (err) {
    console.error("[ingest-queue] recovery failed", err);
  }
}
