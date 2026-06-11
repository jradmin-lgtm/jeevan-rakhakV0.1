import React from "react";
import { LoginForm } from "./LoginForm";
import { LoginAmbience, GetAppPanel } from "../login-extras";

export default function AdminLoginPage() {
  return (
    <>
      <LoginAmbience />
      <LoginForm />
      <GetAppPanel />
    </>
  );
}
