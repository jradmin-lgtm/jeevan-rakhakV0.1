import React from "react";
import { UsersList } from "./UsersList";
import { adminFetch } from "../../../lib/adminFetch";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

async function getUsers() {
  try {
    const res = await adminFetch(`${API_BASE}/api/v1/admin/users?limit=100`);
    if (!res.ok) throw new Error("users");
    const data = await res.json();
    return { users: data.users, error: "" };
  } catch (error) {
    console.error("User list load failed", error);
    return { users: [], error: "User records could not be loaded. Retrying automatically." };
  }
}

export default async function UsersPage() {
  const { users, error } = await getUsers();
  return <UsersList initialUsers={users} initialError={error} apiBase={API_BASE} />;
}
