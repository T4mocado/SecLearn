import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const BASE = "http://127.0.0.1:3847";
const MEDIA = "/cursor/stores/bc-bcc23bf9-7d21-449b-87f8-90b39603bc40/media";
const PDF = "/tmp/seclearn-demo/sample.pdf";

async function dismissOverlay(page) {
  await page.evaluate(() => {
    document.querySelectorAll("nextjs-portal").forEach((el) => el.remove());
    const toastRoot = document.getElementById("nextjs__container");
    if (toastRoot) toastRoot.remove();
  });
}

async function login(page) {
  await page.goto(`${BASE}/vi/login`, { waitUntil: "networkidle" });
  await dismissOverlay(page);
  await page.fill('input[type="email"]', "admin@seclearn.local");
  await page.fill('input[type="password"]', "admin123456");
  await page.getByRole("button", { name: /Đăng nhập|Log in/i }).click({ force: true });
  await page.waitForURL(/\/vi(\/|$)/, { timeout: 15000 });
  await page.waitForTimeout(800);
  await dismissOverlay(page);
}

async function main() {
  fs.mkdirSync(MEDIA, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.on("pageerror", (err) => console.log("PAGEERROR", err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("CONSOLE", msg.text());
  });

  await login(page);

  const avatarBtn = page.getByRole("button", { name: /Tài khoản|Account/i }).first();
  await avatarBtn.waitFor({ state: "visible", timeout: 10000 });
  await dismissOverlay(page);
  await avatarBtn.click({ force: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(MEDIA, "nav-user-avatar.png"), fullPage: false });
  await page.keyboard.press("Escape");

  await page.goto(`${BASE}/vi/admin/documents`, { waitUntil: "networkidle" });
  await dismissOverlay(page);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(MEDIA, "admin-docs-upload.png"), fullPage: false });

  await page.fill("#doc-title", "Demo mật khẩu PDF");
  await page.setInputFiles("#doc-file", PDF);
  await page.getByRole("button", { name: /Tải PDF lên|Upload PDF/i }).click({ force: true });
  await page.waitForTimeout(1200);
  await dismissOverlay(page);

  const processing = page.getByText(/Đang cắt chunk|Chunking|processingHint|Trích xuất/i).first();
  try {
    await processing.waitFor({ state: "visible", timeout: 3000 });
  } catch {
    /* may already be done */
  }
  await page.screenshot({
    path: path.join(MEDIA, "admin-docs-processing.png"),
    fullPage: false,
  });

  await page
    .getByText(/đã sẵn sàng|is ready|Sẵn sàng|Ready/i)
    .first()
    .waitFor({ timeout: 25000 })
    .catch(() => null);
  await page.waitForTimeout(600);

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const mpage = await mobile.newPage();
  await login(mpage);
  await dismissOverlay(mpage);
  await mpage.getByRole("button", { name: /Tài khoản|Account/i }).click({ force: true });
  await mpage.waitForTimeout(400);
  await mpage.screenshot({
    path: path.join(MEDIA, "nav-user-avatar-mobile.png"),
    fullPage: false,
  });

  await browser.close();
  console.log("ok", fs.readdirSync(MEDIA).filter((f) => f.includes("admin-docs") || f.includes("nav-user")));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
