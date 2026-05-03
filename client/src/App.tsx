import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  EyeOff,
  Heart,
  LogIn,
  LogOut,
  MessageCircle,
  Palette,
  Plus,
  Reply,
  Search,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserPlus
} from "lucide-react";
import { api } from "./api";
import type { Category, Comment, ContentStatus, Post, User } from "./types";

const sectionIcons: Record<string, JSX.Element> = {
  study: <BookOpen size={20} />,
  "after-school": <Trophy size={20} />,
  announcements: <CalendarDays size={20} />,
  creativity: <Palette size={20} />
};

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedPostId, setSelectedPostId] = useState<number | null>(null);
  const [selectedPost, setSelectedPost] = useState<(Post & { comments: Comment[] }) | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [search, setSearch] = useState("");
  const [showComposer, setShowComposer] = useState(false);
  const [includeHidden, setIncludeHidden] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const isModerator = user?.role === "MODERATOR";

  useEffect(() => {
    Promise.all([api.me(), api.categories()])
      .then(([me, categoryData]) => {
        setUser(me.user);
        setCategories(categoryData.categories);
      })
      .catch((error) => setMessage(error.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refreshPosts();
  }, [selectedCategory, includeHidden, user?.id]);

  useEffect(() => {
    if (!selectedPostId) {
      setSelectedPost(null);
      return;
    }

    api
      .post(selectedPostId)
      .then((data) => setSelectedPost(data.post))
      .catch((error) => {
        setMessage(error.message);
        setSelectedPostId(null);
      });
  }, [selectedPostId, user?.id]);

  const flatCategories = useMemo(
    () => categories.flatMap((category) => category.children ?? []),
    [categories]
  );

  async function refreshPosts(nextSearch = search) {
    try {
      const data = await api.posts({
        category: selectedCategory,
        search: nextSearch,
        includeHidden: isModerator && includeHidden
      });
      setPosts(data.posts);
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function submitAuth(event: FormEvent) {
    event.preventDefault();
    setMessage("");

    try {
      const payload = { nickname, password };
      const data = authMode === "login" ? await api.login(payload) : await api.register(payload);
      setUser(data.user);
      setNickname("");
      setPassword("");
      setMessage(authMode === "login" ? "Вы вошли в аккаунт." : "Аккаунт создан.");
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function logout() {
    await api.logout();
    setUser(null);
    setSelectedPost(null);
    setSelectedPostId(null);
    setMessage("Вы вышли из аккаунта.");
  }

  async function toggleLike(post: Post) {
    if (!user) {
      setMessage("Войдите, чтобы ставить лайки.");
      return;
    }

    const data = post.likedByMe ? await api.unlike(post.id) : await api.like(post.id);
    setPosts((current) =>
      current.map((item) =>
        item.id === post.id
          ? { ...item, likedByMe: data.likedByMe, _count: { ...item._count, likes: data.likes } }
          : item
      )
    );

    if (selectedPost?.id === post.id) {
      setSelectedPost({
        ...selectedPost,
        likedByMe: data.likedByMe,
        _count: { ...selectedPost._count, likes: data.likes }
      });
    }
  }

  async function moderatePost(post: Post, status: ContentStatus) {
    await api.moderatePost(post.id, status);
    await refreshPosts();
    if (selectedPost?.id === post.id) {
      const data = await api.post(post.id);
      setSelectedPost(data.post);
    }
  }

  async function moderateComment(comment: Comment, status: ContentStatus) {
    await api.moderateComment(comment.id, status);
    if (selectedPost) {
      const data = await api.post(selectedPost.id);
      setSelectedPost(data.post);
    }
  }

  function selectCategory(slug: string | null) {
    setSelectedCategory(slug);
    setSelectedPostId(null);
  }

  if (loading) {
    return <main className="loading">Загружаем форум...</main>;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => selectCategory(null)}>
          <Sparkles size={24} />
          <span>SchoolHub</span>
        </button>
        <div className="search">
          <Search size={18} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") refreshPosts(event.currentTarget.value);
            }}
            placeholder="Поиск по форуму"
          />
        </div>
        <div className="top-actions">
          {user ? (
            <>
              <span className="user-pill">{user.nickname}</span>
              <button className="icon-button" onClick={logout} title="Выйти">
                <LogOut size={18} />
              </button>
            </>
          ) : (
            <span className="guest-pill">Гость</span>
          )}
        </div>
      </header>

      {message && (
        <button className="toast" onClick={() => setMessage("")}>
          {message}
        </button>
      )}

      <main className="layout">
        <aside className="sidebar">
          <div className="sidebar-head">
            <span>Разделы</span>
            {isModerator && <ShieldCheck size={18} />}
          </div>
          <button className={!selectedCategory ? "nav-item active" : "nav-item"} onClick={() => selectCategory(null)}>
            <MessageCircle size={18} />
            Все обсуждения
          </button>
          {categories.map((category) => (
            <div className="section-group" key={category.id}>
              <div className="section-title">
                {sectionIcons[category.slug] ?? <BookOpen size={20} />}
                <span>{category.title}</span>
              </div>
              {(category.children ?? []).map((child) => (
                <button
                  key={child.id}
                  className={selectedCategory === child.slug ? "nav-item active child" : "nav-item child"}
                  onClick={() => selectCategory(child.slug)}
                >
                  {child.title}
                </button>
              ))}
            </div>
          ))}
        </aside>

        <section className="feed">
          <div className="feed-head">
            <div>
              <h1>{selectedCategory ? flatCategories.find((item) => item.slug === selectedCategory)?.title : "Живая лента школы"}</h1>
              <p>Вопросы, идеи, объявления и творческие работы в одном безопасном пространстве.</p>
            </div>
            <div className="feed-actions">
              {isModerator && (
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={includeHidden}
                    onChange={(event) => setIncludeHidden(event.target.checked)}
                  />
                  Скрытое
                </label>
              )}
              <button className="primary-button" onClick={() => setShowComposer((current) => !current)}>
                <Plus size={18} />
                Пост
              </button>
            </div>
          </div>

          {showComposer && (
            <Composer
              categories={flatCategories}
              selectedCategory={selectedCategory}
              signedIn={Boolean(user)}
              onCreated={async (post) => {
                setShowComposer(false);
                await refreshPosts();
                setSelectedPostId(post.id);
              }}
              onMessage={setMessage}
            />
          )}

          <div className="post-list">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                isSelected={selectedPostId === post.id}
                isModerator={isModerator}
                onOpen={() => setSelectedPostId(post.id)}
                onLike={() => toggleLike(post)}
                onModerate={(status) => moderatePost(post, status)}
              />
            ))}
            {!posts.length && <div className="empty-state">Пока здесь тихо. Самое время начать обсуждение.</div>}
          </div>
        </section>

        <aside className="detail">
          {selectedPost ? (
            <PostDetail
              post={selectedPost}
              signedIn={Boolean(user)}
              isModerator={isModerator}
              onLike={() => toggleLike(selectedPost)}
              onComment={async (content, parentId) => {
                const comment = await api.comment(selectedPost.id, { content, parentId });
                setSelectedPost({
                  ...selectedPost,
                  comments: [...selectedPost.comments, comment.comment],
                  _count: { ...selectedPost._count, comments: selectedPost._count.comments + 1 }
                });
                setPosts((current) =>
                  current.map((post) =>
                    post.id === selectedPost.id
                      ? { ...post, _count: { ...post._count, comments: post._count.comments + 1 } }
                      : post
                  )
                );
              }}
              onModerateComment={moderateComment}
              onMessage={setMessage}
            />
          ) : (
            <AuthPanel
              user={user}
              authMode={authMode}
              setAuthMode={setAuthMode}
              nickname={nickname}
              setNickname={setNickname}
              password={password}
              setPassword={setPassword}
              onSubmit={submitAuth}
            />
          )}
        </aside>
      </main>
    </div>
  );
}

function Composer({
  categories,
  selectedCategory,
  signedIn,
  onCreated,
  onMessage
}: {
  categories: Category[];
  selectedCategory: string | null;
  signedIn: boolean;
  onCreated: (post: Post) => void;
  onMessage: (message: string) => void;
}) {
  const initialCategory = categories.find((category) => category.slug === selectedCategory)?.id ?? categories[0]?.id ?? 0;
  const [categoryId, setCategoryId] = useState(initialCategory);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!signedIn) {
      onMessage("Войдите, чтобы создать пост.");
      return;
    }
    if (!title.trim() || !content.trim()) {
      onMessage("Заполните заголовок и текст поста.");
      return;
    }

    try {
      const data = await api.createPost({ categoryId, title, content, mediaUrl });
      onCreated(data.post);
    } catch (error) {
      onMessage((error as Error).message);
    }
  }

  return (
    <form className="composer" onSubmit={submit}>
      <select value={categoryId} onChange={(event) => setCategoryId(Number(event.target.value))}>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.title}
          </option>
        ))}
      </select>
      <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Заголовок" maxLength={120} />
      <textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="Что обсудим?" rows={5} />
      <input value={mediaUrl} onChange={(event) => setMediaUrl(event.target.value)} placeholder="Ссылка на изображение или проект" />
      <button className="primary-button" type="submit">
        <Plus size={18} />
        Опубликовать
      </button>
    </form>
  );
}

function PostCard({
  post,
  isSelected,
  isModerator,
  onOpen,
  onLike,
  onModerate
}: {
  post: Post;
  isSelected: boolean;
  isModerator: boolean;
  onOpen: () => void;
  onLike: () => void;
  onModerate: (status: ContentStatus) => void;
}) {
  return (
    <article className={isSelected ? "post-card selected" : "post-card"}>
      <button className="post-main" onClick={onOpen}>
        <div className="post-meta">
          <span>{post.category.parent?.title ?? post.category.title}</span>
          <span>{new Date(post.createdAt).toLocaleDateString("ru-RU")}</span>
          {post.status === "HIDDEN" && <span className="status-badge">Скрыто</span>}
        </div>
        <h2>{post.title}</h2>
        <p>{post.content}</p>
      </button>
      <div className="post-actions">
        <button className={post.likedByMe ? "action liked" : "action"} onClick={onLike}>
          <Heart size={18} fill={post.likedByMe ? "currentColor" : "none"} />
          {post._count.likes}
        </button>
        <button className="action" onClick={onOpen}>
          <MessageCircle size={18} />
          {post._count.comments}
        </button>
        {isModerator && (
          <button className="action danger" onClick={() => onModerate(post.status === "ACTIVE" ? "HIDDEN" : "ACTIVE")}>
            <EyeOff size={18} />
            {post.status === "ACTIVE" ? "Скрыть" : "Вернуть"}
          </button>
        )}
      </div>
    </article>
  );
}

function PostDetail({
  post,
  signedIn,
  isModerator,
  onLike,
  onComment,
  onModerateComment,
  onMessage
}: {
  post: Post & { comments: Comment[] };
  signedIn: boolean;
  isModerator: boolean;
  onLike: () => void;
  onComment: (content: string, parentId?: number | null) => Promise<void>;
  onModerateComment: (comment: Comment, status: ContentStatus) => void;
  onMessage: (message: string) => void;
}) {
  const [content, setContent] = useState("");
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const commentTree = useMemo(() => buildCommentTree(post.comments), [post.comments]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!signedIn) {
      onMessage("Войдите, чтобы комментировать.");
      return;
    }
    if (!content.trim()) {
      onMessage("Комментарий не может быть пустым.");
      return;
    }

    await onComment(content, replyTo);
    setContent("");
    setReplyTo(null);
  }

  return (
    <div className="detail-card">
      <div className="post-meta">
        <span>{post.category.title}</span>
        <span>{post.author.nickname}</span>
      </div>
      <h2>{post.title}</h2>
      {post.mediaUrl && (
        <a className="media-link" href={post.mediaUrl} target="_blank" rel="noreferrer">
          Открыть материал
        </a>
      )}
      <p className="post-body">{post.content}</p>
      <button className={post.likedByMe ? "action liked" : "action"} onClick={onLike}>
        <Heart size={18} fill={post.likedByMe ? "currentColor" : "none"} />
        {post._count.likes}
      </button>

      <form className="comment-form" onSubmit={submit}>
        {replyTo && <span className="reply-note">Ответ на комментарий #{replyTo}</span>}
        <textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="Ваш комментарий" rows={3} />
        <button className="primary-button" type="submit">
          <MessageCircle size={18} />
          Отправить
        </button>
      </form>

      <div className="comments">
        {commentTree.map((comment) => (
          <CommentNode
            key={comment.id}
            comment={comment}
            isModerator={isModerator}
            onReply={setReplyTo}
            onModerate={onModerateComment}
          />
        ))}
        {!commentTree.length && <p className="muted">Комментариев пока нет.</p>}
      </div>
    </div>
  );
}

type CommentNodeType = Comment & { children: CommentNodeType[] };

function buildCommentTree(comments: Comment[]) {
  const map = new Map<number, CommentNodeType>();
  const roots: CommentNodeType[] = [];

  for (const comment of comments) {
    map.set(comment.id, { ...comment, children: [] });
  }

  for (const comment of map.values()) {
    if (comment.parentId && map.has(comment.parentId)) {
      map.get(comment.parentId)!.children.push(comment);
    } else {
      roots.push(comment);
    }
  }

  return roots;
}

function CommentNode({
  comment,
  isModerator,
  onReply,
  onModerate
}: {
  comment: CommentNodeType;
  isModerator: boolean;
  onReply: (id: number) => void;
  onModerate: (comment: Comment, status: ContentStatus) => void;
}) {
  return (
    <div className={comment.status === "HIDDEN" ? "comment hidden" : "comment"}>
      <div className="comment-head">
        <strong>{comment.author.nickname}</strong>
        <span>{new Date(comment.createdAt).toLocaleString("ru-RU")}</span>
      </div>
      <p>{comment.status === "HIDDEN" ? "Комментарий скрыт модератором." : comment.content}</p>
      <div className="comment-actions">
        <button className="text-button" onClick={() => onReply(comment.id)}>
          <Reply size={16} />
          Ответить
        </button>
        {isModerator && (
          <button className="text-button danger" onClick={() => onModerate(comment, comment.status === "ACTIVE" ? "HIDDEN" : "ACTIVE")}>
            <EyeOff size={16} />
            {comment.status === "ACTIVE" ? "Скрыть" : "Вернуть"}
          </button>
        )}
      </div>
      {comment.children.map((child) => (
        <CommentNode key={child.id} comment={child} isModerator={isModerator} onReply={onReply} onModerate={onModerate} />
      ))}
    </div>
  );
}

function AuthPanel({
  user,
  authMode,
  setAuthMode,
  nickname,
  setNickname,
  password,
  setPassword,
  onSubmit
}: {
  user: User | null;
  authMode: "login" | "register";
  setAuthMode: (mode: "login" | "register") => void;
  nickname: string;
  setNickname: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  if (user) {
    return (
      <div className="detail-card calm">
        <ShieldCheck size={28} />
        <h2>Вы в системе</h2>
        <p>Можно создавать посты, отвечать в обсуждениях и отмечать полезные материалы лайками.</p>
      </div>
    );
  }

  return (
    <form className="auth-card" onSubmit={onSubmit}>
      <div className="auth-tabs">
        <button type="button" className={authMode === "login" ? "active" : ""} onClick={() => setAuthMode("login")}>
          <LogIn size={18} />
          Вход
        </button>
        <button type="button" className={authMode === "register" ? "active" : ""} onClick={() => setAuthMode("register")}>
          <UserPlus size={18} />
          Регистрация
        </button>
      </div>
      <input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="Никнейм" />
      <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Пароль" type="password" />
      <button className="primary-button" type="submit">
        {authMode === "login" ? <LogIn size={18} /> : <UserPlus size={18} />}
        {authMode === "login" ? "Войти" : "Создать аккаунт"}
      </button>
    </form>
  );
}

export default App;
