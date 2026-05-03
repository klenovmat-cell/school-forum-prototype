export type UserRole = "USER" | "MODERATOR";
export type ContentStatus = "ACTIVE" | "HIDDEN";

export type User = {
  id: number;
  nickname: string;
  role: UserRole;
};

export type Category = {
  id: number;
  title: string;
  slug: string;
  type: "SECTION" | "SUBSECTION" | "TOPIC";
  parentId: number | null;
  children?: Category[];
  parent?: Category | null;
};

export type Post = {
  id: number;
  authorId: number;
  categoryId: number;
  title: string;
  content: string;
  mediaUrl: string | null;
  status: ContentStatus;
  createdAt: string;
  updatedAt: string;
  author: User;
  category: Category;
  likedByMe: boolean;
  _count: {
    likes: number;
    comments: number;
  };
};

export type Comment = {
  id: number;
  postId: number;
  authorId: number;
  parentId: number | null;
  content: string;
  status: ContentStatus;
  createdAt: string;
  author: User;
};
