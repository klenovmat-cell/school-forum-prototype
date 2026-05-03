import type { Category, Comment, ContentStatus, Post, User } from "./types";

const headers = {
  "Content-Type": "application/json"
};

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.message ?? "Запрос не выполнен.");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  me: () => request<{ user: User | null }>("/api/auth/me"),
  register: (payload: { nickname: string; password: string }) =>
    request<{ user: User }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  login: (payload: { nickname: string; password: string }) =>
    request<{ user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  logout: () =>
    request<void>("/api/auth/logout", {
      method: "POST"
    }),
  categories: () => request<{ categories: Category[] }>("/api/categories"),
  posts: (params: { category?: string | null; search?: string; includeHidden?: boolean }) => {
    const search = new URLSearchParams();
    if (params.category) search.set("category", params.category);
    if (params.search) search.set("search", params.search);
    if (params.includeHidden) search.set("includeHidden", "true");
    const query = search.toString();
    return request<{ posts: Post[] }>(`/api/posts${query ? `?${query}` : ""}`);
  },
  createPost: (payload: { title: string; content: string; mediaUrl?: string; categoryId: number }) =>
    request<{ post: Post }>("/api/posts", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  post: (id: number) => request<{ post: Post & { comments: Comment[] } }>(`/api/posts/${id}`),
  comment: (postId: number, payload: { content: string; parentId?: number | null }) =>
    request<{ comment: Comment }>(`/api/posts/${postId}/comments`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  like: (postId: number) =>
    request<{ likedByMe: boolean; likes: number }>(`/api/posts/${postId}/like`, {
      method: "POST"
    }),
  unlike: (postId: number) =>
    request<{ likedByMe: boolean; likes: number }>(`/api/posts/${postId}/like`, {
      method: "DELETE"
    }),
  moderatePost: (id: number, status: ContentStatus) =>
    request<{ post: Post }>(`/api/moderation/posts/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    }),
  moderateComment: (id: number, status: ContentStatus) =>
    request<{ comment: Comment }>(`/api/moderation/comments/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    })
};

function request<T>(url: string, init: RequestInit = {}) {
  return fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      ...headers,
      ...init.headers
    }
  }).then(parseResponse<T>);
}
