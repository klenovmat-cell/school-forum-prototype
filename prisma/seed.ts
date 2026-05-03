import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const UserRole = { MODERATOR: "MODERATOR" } as const;
const CategoryType = { SECTION: "SECTION", SUBSECTION: "SUBSECTION" } as const;

const structure = [
  {
    title: "Учебная часть",
    slug: "study",
    children: [
      ["Подготовка к экзаменам", "exam-prep"],
      ["Помощь с ДЗ", "homework-help"]
    ]
  },
  {
    title: "Внеурочная деятельность",
    slug: "after-school",
    children: [
      ["Спортивные секции", "sports"],
      ["Медиацентр", "media-center"]
    ]
  },
  {
    title: "Объявления",
    slug: "announcements",
    children: [
      ["Потерянные вещи", "lost-and-found"],
      ["Важные даты", "important-dates"],
      ["Изменения в расписании", "schedule-changes"]
    ]
  },
  {
    title: "Творчество",
    slug: "creativity",
    children: [
      ["Галерея", "gallery"],
      ["Стихи", "poems"],
      ["Рисунки", "drawings"],
      ["Школьные проекты", "school-projects"]
    ]
  }
];

async function main() {
  const passwordHash = await bcrypt.hash("moderator123", 12);

  await prisma.user.upsert({
    where: { nickname: "moderator" },
    update: { role: UserRole.MODERATOR },
    create: {
      nickname: "moderator",
      passwordHash,
      role: UserRole.MODERATOR
    }
  });

  for (const section of structure) {
    const parent = await prisma.category.upsert({
      where: { slug: section.slug },
      update: { title: section.title, type: CategoryType.SECTION },
      create: {
        title: section.title,
        slug: section.slug,
        type: CategoryType.SECTION
      }
    });

    for (const [title, slug] of section.children) {
      await prisma.category.upsert({
        where: { slug },
        update: { title, parentId: parent.id, type: CategoryType.SUBSECTION },
        create: {
          title,
          slug,
          type: CategoryType.SUBSECTION,
          parentId: parent.id
        }
      });
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
