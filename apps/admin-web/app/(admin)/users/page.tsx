import React from "react";
import { UsersList } from "./UsersList";
import { adminFetch } from "../../../lib/adminFetch";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

async function getUsers() {
  try {
    const res = await adminFetch(`${API_BASE}/api/v1/admin/users`);
    if (!res.ok) throw new Error("users");
    const data = await res.json();
    return data.users ?? [];
  } catch {
    return [];
  }
}

export default async function UsersPage() {
  const users = await getUsers();
  return <UsersList initialUsers={users} apiBase={API_BASE} />;
}
