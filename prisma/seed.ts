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
