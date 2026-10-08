import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.ADMIN_EMAIL || "admin@seclearn.local").toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "admin123456";
  const passwordHash = await hash(password, 10);

  await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      role: "admin",
      disabledAt: null,
      name: "SecLearn Admin",
    },
    create: {
      email,
      passwordHash,
      role: "admin",
      name: "SecLearn Admin",
      preferredLocale: "vi",
    },
  });

  const lessons = [
    {
      slug: "mat-khau-an-toan",
      order: 1,
      vi: {
        title: "Mật khẩu an toàn",
        summary: "Tạo và quản lý mật khẩu mạnh cho người mới bắt đầu.",
        content:
          "## Mật khẩu an toàn\n\n- Dài hơn 12 ký tự\n- Kết hợp chữ, số, ký tự đặc biệt\n- Không tái sử dụng\n- Dùng trình quản lý mật khẩu khi có thể\n- Bật xác thực hai yếu tố (2FA)",
      },
      en: {
        title: "Strong passwords",
        summary: "Create and manage strong passwords as a beginner.",
        content:
          "## Strong passwords\n\n- Longer than 12 characters\n- Mix letters, numbers, symbols\n- Never reuse passwords\n- Prefer a password manager\n- Enable two-factor authentication (2FA)",
      },
    },
    {
      slug: "nhan-biet-phishing",
      order: 2,
      vi: {
        title: "Nhận biết phishing",
        summary: "Phát hiện email và trang giả mạo trước khi bị lừa.",
        content:
          "## Phishing\n\n- Kiểm tra địa chỉ người gửi\n- Không bấm link khả nghi\n- Cảnh giác lời kêu gọi gấp\n- Không gửi mật khẩu qua email\n- Xác minh qua kênh chính thức",
      },
      en: {
        title: "Spotting phishing",
        summary: "Detect fake emails and sites before you get tricked.",
        content:
          "## Phishing\n\n- Check the sender address\n- Avoid suspicious links\n- Be wary of urgent pressure\n- Never send passwords by email\n- Verify through official channels",
      },
    },
  ];

  for (const lesson of lessons) {
    await prisma.lesson.upsert({
      where: { slug: lesson.slug },
      update: {
        order: lesson.order,
        published: true,
        translations: {
          deleteMany: {},
          create: [
            { locale: "vi", ...lesson.vi },
            { locale: "en", ...lesson.en },
          ],
        },
      },
      create: {
        slug: lesson.slug,
        order: lesson.order,
        published: true,
        translations: {
          create: [
            { locale: "vi", ...lesson.vi },
            { locale: "en", ...lesson.en },
          ],
        },
      },
    });
  }

  // Public sample corpus so guest RAG has something to retrieve without PDF upload
  const admin = await prisma.user.findUnique({ where: { email } });
  if (admin) {
    const existing = await prisma.document.findFirst({
      where: { title: "SecLearn starter notes" },
    });
    if (!existing) {
      const markdown = `# SecLearn starter notes

## Mật khẩu mạnh / Strong passwords
Dùng mật khẩu dài, ngẫu nhiên, không tái sử dụng. Prefer a password manager and enable 2FA.

## Phishing
Check sender addresses, avoid urgent pressure links, never send passwords by email.

## 2FA / MFA
Adds a second factor beyond the password so stolen passwords alone are not enough.
`;
      const doc = await prisma.document.create({
        data: {
          title: "SecLearn starter notes",
          filename: "starter-notes.md",
          mimeType: "text/markdown",
          storagePath: "seed://starter-notes.md",
          markdown,
          visibility: "public",
          status: "ready",
          uploadedById: admin.id,
        },
      });
      const chunks = markdown
        .split(/\n## /)
        .map((c, i) => (i === 0 ? c : `## ${c}`).trim())
        .filter(Boolean);
      for (let i = 0; i < chunks.length; i++) {
        const content = chunks[i]!;
        const created = await prisma.documentChunk.create({
          data: {
            documentId: doc.id,
            content,
            chunkIndex: i,
            tokenCount: Math.ceil(content.length / 4),
          },
        });
        // Deterministic mock embedding via SQL-compatible literal
        const { createHash } = await import("crypto");
        const hash = createHash("sha256").update(content).digest();
        const vec = Array.from({ length: 1536 }, (_, idx) => {
          const b = hash[idx % hash.length]!;
          return ((b / 255) * 2 - 1) * 0.2;
        });
        const lit = `[${vec.join(",")}]`;
        await prisma.$executeRawUnsafe(
          `UPDATE "DocumentChunk" SET embedding = $1::vector WHERE id = $2`,
          lit,
          created.id,
        );
      }
    }
  }

  console.log(`Seeded admin ${email} and sample lessons`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
