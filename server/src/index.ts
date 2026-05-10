import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

process.env.DATABASE_URL ??= "file:./dev.db";

const prisma = new PrismaClient();
const app = express();
const port = Number(process.env.PORT ?? 4000);
const clientOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
const jwtSecret = process.env.JWT_SECRET ?? "dev-secret-change-me";
const isProduction = process.env.NODE_ENV === "production";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDistPath = path.resolve(__dirname, "../../client/dist");
const UserRole = { USER: "USER", MODERATOR: "MODERATOR" } as const;
const ContentStatus = { ACTIVE: "ACTIVE", HIDDEN: "HIDDEN" } as const;

type UserRole = (typeof UserRole)[keyof typeof UserRole];

type AuthUser = {
  id: number;
  nickname: string;
  role: UserRole;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const authCookieName = "school_forum_token";

app.use(helmet());
app.use(
  cors({
    origin: clientOrigin,
    credentials: true
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(morgan("dev"));

function signSession(user: AuthUser) {
  return jwt.sign(user, jwtSecret, { expiresIn: "7d" });
}

function setSessionCookie(response: Response, user: AuthUser) {
  response.cookie(authCookieName, signSession(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

async function attachUser(request: Request, _response: Response, next: NextFunction) {
  const token = request.cookies?.[authCookieName];
  if (!token) {
    next();
    return;
  }

  try {
    const payload = jwt.verify(token, jwtSecret) as AuthUser;
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { id: true, nickname: true, role: true }
    });
    if (user) {
      request.user = toAuthUser(user);
    }
  } catch {
    request.user = undefined;
  }

  next();
}

function requireAuth(request: Request, _response: Response, next: NextFunction) {
  if (!request.user) {
    throw new HttpError(401, "Требуется вход в аккаунт.");
  }
  next();
}

function requireModerator(request: Request, _response: Response, next: NextFunction) {
  if (!request.user || request.user.role !== UserRole.MODERATOR) {
    throw new HttpError(403, "Доступно только модератору.");
  }
  next();
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function serializeUser(user: AuthUser) {
  return {
    id: user.id,
    nickname: user.nickname,
    role: user.role
  };
}

function toAuthUser(user: { id: number; nickname: string; role: string }): AuthUser {
  return {
    id: user.id,
    nickname: user.nickname,
    role: user.role === UserRole.MODERATOR ? UserRole.MODERATOR : UserRole.USER
  };
}

const credentialsSchema = z.object({
  nickname: z.string().trim().min(3, "Никнейм должен быть не короче 3 символов.").max(24),
  password: z.string().min(6, "Пароль должен быть не короче 6 символов.").max(128)
});

const createPostSchema = z.object({
  title: z.string().trim().min(3, "Добавьте заголовок.").max(120),
  content: z.string().trim().min(1, "Пост не может быть пустым.").max(6000),
  mediaUrl: z.string().trim().url().max(600).optional().or(z.literal("")),
  categoryId: z.number().int().positive()
});

const commentSchema = z.object({
  content: z.string().trim().min(1, "Комментарий не может быть пустым.").max(2000),
  parentId: z.number().int().positive().optional().nullable()
});

const moderationSchema = z.object({
  status: z.nativeEnum(ContentStatus)
});

app.use(attachUser);

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.post("/api/auth/register", async (request, response, next) => {
  try {
    const payload = credentialsSchema.parse(request.body);
    const nickname = normalizeText(payload.nickname);
    const existing = await prisma.user.findUnique({ where: { nickname } });

    if (existing) {
      throw new HttpError(409, "Такой никнейм уже занят.");
    }

    const passwordHash = await bcrypt.hash(payload.password, 12);
    const user = await prisma.user.create({
      data: { nickname, passwordHash },
      select: { id: true, nickname: true, role: true }
    });

    const sessionUser = toAuthUser(user);
    setSessionCookie(response, sessionUser);
    response.status(201).json({ user: serializeUser(sessionUser) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/login", async (request, response, next) => {
  try {
    const payload = credentialsSchema.parse(request.body);
    const nickname = normalizeText(payload.nickname);
    const user = await prisma.user.findUnique({ where: { nickname } });

    if (!user || !(await bcrypt.compare(payload.password, user.passwordHash))) {
      throw new HttpError(401, "Неверный никнейм или пароль.");
    }

    const sessionUser = toAuthUser(user);
    setSessionCookie(response, sessionUser);
    response.json({ user: serializeUser(sessionUser) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/logout", (_request, response) => {
  response.clearCookie(authCookieName);
  response.status(204).send();
});

app.get("/api/auth/me", (request, response) => {
  response.json({ user: request.user ? serializeUser(request.user) : null });
});

app.get("/api/categories", async (_request, response, next) => {
  try {
    const categories = await prisma.category.findMany({
      where: { parentId: null },
      include: {
        children: {
          orderBy: { title: "asc" }
        }
      },
      orderBy: { id: "asc" }
    });
    response.json({ categories });
  } catch (error) {
    next(error);
  }
});

app.get("/api/posts", async (request, response, next) => {
  try {
    const categorySlug = typeof request.query.category === "string" ? request.query.category : undefined;
    const search = typeof request.query.search === "string" ? request.query.search.trim() : "";
    const includeHidden = request.user?.role === UserRole.MODERATOR && request.query.includeHidden === "true";

    const categoryFilter = categorySlug
      ? {
          category: {
            OR: [{ slug: categorySlug }, { parent: { slug: categorySlug } }]
          }
        }
      : {};

    const posts = await prisma.post.findMany({
      where: {
        ...(includeHidden ? {} : { status: ContentStatus.ACTIVE }),
        ...categoryFilter,
        ...(search
          ? {
              OR: [
                { title: { contains: search } },
                { content: { contains: search } }
              ]
            }
          : {})
      },
      include: {
        author: { select: { id: true, nickname: true, role: true } },
        category: { include: { parent: true } },
        likes: { where: { userId: request.user?.id ?? -1 }, select: { id: true } },
        _count: { select: { likes: true, comments: true } }
      },
      orderBy: [{ createdAt: "desc" }]
    });

    response.json({
      posts: posts.map((post) => ({
        ...post,
        likedByMe: Array.isArray(post.likes) ? post.likes.length > 0 : false,
        likes: undefined
      }))
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/posts", requireAuth, async (request, response, next) => {
  try {
    const payload = createPostSchema.parse(request.body);
    const category = await prisma.category.findUnique({ where: { id: payload.categoryId } });

    if (!category || category.parentId === null) {
      throw new HttpError(400, "Выберите подраздел для публикации.");
    }

    const post = await prisma.post.create({
      data: {
        title: payload.title.trim(),
        content: payload.content.trim(),
        mediaUrl: payload.mediaUrl?.trim() || null,
        categoryId: payload.categoryId,
        authorId: request.user!.id
      },
      include: {
        author: { select: { id: true, nickname: true, role: true } },
        category: { include: { parent: true } },
        _count: { select: { likes: true, comments: true } }
      }
    });

    response.status(201).json({ post: { ...post, likedByMe: false } });
  } catch (error) {
    next(error);
  }
});

app.get("/api/posts/:id", async (request, response, next) => {
  try {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) {
      throw new HttpError(400, "Некорректный идентификатор поста.");
    }

    const includeHidden = request.user?.role === UserRole.MODERATOR;
    const post = await prisma.post.findFirst({
      where: { id, ...(includeHidden ? {} : { status: ContentStatus.ACTIVE }) },
      include: {
        author: { select: { id: true, nickname: true, role: true } },
        category: { include: { parent: true } },
        likes: { where: { userId: request.user?.id ?? -1 }, select: { id: true } },
        comments: {
          where: includeHidden ? {} : { status: ContentStatus.ACTIVE },
          include: { author: { select: { id: true, nickname: true, role: true } } },
          orderBy: { createdAt: "asc" }
        },
        _count: { select: { likes: true, comments: true } }
      }
    });

    if (!post) {
      throw new HttpError(404, "Пост не найден.");
    }

    response.json({
      post: {
        ...post,
        likedByMe: Array.isArray(post.likes) ? post.likes.length > 0 : false,
        likes: undefined
      }
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/posts/:id/comments", requireAuth, async (request, response, next) => {
  try {
    const postId = Number(request.params.id);
    const payload = commentSchema.parse(request.body);

    if (!Number.isInteger(postId)) {
      throw new HttpError(400, "Некорректный идентификатор поста.");
    }

    const post = await prisma.post.findFirst({ where: { id: postId, status: ContentStatus.ACTIVE } });
    if (!post) {
      throw new HttpError(404, "Пост не найден.");
    }

    if (payload.parentId) {
      const parent = await prisma.comment.findFirst({
        where: { id: payload.parentId, postId, status: ContentStatus.ACTIVE }
      });
      if (!parent) {
        throw new HttpError(400, "Комментарий для ответа не найден.");
      }
    }

    const comment = await prisma.comment.create({
      data: {
        postId,
        parentId: payload.parentId ?? null,
        authorId: request.user!.id,
        content: payload.content.trim()
      },
      include: { author: { select: { id: true, nickname: true, role: true } } }
    });

    response.status(201).json({ comment });
  } catch (error) {
    next(error);
  }
});

app.post("/api/posts/:id/like", requireAuth, async (request, response, next) => {
  try {
    const postId = Number(request.params.id);
    if (!Number.isInteger(postId)) {
      throw new HttpError(400, "Некорректный идентификатор поста.");
    }

    const post = await prisma.post.findFirst({ where: { id: postId, status: ContentStatus.ACTIVE } });
    if (!post) {
      throw new HttpError(404, "Пост не найден.");
    }

    await prisma.like.upsert({
      where: { userId_postId: { userId: request.user!.id, postId } },
      update: {},
      create: { userId: request.user!.id, postId }
    });

    const likes = await prisma.like.count({ where: { postId } });
    response.json({ likedByMe: true, likes });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/posts/:id/like", requireAuth, async (request, response, next) => {
  try {
    const postId = Number(request.params.id);
    if (!Number.isInteger(postId)) {
      throw new HttpError(400, "Некорректный идентификатор поста.");
    }

    await prisma.like.deleteMany({ where: { userId: request.user!.id, postId } });
    const likes = await prisma.like.count({ where: { postId } });
    response.json({ likedByMe: false, likes });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/moderation/posts/:id", requireModerator, async (request, response, next) => {
  try {
    const id = Number(request.params.id);
    const payload = moderationSchema.parse(request.body);
    const post = await prisma.post.update({
      where: { id },
      data: { status: payload.status },
      include: {
        author: { select: { id: true, nickname: true, role: true } },
        category: { include: { parent: true } },
        _count: { select: { likes: true, comments: true } }
      }
    });

    response.json({ post });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/moderation/comments/:id", requireModerator, async (request, response, next) => {
  try {
    const id = Number(request.params.id);
    const payload = moderationSchema.parse(request.body);
    const comment = await prisma.comment.update({
      where: { id },
      data: { status: payload.status },
      include: { author: { select: { id: true, nickname: true, role: true } } }
    });

    response.json({ comment });
  } catch (error) {
    next(error);
  }
});

app.use("/api", (_request, response) => {
  response.status(404).json({ message: "API route not found." });
});

app.use(express.static(clientDistPath));

app.get("*", (_request, response) => {
  response.sendFile(path.join(clientDistPath, "index.html"));
});

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  if (error instanceof z.ZodError) {
    response.status(400).json({ message: error.errors[0]?.message ?? "Некорректные данные." });
    return;
  }

  if (error instanceof HttpError) {
    response.status(error.status).json({ message: error.message });
    return;
  }

  console.error(error);
  response.status(500).json({ message: "Внутренняя ошибка сервера." });
});

app.listen(port, () => {
  console.log(`School forum API is listening on http://localhost:${port}`);
});
