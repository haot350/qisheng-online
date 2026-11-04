import type {AccountAvatarImage,AvatarId} from './accounts.ts';
export type BlogNode={type:string;text?:string;attrs?:Record<string,unknown>;marks?:{type:string;attrs?:Record<string,unknown>}[];content?:BlogNode[]};
export type BlogPostSummary={id:string;slug:string;title:string;excerpt:string;category:string;author:string;cover:string|null;publishedAt:number|null;updatedAt:number;revision:number;commentsEnabled:boolean;url:string};
export type BlogPost=BlogPostSummary&{document:BlogNode;html:string;related:BlogPostSummary[]};
export type BlogPostPage={items:BlogPostSummary[];page:number;pageSize:number;total:number;categories:string[]};
export type BlogComment={id:string;postId:string;postSlug:string;parentId:string|null;body:string;state:'published'|'hidden'|'deleted';official:boolean;author:string;createdAt:number;updatedAt:number;own:boolean;avatar:AvatarId;avatarImage?:AccountAvatarImage;replyCount?:number};
export type BlogCommentPage={items:BlogComment[];page:number;pageSize:number;total:number;commentsEnabled?:boolean};
